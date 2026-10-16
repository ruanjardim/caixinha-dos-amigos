import "server-only";
import { competenceOf, toISODate, todayInBrazil, type Competence, type ISODate } from "@/domain/dates";
import { balancesFrom, ledgerOverview, type LedgerAccount } from "@/domain/ledger";
import { applyBps } from "@/domain/money";
import { buildMonthlySeries, monthRange, periodPresets, slicePeriod, type MonthlyPoint } from "@/domain/series";
import { db } from "@/lib/db";
import { getCycleDetail } from "@/modules/cycles/queries";

const COMPETENCE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function listDashboardCycles(caixinhaId?: string | null) {
  return db.cycle.findMany({
    where: caixinhaId ? { caixinhaId } : undefined,
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, status: true },
  });
}

/** Ciclo padrão do painel: o aberto mais recente; senão, o mais recente. */
export function defaultCycleId(cycles: { id: string; status: string }[]): string | undefined {
  return (cycles.find((c) => c.status === "OPEN") ?? cycles.find((c) => c.status !== "DRAFT") ?? cycles[0])?.id;
}

async function cycleLedger(cycleId: string) {
  const lines = await db.ledgerLine.findMany({
    where: { transaction: { cycleId } },
    select: { account: true, amountCents: true, transaction: { select: { occurredOn: true } } },
  });
  return lines.map((l) => ({
    account: l.account as LedgerAccount,
    amountCents: l.amountCents,
    occurredOn: toISODate(l.transaction.occurredOn),
  }));
}

export type PeriodFilter = { from?: string; to?: string };

/**
 * Painel administrativo de um ciclo.
 * - Indicadores: situação ATUAL do ciclo (não dependem do período).
 * - Gráficos: recortados pelo período escolhido.
 */
export async function getAdminDashboard(
  cycleId: string,
  period: PeriodFilter = {},
  today: ISODate = todayInBrazil(),
  caixinhaId?: string | null,
) {
  const detail = await getCycleDetail(cycleId, today, caixinhaId);
  if (!detail) return null;
  const { cycle, rules, memberships, totals } = detail;

  const lines = await cycleLedger(cycleId);
  const overview = ledgerOverview(balancesFrom(lines));
  const months = monthRange(
    toISODate(cycle.startDate),
    toISODate(cycle.contributionEndDate),
    lines.map((l) => l.occurredOn),
  );
  const series = buildMonthlySeries({
    months,
    installments: memberships.flatMap((m) =>
      m.installments.map((i) => ({
        competence: i.competence,
        expectedCents: i.expectedCents,
        cancelled: i.cancelledAt !== null,
      })),
    ),
    lines,
  });

  const presets = periodPresets(months, competenceOf(today));
  const from = period.from && COMPETENCE.test(period.from) ? period.from : presets.all.from;
  const to = period.to && COMPETENCE.test(period.to) ? period.to : presets.all.to;
  // Período sempre dentro dos meses do ciclo (ex.: ao trocar de ciclo).
  const clamp = (c: string) => (c < presets.all.from ? presets.all.from : c > presets.all.to ? presets.all.to : c);
  const [rangeFrom, rangeTo] = from <= to ? [clamp(from), clamp(to)] : [clamp(to), clamp(from)];
  const sliced = slicePeriod(series, rangeFrom, rangeTo);

  // Projeções NÃO garantidas: só existem resultados depois da apuração (Fase 4).
  const positive = Math.max(0, overview.partialResultCents);
  const adminFeeProjectionCents = rules ? applyBps(positive, rules.adminFeeBps) : 0;

  const active = memberships.filter((m) => m.status === "ACTIVE");
  return {
    cycle,
    rules,
    today,
    kpis: {
      activeMembers: totals.activeMembers,
      quotas: totals.quotas,
      monthlyExpectedCents: totals.monthlyCents,
      expectedCents: totals.expectedCents,
      receivedCents: totals.receivedCents,
      overdueCents: totals.overdueCents,
      underReviewCents: totals.underReviewCents,
      cashCents: overview.cashCents,
      principalOwedCents: overview.principalOwedCents,
      revenueCents: overview.revenueCents,
      expenseCents: overview.expenseCents,
      taxCents: overview.taxCents,
      partialResultCents: overview.partialResultCents,
      adminFeeProjectionCents,
      participantsProjectionCents: positive - adminFeeProjectionCents,
    },
    compliance: {
      upToDate: active.filter((m) => m.summary.overdueCount === 0).length,
      overdue: active.filter((m) => m.summary.overdueCount > 0).length,
      overdueMembers: active
        .filter((m) => m.summary.overdueCount > 0)
        .map((m) => ({
          membershipId: m.id,
          name: m.participant.fullName,
          overdueCents: m.summary.overdueCents,
          count: m.summary.overdueCount,
        }))
        .sort((a, b) => b.overdueCents - a.overdueCents),
    },
    months,
    cycleMonths: {
      from: competenceOf(toISODate(cycle.startDate)),
      to: competenceOf(toISODate(cycle.contributionEndDate)),
    },
    period: { from: rangeFrom, to: rangeTo, presets },
    series: sliced,
  };
}

/**
 * Prestação de contas COLETIVA: somente totais e movimentos sem dados individuais.
 * Contribuições aparecem agregadas por mês, nunca por participante.
 */
export async function getCollectiveReport(cycleId: string, today: ISODate = todayInBrazil()) {
  const cycle = await db.cycle.findUnique({
    where: { id: cycleId },
    include: {
      rules: { orderBy: { version: "desc" }, take: 1 },
      memberships: { select: { status: true, quotaCount: true } },
    },
  });
  if (!cycle) return null;

  const [lines, installments, entries] = await Promise.all([
    cycleLedger(cycleId),
    db.installment.findMany({
      where: { membership: { cycleId } },
      select: { competence: true, expectedCents: true, cancelledAt: true },
    }),
    db.ledgerTransaction.findMany({
      where: { cycleId, category: { notIn: ["CONTRIBUTION", "CONTRIBUTION_REVERSAL"] } },
      orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        occurredOn: true,
        category: true,
        description: true,
        lines: { select: { account: true, amountCents: true } },
      },
    }),
  ]);

  const overview = ledgerOverview(balancesFrom(lines));
  const months = monthRange(
    toISODate(cycle.startDate),
    toISODate(cycle.contributionEndDate),
    lines.map((l) => l.occurredOn),
  );
  const series: MonthlyPoint[] = buildMonthlySeries({
    months,
    installments: installments.map((i) => ({
      competence: i.competence,
      expectedCents: i.expectedCents,
      cancelled: i.cancelledAt !== null,
    })),
    lines,
  });
  const active = cycle.memberships.filter((m) => m.status === "ACTIVE");

  return {
    cycle,
    rules: cycle.rules[0] ?? null,
    today,
    participants: active.length,
    quotas: active.reduce((s, m) => s + m.quotaCount, 0),
    overview,
    series,
    otherEntries: entries.map((e) => ({
      id: e.id,
      occurredOn: toISODate(e.occurredOn),
      category: e.category,
      description: e.description,
      cashEffectCents: e.lines.filter((l) => l.account === "CASH").reduce((s, l) => s + l.amountCents, 0),
    })),
  };
}

export type AdminDashboard = NonNullable<Awaited<ReturnType<typeof getAdminDashboard>>>;
export type { Competence };
