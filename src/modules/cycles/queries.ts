import "server-only";
import { summarizeContributions } from "@/domain/contributions";
import { toISODate, todayInBrazil, type ISODate } from "@/domain/dates";
import type { Installment, Payment } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export function summarize(
  m: { installments: Installment[]; payments: Pick<Payment, "id" | "amountCents" | "status">[] },
  today: ISODate = todayInBrazil(),
) {
  return summarizeContributions({
    installments: m.installments.map((i) => ({
      id: i.id,
      competence: i.competence,
      dueDate: toISODate(i.dueDate),
      expectedCents: i.expectedCents,
      cancelled: i.cancelledAt !== null,
    })),
    payments: m.payments.map((p) => ({ id: p.id, amountCents: p.amountCents, status: p.status })),
    today,
  });
}

const paymentSummaryFields = { id: true, amountCents: true, status: true } as const;

export async function listCycles() {
  return db.cycle.findMany({
    orderBy: { startDate: "desc" },
    include: {
      rules: { orderBy: { version: "desc" }, take: 1 },
      _count: { select: { memberships: true } },
    },
  });
}

/** Ciclos que aceitam pagamentos (para formulários). */
export async function listPayableMemberships() {
  return db.membership.findMany({
    where: { cycle: { status: { in: ["OPEN", "CONTRIBUTIONS_CLOSED"] } } },
    orderBy: [{ cycle: { startDate: "desc" } }, { participant: { fullName: "asc" } }],
    include: {
      participant: { select: { fullName: true } },
      cycle: { select: { name: true } },
    },
  });
}

export async function getCycleDetail(cycleId: string, today: ISODate = todayInBrazil()) {
  const cycle = await db.cycle.findUnique({
    where: { id: cycleId },
    include: {
      rules: { orderBy: { version: "desc" }, take: 1, include: { acceptances: { select: { participantId: true } } } },
      memberships: {
        orderBy: { participant: { fullName: "asc" } },
        include: {
          participant: { select: { id: true, fullName: true, email: true } },
          installments: { orderBy: { competence: "asc" } },
          payments: { select: paymentSummaryFields },
        },
      },
    },
  });
  if (!cycle) return null;

  const rules = cycle.rules[0] ?? null;
  const accepted = new Set(rules?.acceptances.map((a) => a.participantId) ?? []);
  const memberships = cycle.memberships.map((m) => ({
    ...m,
    summary: summarize(m, today),
    acceptedRules: accepted.has(m.participantId),
  }));

  const totals = memberships.reduce(
    (acc, m) => {
      if (m.status === "ACTIVE") {
        acc.activeMembers += 1;
        acc.quotas += m.quotaCount;
        acc.monthlyCents += m.quotaCount * m.quotaValueCents;
      }
      acc.expectedCents += m.summary.expectedTotalCents;
      acc.receivedCents += m.summary.receivedCents;
      acc.overdueCents += m.summary.overdueCents;
      acc.underReviewCents += m.summary.underReviewCents;
      if (m.summary.overdueCount > 0) acc.membersOverdue += 1;
      return acc;
    },
    {
      activeMembers: 0,
      quotas: 0,
      monthlyCents: 0,
      expectedCents: 0,
      receivedCents: 0,
      overdueCents: 0,
      underReviewCents: 0,
      membersOverdue: 0,
    },
  );

  return { cycle, rules, memberships, totals, today };
}

export async function getMembershipDetail(membershipId: string, today: ISODate = todayInBrazil()) {
  const m = await db.membership.findUnique({
    where: { id: membershipId },
    include: {
      participant: true,
      cycle: { include: { rules: { orderBy: { version: "desc" }, take: 1 } } },
      installments: { orderBy: { competence: "asc" } },
      payments: {
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        include: { confirmedBy: { select: { name: true } }, registeredBy: { select: { name: true } } },
      },
      changes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!m) return null;
  return { ...m, summary: summarize(m, today) };
}

/** Participações do PRÓPRIO participante (escopo obrigatório pelo participantId). */
export async function getOwnMemberships(participantId: string) {
  const memberships = await db.membership.findMany({
    where: { participantId },
    orderBy: { cycle: { startDate: "desc" } },
    include: {
      cycle: {
        include: {
          rules: {
            orderBy: { version: "desc" },
            take: 1,
            include: { acceptances: { where: { participantId }, select: { acceptedAt: true } } },
          },
        },
      },
      installments: { orderBy: { competence: "asc" } },
      payments: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          amountCents: true,
          status: true,
          receivedAt: true,
          method: true,
          createdAt: true,
          cancelReason: true,
          proofFileId: true,
        },
      },
    },
  });
  const today = todayInBrazil();
  return memberships.map((m) => ({ ...m, summary: summarize(m, today) }));
}
