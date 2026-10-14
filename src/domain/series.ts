/**
 * Séries mensais para os painéis — calculadas a partir do LIVRO-CAIXA, para que
 * gráficos e saldos sempre concordem. Regime de caixa: cada valor entra no mês
 * em que o dinheiro efetivamente entrou ou saiu.
 */
import type { LedgerAccount } from "./ledger";
import type { Cents } from "./money";
import { addMonths, competenceOf, competencesBetween, type Competence, type ISODate } from "./dates";

export type SeriesLedgerLine = { occurredOn: ISODate; account: LedgerAccount; amountCents: Cents };
export type SeriesInstallment = { competence: Competence; expectedCents: Cents; cancelled: boolean };

export type MonthlyPoint = {
  competence: Competence;
  /** Contribuições previstas para a competência (obrigação, não dinheiro). */
  expectedCents: Cents;
  /** Contribuições líquidas recebidas no mês (confirmadas − estornadas). */
  receivedCents: Cents;
  /** Entradas no caixa no mês. */
  inCents: Cents;
  /** Saídas do caixa no mês (valor positivo). */
  outCents: Cents;
  /** Receitas adicionais − despesas − tributos do mês (resultado parcial, NÃO apurado). */
  resultCents: Cents;
  /** Resultado parcial acumulado desde o início da série. */
  cumulativeResultCents: Cents;
};

/** Meses cobertos pelo ciclo, estendidos para incluir movimentos fora dele (ex.: antecipação). */
export function monthRange(
  cycleStart: ISODate,
  contributionEnd: ISODate,
  movementDates: readonly ISODate[],
): Competence[] {
  let first = competenceOf(cycleStart);
  let last = competenceOf(contributionEnd);
  for (const d of movementDates) {
    const c = competenceOf(d);
    if (c < first) first = c;
    if (c > last) last = c;
  }
  return competencesBetween(first, last);
}

export function buildMonthlySeries(input: {
  months: readonly Competence[];
  installments: readonly SeriesInstallment[];
  lines: readonly SeriesLedgerLine[];
}): MonthlyPoint[] {
  const byMonth = new Map<Competence, MonthlyPoint>(
    input.months.map((competence) => [
      competence,
      {
        competence,
        expectedCents: 0,
        receivedCents: 0,
        inCents: 0,
        outCents: 0,
        resultCents: 0,
        cumulativeResultCents: 0,
      },
    ]),
  );

  for (const i of input.installments) {
    if (i.cancelled) continue;
    const p = byMonth.get(i.competence);
    if (p) p.expectedCents += i.expectedCents;
  }

  for (const l of input.lines) {
    const p = byMonth.get(competenceOf(l.occurredOn));
    if (!p) continue;
    switch (l.account) {
      case "CASH":
        if (l.amountCents > 0) p.inCents += l.amountCents;
        else p.outCents += -l.amountCents;
        break;
      case "PARTICIPANT_PRINCIPAL":
        p.receivedCents -= l.amountCents; // crédito (negativo) = contribuição recebida
        break;
      case "ADDITIONAL_REVENUE":
        p.resultCents -= l.amountCents;
        break;
      case "EXPENSE":
      case "TAX":
        p.resultCents -= l.amountCents;
        break;
      default:
        break;
    }
  }

  let cumulative = 0;
  return input.months.map((m) => {
    const p = byMonth.get(m)!;
    cumulative += p.resultCents;
    // "+ 0" evita zero negativo.
    return {
      ...p,
      receivedCents: p.receivedCents + 0,
      resultCents: p.resultCents + 0,
      cumulativeResultCents: cumulative + 0,
    };
  });
}

/** Recorte de um período (competências inclusivas). */
export function slicePeriod<T extends { competence: Competence }>(
  points: readonly T[],
  from?: Competence,
  to?: Competence,
): T[] {
  return points.filter((p) => (!from || p.competence >= from) && (!to || p.competence <= to));
}

/** Atalhos de período a partir de uma competência de referência. */
export function periodPresets(months: readonly Competence[], current: Competence) {
  const last = months[months.length - 1];
  const first = months[0];
  const clamp = (c: Competence) => (c < first ? first : c > last ? last : c);
  return {
    all: { from: first, to: last },
    last3: { from: clamp(addMonths(current, -2)), to: clamp(current) },
    last6: { from: clamp(addMonths(current, -5)), to: clamp(current) },
  };
}
