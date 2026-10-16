import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import type { CurrentUser } from "@/modules/auth/session";
import type { AnnouncementInput } from "./schemas";

/**
 * Comunicados: texto simples (sem HTML — exibido como texto, imune a XSS).
 * Rascunho → publicado; despublicar volta a rascunho. Tudo auditado.
 */
export async function saveAnnouncement(actor: CurrentUser, input: AnnouncementInput & { id?: string }) {
  return db.$transaction(async (tx) => {
    if (input.cycleId) {
      const exists = await tx.cycle.count({
        where: { id: input.cycleId, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
      });
      if (!exists) throw new DomainError("Ciclo não encontrado.");
    }
    const data = {
      title: input.title,
      body: input.body,
      cycleId: input.cycleId,
      caixinhaId: actor.caixinhaId ?? null,
      ...(input.publishNow ? { publishedAt: new Date() } : {}),
    };
    const before = input.id
      ? await tx.announcement.findFirst({
          where: { id: input.id, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
        })
      : null;
    if (input.id && !before) throw new DomainError("Comunicado não encontrado.");

    const saved = input.id
      ? await tx.announcement.update({ where: { id: input.id }, data })
      : await tx.announcement.create({ data: { ...data, createdById: actor.userId } });

    await recordAudit(
      {
        actorId: actor.userId,
        action: input.id ? "announcement.update" : "announcement.create",
        entityType: "Announcement",
        entityId: saved.id,
        before: before ? { title: before.title, body: before.body, publishedAt: before.publishedAt } : null,
        after: { title: saved.title, body: saved.body, publishedAt: saved.publishedAt },
      },
      tx,
    );
    return saved;
  });
}

export async function setAnnouncementPublished(actor: CurrentUser, id: string, published: boolean) {
  return db.$transaction(async (tx) => {
    const a = await tx.announcement.findFirst({
      where: { id, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
    });
    if (!a) throw new DomainError("Comunicado não encontrado.");
    const saved = await tx.announcement.update({ where: { id }, data: { publishedAt: published ? new Date() : null } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: published ? "announcement.publish" : "announcement.unpublish",
        entityType: "Announcement",
        entityId: id,
      },
      tx,
    );
    return saved;
  });
}

export async function listAnnouncementsForAdmin(caixinhaId?: string | null) {
  return db.announcement.findMany({
    where: caixinhaId ? { caixinhaId } : undefined,
    orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: { cycle: { select: { name: true } } },
  });
}

/** Comunicados publicados visíveis ao participante: gerais ou dos ciclos em que ele está. */
export async function listAnnouncementsForParticipant(participantId: string | null) {
  if (!participantId) return [];
  const participant = await db.participant.findUnique({
    where: { id: participantId },
    select: { caixinhaId: true },
  });
  const cycleIds = participantId
    ? (await db.membership.findMany({ where: { participantId }, select: { cycleId: true } })).map((m) => m.cycleId)
    : [];
  return db.announcement.findMany({
    where: {
      publishedAt: { not: null },
      ...(participant?.caixinhaId ? { caixinhaId: participant.caixinhaId } : {}),
      OR: [{ cycleId: null }, { cycleId: { in: cycleIds } }],
    },
    orderBy: { publishedAt: "desc" },
    include: { cycle: { select: { name: true } } },
    take: 100,
  });
}

/** Comunicado mais recente publicado nos últimos 30 dias (destaque na página inicial). */
export async function recentAnnouncementForParticipant(participantId: string | null) {
  const [latest] = await listAnnouncementsForParticipant(participantId);
  const since = new Date(Date.now() - 30 * 86_400_000);
  return latest?.publishedAt && latest.publishedAt >= since ? latest : null;
}
