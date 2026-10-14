import "server-only";
import { db } from "@/lib/db";
import { getLedgerOverview } from "@/modules/ledger/service";

/** Principal ainda devido a cada participação do ciclo (a partir do livro-caixa). */
export async function principalByMembership(cycleId: string): Promise<Map<string, number>> {
  const sums = await db.ledgerLine.groupBy({
    by: ["membershipId"],
    where: { account: "PARTICIPANT_PRINCIPAL", membershipId: { not: null }, transaction: { cycleId } },
    _sum: { amountCents: true },
  });
  return new Map(sums.map((s) => [s.membershipId!, -(s._sum.amountCents ?? 0) + 0]));
}

export async function getResultsOverview(cycleId: string) {
  const cycle = await db.cycle.findUnique({
    where: { id: cycleId },
    include: { rules: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!cycle) return null;

  const [calc, pendingPayments, lastReconciliation, adminFeePaid, flag, overview, principal, leavers] =
    await Promise.all([
      db.resultCalculation.findFirst({
        where: { cycleId, status: { in: ["APPROVED", "DRAFT"] } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          shares: {
            orderBy: { membership: { participant: { fullName: "asc" } } },
            include: {
              membership: { select: { id: true, status: true, participant: { select: { fullName: true } } } },
              distribution: true,
            },
          },
        },
      }),
      db.payment.count({ where: { membership: { cycleId }, status: { in: ["PENDING", "UNDER_REVIEW"] } } }),
      db.cashReconciliation.findFirst({
        where: { cycleId },
        orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
      }),
      db.ledgerTransaction.findFirst({ where: { cycleId, category: "ADMIN_FEE" }, select: { occurredOn: true } }),
      db.featureFlag.findUnique({ where: { key: "ADMIN_PAYOUT_ENABLED" } }),
      getLedgerOverview(cycleId),
      principalByMembership(cycleId),
      db.membership.findMany({
        where: { cycleId, status: "LEFT" },
        select: { id: true, leftAt: true, participant: { select: { fullName: true } } },
      }),
    ]);

  const totalWeight = calc?.shares.reduce((s, x) => s + x.weight, 0n) ?? 0n;
  return {
    cycle,
    rules: cycle.rules[0] ?? null,
    calc,
    totalWeight,
    pendingPayments,
    lastReconciliation,
    adminFeePaidOn: adminFeePaid?.occurredOn ?? null,
    adminPayoutEnabled: Boolean(flag?.enabled),
    overview,
    leaversWithPrincipal: leavers
      .map((l) => ({ ...l, principalCents: principal.get(l.id) ?? 0 }))
      .filter((l) => l.principalCents > 0),
  };
}

/** Resultado apurado e distribuição da PRÓPRIA participação (área do participante). */
export async function getOwnResult(membershipId: string) {
  return db.resultShare.findFirst({
    where: { membershipId, calculation: { status: "APPROVED" } },
    include: { distribution: true, calculation: { select: { approvedAt: true, netResultCents: true } } },
  });
}
