import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { fromISODate, toISODate } from "@/domain/dates";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { env } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { recordAudit } from "@/modules/audit/audit";
import { auth } from "@/modules/auth/auth";
import type { CurrentUser } from "@/modules/auth/session";
import type { ParticipantInput } from "./schemas";

const ANONYMIZED = "Cadastro anonimizado (LGPD): não pode ser alterado nem reativado.";

function snapshot(p: { fullName: string; email: string; phone: string | null; joinedAt: Date; status: string }) {
  return { fullName: p.fullName, email: p.email, phone: p.phone, joinedAt: toISODate(p.joinedAt), status: p.status };
}

export async function createParticipant(actor: CurrentUser, input: ParticipantInput) {
  try {
    return await db.$transaction(async (tx) => {
      const participant = await tx.participant.create({
        data: {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          joinedAt: fromISODate(input.joinedAt),
          caixinhaId: actor.caixinhaId ?? null,
        },
      });
      await recordAudit(
        {
          actorId: actor.userId,
          action: "participant.create",
          entityType: "Participant",
          entityId: participant.id,
          after: snapshot(participant),
        },
        tx,
      );
      return participant;
    });
  } catch (e) {
    if (isUniqueViolation(e, "email")) throw new DomainError("Já existe um participante com este e-mail.");
    throw e;
  }
}

export async function updateParticipant(actor: CurrentUser, id: string, input: ParticipantInput) {
  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.participant.findFirst({
        where: { id, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
      });
      if (!before) throw new DomainError("Participante não encontrado.");
      if (before.anonymizedAt) throw new DomainError(ANONYMIZED);

      const after = await tx.participant.update({
        where: { id },
        data: {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          joinedAt: fromISODate(input.joinedAt),
        },
      });
      // E-mail de acesso acompanha o cadastro.
      if (before.userId && before.email !== after.email) {
        await tx.user.update({ where: { id: before.userId }, data: { email: after.email, emailVerified: false } });
      }
      if (before.userId && before.fullName !== after.fullName) {
        await tx.user.update({ where: { id: before.userId }, data: { name: after.fullName } });
      }
      await recordAudit(
        {
          actorId: actor.userId,
          action: "participant.update",
          entityType: "Participant",
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
  } catch (e) {
    if (isUniqueViolation(e, "email")) throw new DomainError("Este e-mail já está em uso por outro cadastro.");
    throw e;
  }
}

export async function setParticipantStatus(
  actor: CurrentUser,
  id: string,
  status: "ACTIVE" | "INACTIVE",
  reason: string,
) {
  return db.$transaction(async (tx) => {
    const before = await tx.participant.findFirst({
      where: { id, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
    });
    if (!before) throw new DomainError("Participante não encontrado.");
    if (before.anonymizedAt) throw new DomainError(ANONYMIZED);
    if (before.status === status) return before;
    const after = await tx.participant.update({ where: { id }, data: { status } });
    // Inativar o cadastro também suspende o acesso.
    if (status === "INACTIVE" && before.userId) {
      await tx.user.update({ where: { id: before.userId }, data: { status: "SUSPENDED" } });
      await tx.session.deleteMany({ where: { userId: before.userId } });
    }
    await recordAudit(
      {
        actorId: actor.userId,
        action: "participant.status",
        entityType: "Participant",
        entityId: id,
        before: { status: before.status },
        after: { status },
        reason,
      },
      tx,
    );
    return after;
  });
}

/**
 * Libera o acesso do participante: cria (ou reativa) o usuário e envia por e-mail
 * o link para ele definir a própria senha. Ninguém mais conhece a senha.
 */
export async function grantAccess(actor: CurrentUser, participantId: string) {
  const participant = await db.participant.findFirst({
    where: { id: participantId, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
    include: { user: true },
  });
  if (!participant) throw new DomainError("Participante não encontrado.");
  if (participant.anonymizedAt) throw new DomainError(ANONYMIZED);
  if (participant.status !== "ACTIVE") throw new DomainError("Ative o cadastro antes de liberar o acesso.");

  await db.$transaction(async (tx) => {
    if (participant.user) {
      if (participant.user.status !== "ACTIVE") {
        await tx.user.update({ where: { id: participant.user.id }, data: { status: "ACTIVE" } });
      }
      if (actor.caixinhaId) {
        await tx.caixinhaMember.upsert({
          where: { caixinhaId_userId: { caixinhaId: actor.caixinhaId, userId: participant.user.id } },
          create: { caixinhaId: actor.caixinhaId, userId: participant.user.id, role: "PARTICIPANT" },
          update: { role: "PARTICIPANT" },
        });
      }
    } else {
      const existing = await tx.user.findUnique({ where: { email: participant.email } });
      if (existing) {
        // Ex.: administrador que também participa — apenas vincula.
        const linked = await tx.participant.findFirst({ where: { userId: existing.id } });
        if (linked) throw new DomainError("Este e-mail já está vinculado a outro participante.");
        await tx.participant.update({ where: { id: participantId }, data: { userId: existing.id } });
        if (actor.caixinhaId) {
          await tx.caixinhaMember.upsert({
            where: { caixinhaId_userId: { caixinhaId: actor.caixinhaId, userId: existing.id } },
            create: { caixinhaId: actor.caixinhaId, userId: existing.id, role: "PARTICIPANT" },
            update: { role: "PARTICIPANT" },
          });
        }
      } else {
        const userId = randomUUID();
        await tx.user.create({
          data: {
            id: userId,
            name: participant.fullName,
            email: participant.email,
            role: "PARTICIPANT",
            accounts: {
              create: {
                id: randomUUID(),
                accountId: userId,
                providerId: "credential",
                // Senha aleatória e descartada: o participante define a dele pelo link.
                password: await hashPassword(randomBytes(32).toString("base64url")),
              },
            },
          },
        });
        await tx.participant.update({ where: { id: participantId }, data: { userId } });
        if (actor.caixinhaId) {
          await tx.caixinhaMember.create({
            data: { caixinhaId: actor.caixinhaId, userId, role: "PARTICIPANT" },
          });
        }
      }
    }
    await recordAudit(
      { actorId: actor.userId, action: "participant.grant_access", entityType: "Participant", entityId: participantId },
      tx,
    );
  });

  await auth.api.requestPasswordReset({
    body: { email: participant.email, redirectTo: `${env.BETTER_AUTH_URL}/redefinir-senha` },
  });
}

export async function suspendAccess(actor: CurrentUser, participantId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const participant = await tx.participant.findFirst({
      where: { id: participantId, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
    });
    if (!participant?.userId) throw new DomainError("Este participante não tem acesso ao sistema.");
    if (participant.userId === actor.userId) throw new DomainError("Você não pode suspender o próprio acesso.");
    await tx.user.update({ where: { id: participant.userId }, data: { status: "SUSPENDED" } });
    await tx.session.deleteMany({ where: { userId: participant.userId } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "participant.suspend_access",
        entityType: "Participant",
        entityId: participantId,
        reason,
      },
      tx,
    );
  });
}

/** O participante altera apenas os campos pessoais liberados (telefone). */
export async function updateOwnProfile(actor: CurrentUser, input: { phone: string | null }) {
  if (!actor.participantId) throw new DomainError("Seu acesso não está vinculado a um cadastro de participante.");
  const participantId = actor.participantId;
  return db.$transaction(async (tx) => {
    const before = await tx.participant.findUniqueOrThrow({ where: { id: participantId } });
    const after = await tx.participant.update({ where: { id: participantId }, data: { phone: input.phone } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "participant.self_update",
        entityType: "Participant",
        entityId: participantId,
        before: { phone: before.phone },
        after: { phone: after.phone },
      },
      tx,
    );
    return after;
  });
}

export async function listParticipants(filter: { q?: string; status?: string }, caixinhaId?: string | null) {
  const where: Prisma.ParticipantWhereInput = caixinhaId ? { caixinhaId } : {};
  if (filter.q) {
    const q = filter.q.trim();
    const digits = q.replace(/\D/g, "");
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
    ];
  }
  if (filter.status === "ACTIVE" || filter.status === "INACTIVE" || filter.status === "LEFT")
    where.status = filter.status;

  return db.participant.findMany({
    where,
    orderBy: { fullName: "asc" },
    take: 500,
    include: {
      user: { select: { status: true } },
      memberships: {
        where: { cycle: { status: { in: ["DRAFT", "OPEN", "CONTRIBUTIONS_CLOSED", "SETTLING"] } } },
        select: { quotaCount: true, quotaValueCents: true, cycle: { select: { name: true } } },
      },
    },
  });
}

export async function getParticipant(id: string, caixinhaId?: string | null) {
  return db.participant.findFirst({
    where: { id, ...(caixinhaId ? { caixinhaId } : {}) },
    include: {
      user: { select: { id: true, status: true, role: true, email: true } },
      memberships: {
        orderBy: { createdAt: "desc" },
        include: { cycle: { select: { id: true, name: true, status: true } } },
      },
    },
  });
}
