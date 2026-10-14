import "server-only";
import { db } from "@/lib/db";

/** Receitas e custos por atividade, a partir do livro-caixa (efeito no caixa). */
export async function activityFinancials(activityIds: string[]) {
  const map = new Map<string, { revenueCents: number; costCents: number }>();
  if (activityIds.length === 0) return map;
  const lines = await db.ledgerLine.findMany({
    where: { account: "CASH", transaction: { activityId: { in: activityIds } } },
    select: { amountCents: true, transaction: { select: { activityId: true } } },
  });
  for (const l of lines) {
    const id = l.transaction.activityId!;
    const cur = map.get(id) ?? { revenueCents: 0, costCents: 0 };
    if (l.amountCents > 0) cur.revenueCents += l.amountCents;
    else cur.costCents += -l.amountCents;
    map.set(id, cur);
  }
  return map;
}

export async function listActivities(filter: { cycleId?: string } = {}) {
  const activities = await db.fundraisingActivity.findMany({
    where: filter.cycleId ? { cycleId: filter.cycleId } : {},
    orderBy: [{ createdAt: "desc" }],
    include: {
      cycle: { select: { name: true } },
      _count: { select: { prizes: true, numbers: true } },
    },
  });
  const fin = await activityFinancials(activities.map((a) => a.id));
  return activities.map((a) => ({ ...a, financials: fin.get(a.id) ?? { revenueCents: 0, costCents: 0 } }));
}

export async function getActivityDetail(activityId: string) {
  const a = await db.fundraisingActivity.findUnique({
    where: { id: activityId },
    include: {
      cycle: { select: { id: true, name: true, status: true } },
      prizes: { orderBy: { position: "asc" } },
      images: { include: { file: { select: { id: true, fileName: true } } } },
      participants: {
        include: { participant: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
      approvals: { orderBy: { createdAt: "desc" }, include: { decidedBy: { select: { name: true } } } },
      numbers: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          status: true,
          isSimulation: true,
          transactionRef: true,
          participant: { select: { id: true, fullName: true } },
        },
      },
      ledger: { orderBy: { occurredOn: "desc" }, include: { lines: true, createdBy: { select: { name: true } } } },
    },
  });
  if (!a) return null;
  const counts = { AVAILABLE: 0, RESERVED: 0, CONFIRMED: 0 };
  for (const n of a.numbers) counts[n.status]++;
  const fin = (await activityFinancials([a.id])).get(a.id) ?? { revenueCents: 0, costCents: 0 };
  return { ...a, counts, financials: fin };
}

/** Atividades visíveis ao participante: ciclos em que participa; sem rascunhos/canceladas. */
export async function listActivitiesForParticipant(participantId: string | null) {
  if (!participantId) return [];
  const cycleIds = (await db.membership.findMany({ where: { participantId }, select: { cycleId: true } })).map(
    (m) => m.cycleId,
  );
  const activities = await db.fundraisingActivity.findMany({
    where: { cycleId: { in: cycleIds }, status: { in: ["PLANNED", "IN_PROGRESS", "FINISHED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      cycle: { select: { name: true } },
      prizes: { orderBy: { position: "asc" } },
      images: { select: { id: true, fileId: true, caption: true } },
      // Somente os PRÓPRIOS números do participante.
      numbers: {
        where: { participantId },
        select: { number: true, status: true, isSimulation: true },
        orderBy: { number: "asc" },
      },
    },
  });
  const fin = await activityFinancials(activities.map((a) => a.id));
  return activities.map((a) => ({ ...a, financials: fin.get(a.id) ?? { revenueCents: 0, costCents: 0 } }));
}
