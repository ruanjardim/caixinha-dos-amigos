/**
 * Situação das contribuições de um participante em um ciclo.
 *
 * Regra de cobertura (determinística e auditável):
 *   O total efetivamente recebido (pagamentos CONFIRMADOS; estornados não contam)
 *   cobre as parcelas ativas em ordem cronológica de competência.
 *   - Parcela coberta antes do vencimento = antecipada.
 *   - Parcela vencida sem cobertura total = pendente em atraso.
 *   - Valor recebido acima do total previsto = crédito (excedente).
 *
 * Previsto e recebido NUNCA se misturam: `expectedTotalCents` é obrigação,
 * `receivedCents` é dinheiro confirmado.
 */
import type { Cents } from "./money";
import type { Competence, ISODate } from "./dates";

export type PaymentStatusLike = "PENDING" | "UNDER_REVIEW" | "CONFIRMED" | "CANCELLED" | "REVERSED";

export type InstallmentInput = {
  id: string;
  competence: Competence;
  dueDate: ISODate;
  expectedCents: Cents;
  cancelled: boolean;
};

export type PaymentInput = {
  id: string;
  amountCents: Cents;
  status: PaymentStatusLike;
};

export type InstallmentSituation = "PAID" | "PARTIAL" | "OPEN";

export type InstallmentCoverage = {
  id: string;
  competence: Competence;
  dueDate: ISODate;
  expectedCents: Cents;
  coveredCents: Cents;
  remainingCents: Cents;
  situation: InstallmentSituation;
  /** Vencida (vencimento antes de hoje) e não totalmente coberta. */
  overdue: boolean;
  /** Totalmente coberta e com vencimento ainda no futuro. */
  advanced: boolean;
};

export type ContributionSummary = {
  installments: InstallmentCoverage[];
  /** Total previsto no ciclo (parcelas ativas). */
  expectedTotalCents: Cents;
  /** Dinheiro efetivamente recebido (confirmado). */
  receivedCents: Cents;
  /** Informado pelo participante, aguardando conferência — NÃO é dinheiro recebido. */
  underReviewCents: Cents;
  /** Previsto ainda não coberto (vencido + a vencer). */
  remainingCents: Cents;
  overdueCents: Cents;
  overdueCount: number;
  openCount: number;
  /** Valor recebido que cobre parcelas ainda não vencidas. */
  advancedCents: Cents;
  advancedCount: number;
  /** Recebido acima do total previsto. */
  creditCents: Cents;
  nextDue: InstallmentCoverage | null;
};

export function summarizeContributions(input: {
  installments: readonly InstallmentInput[];
  payments: readonly PaymentInput[];
  today: ISODate;
}): ContributionSummary {
  const active = input.installments
    .filter((i) => !i.cancelled)
    .slice()
    .sort((a, b) => (a.competence < b.competence ? -1 : a.competence > b.competence ? 1 : 0));

  const receivedCents = sum(input.payments.filter((p) => p.status === "CONFIRMED").map((p) => p.amountCents));
  const underReviewCents = sum(
    input.payments.filter((p) => p.status === "UNDER_REVIEW" || p.status === "PENDING").map((p) => p.amountCents),
  );

  let pool = receivedCents;
  const installments: InstallmentCoverage[] = active.map((i) => {
    const coveredCents = Math.min(pool, i.expectedCents);
    pool -= coveredCents;
    const remainingCents = i.expectedCents - coveredCents;
    const situation: InstallmentSituation = remainingCents === 0 ? "PAID" : coveredCents > 0 ? "PARTIAL" : "OPEN";
    return {
      id: i.id,
      competence: i.competence,
      dueDate: i.dueDate,
      expectedCents: i.expectedCents,
      coveredCents,
      remainingCents,
      situation,
      overdue: remainingCents > 0 && i.dueDate < input.today,
      advanced: remainingCents === 0 && i.dueDate > input.today,
    };
  });

  const expectedTotalCents = sum(installments.map((i) => i.expectedCents));
  const overdue = installments.filter((i) => i.overdue);
  const advanced = installments.filter((i) => i.dueDate > input.today && i.coveredCents > 0);

  return {
    installments,
    expectedTotalCents,
    receivedCents,
    underReviewCents,
    remainingCents: sum(installments.map((i) => i.remainingCents)),
    overdueCents: sum(overdue.map((i) => i.remainingCents)),
    overdueCount: overdue.length,
    openCount: installments.filter((i) => i.remainingCents > 0).length,
    advancedCents: sum(advanced.map((i) => i.coveredCents)),
    advancedCount: installments.filter((i) => i.advanced).length,
    creditCents: pool,
    nextDue: installments.find((i) => i.remainingCents > 0) ?? null,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
