/**
 * LGPD: exportação dos dados do titular e anonimização (preservando o histórico financeiro).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/modules/auth/session";
import { addMembership, createCycle, openCycle, publishRules } from "@/modules/cycles/service";
import { grantAccess, setParticipantStatus } from "@/modules/participants/service";
import { registerPayment } from "@/modules/payments/service";
import { anonymizationBlockers, anonymizeParticipant, exportParticipantData } from "@/modules/privacy/service";

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("LGPD (integração)", () => {
  let admin: CurrentUser;
  let titular: CurrentUser;
  let cycleId: string;
  let membershipId: string;

  beforeAll(async () => {
    const adminId = randomUUID();
    await db.user.create({
      data: {
        id: adminId,
        name: "Admin LGPD",
        email: `${adminId.slice(0, 8)}@lgpd.local`,
        role: "ADMIN",
        twoFactorEnabled: true,
      },
    });
    admin = { userId: adminId, name: "Admin LGPD", email: "", role: "ADMIN", status: "ACTIVE", participantId: null };

    const userId = randomUUID();
    const email = `titular.${userId.slice(0, 6)}@lgpd.local`;
    await db.user.create({ data: { id: userId, name: "Titular Teste", email, role: "PARTICIPANT" } });
    await db.account.create({
      data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: "hash-de-teste" },
    });
    const p = await db.participant.create({
      data: {
        fullName: "Titular Teste",
        email,
        phone: "11912345678",
        joinedAt: new Date("2026-12-01T00:00:00Z"),
        userId,
      },
    });
    titular = { userId, name: "Titular Teste", email, role: "PARTICIPANT", status: "ACTIVE", participantId: p.id };

    cycleId = (
      await createCycle(admin, {
        name: "LGPD 2026/27",
        startDate: "2026-12-01",
        contributionEndDate: "2027-11-30",
        settlementDate: "2027-12-15",
        dueDay: 10,
        adminFeePercent: 1000,
        quotaValues: [10_000],
        rulesText: "",
      })
    ).id;
    membershipId = (
      await addMembership(admin, cycleId, {
        participantId: p.id,
        quotaCount: 1,
        quotaValueCents: 10_000,
        joinedAt: "2026-12-01",
      })
    ).id;
    await publishRules(admin, cycleId);
    await openCycle(admin, cycleId);
    await registerPayment(
      admin,
      {
        membershipId,
        amountCents: 10_000,
        receivedAt: "2026-12-05",
        method: "PIX_MANUAL",
        transactionRef: `E${randomUUID().slice(0, 20)}`,
        notes: null,
        idempotencyKey: randomUUID(),
        acknowledgeDuplicate: false,
        confirmNow: true,
        confirmationNote: null,
      },
      "2026-12-20",
    );
  });

  it("exporta cadastro, participações e pagamentos do titular, e registra na auditoria", async () => {
    const data = await exportParticipantData(titular, titular.participantId!);
    expect(data.cadastro).toMatchObject({ nome: "Titular Teste", telefone: "11912345678" });
    expect(data.participacoes).toHaveLength(1);
    expect(data.participacoes[0].pagamentos[0]).toMatchObject({ valorCentavos: 10_000, situacao: "CONFIRMED" });
    expect(data.participacoes[0].parcelas.length).toBe(12);
    expect(JSON.stringify(data)).not.toMatch(/hash-de-teste/); // nunca exporta credenciais
    const audit = await db.auditLog.findFirst({
      where: { action: "participant.data_export", entityId: titular.participantId! },
    });
    expect(audit?.actorId).toBe(titular.userId);
  });

  it("não anonimiza quem ainda participa de ciclo aberto", async () => {
    expect(await anonymizationBlockers(titular.participantId!)).toHaveLength(1);
    await expect(
      anonymizeParticipant(admin, { participantId: titular.participantId!, reason: "Pedido" }),
    ).rejects.toThrow(DomainError);
  });

  it("anonimiza: remove dados pessoais e acesso, preserva o histórico financeiro", async () => {
    // Ciclo encerrado (atalho de teste direto no banco: o fluxo completo de encerramento é testado em results-flow).
    await db.cycle.update({ where: { id: cycleId }, data: { status: "CLOSED" } });
    await anonymizeParticipant(admin, {
      participantId: titular.participantId!,
      reason: "Pedido do titular em 14/10/2026",
    });

    const p = await db.participant.findUniqueOrThrow({ where: { id: titular.participantId! } });
    expect(p.fullName).toMatch(/^Participante anonimizado /);
    expect(p.email).toMatch(/@anonimizado\.invalid$/);
    expect(p.phone).toBeNull();
    expect(p.anonymizedAt).not.toBeNull();

    const u = await db.user.findUniqueOrThrow({ where: { id: titular.userId } });
    expect(u).toMatchObject({ status: "SUSPENDED", emailNotifications: false });
    expect(u.email).toBe(p.email);
    expect(await db.account.count({ where: { userId: titular.userId } })).toBe(0);
    expect(await db.session.count({ where: { userId: titular.userId } })).toBe(0);

    // Financeiro intacto.
    expect(await db.payment.count({ where: { membershipId, status: "CONFIRMED" } })).toBe(1);
    expect(await db.ledgerLine.count({ where: { membershipId } })).toBeGreaterThan(0);

    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "participant.anonymize", entityId: p.id } });
    expect(JSON.stringify(audit.after)).not.toMatch(/Titular Teste|11912345678/);
  });

  it("cadastro anonimizado não pode ser reativado, alterado nem receber acesso", async () => {
    await expect(setParticipantStatus(admin, titular.participantId!, "ACTIVE", "teste")).rejects.toThrow(/anonimizado/);
    await expect(grantAccess(admin, titular.participantId!)).rejects.toThrow(/anonimizado/);
    await expect(
      anonymizeParticipant(admin, { participantId: titular.participantId!, reason: "De novo" }),
    ).rejects.toThrow(/já foi anonimizado/);
  });
});
