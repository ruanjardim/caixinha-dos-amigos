/**
 * Cronograma de parcelas PREVISTAS de uma participação.
 * Parcelas são obrigações — não representam dinheiro recebido.
 */
import { assertCents, type Cents } from "./money";
import { competenceOf, competencesBetween, dueDateFor, type Competence, type ISODate } from "./dates";

export class InstallmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallmentError";
  }
}

/** Mensalidade = quantidade de cotas × valor da cota. */
export function monthlyAmount(quotaCount: number, quotaValueCents: Cents): Cents {
  if (!Number.isInteger(quotaCount) || quotaCount < 1) {
    throw new InstallmentError("A quantidade de cotas deve ser um número inteiro maior que zero.");
  }
  assertCents(quotaValueCents, "valor da cota");
  if (quotaValueCents <= 0) throw new InstallmentError("O valor da cota deve ser maior que zero.");
  const total = quotaCount * quotaValueCents;
  assertCents(total, "mensalidade");
  return total;
}

export type ScheduledInstallment = {
  competence: Competence;
  dueDate: ISODate;
  expectedCents: Cents;
};

/**
 * Gera uma parcela por mês, da competência de entrada (ou do início do ciclo,
 * o que for mais tarde) até a competência de encerramento das contribuições.
 */
export function buildSchedule(input: {
  cycleStart: ISODate;
  contributionEnd: ISODate;
  dueDay: number;
  joinedAt: ISODate;
  monthlyCents: Cents;
}): ScheduledInstallment[] {
  assertCents(input.monthlyCents, "mensalidade");
  if (input.monthlyCents <= 0) throw new InstallmentError("A mensalidade deve ser maior que zero.");
  if (input.contributionEnd < input.cycleStart) {
    throw new InstallmentError("O fim das contribuições deve ser posterior ao início do ciclo.");
  }
  const first = competenceOf(input.joinedAt > input.cycleStart ? input.joinedAt : input.cycleStart);
  const last = competenceOf(input.contributionEnd);
  if (first > last) return [];

  return competencesBetween(first, last).map((competence) => ({
    competence,
    dueDate: dueDateFor(competence, input.dueDay),
    expectedCents: input.monthlyCents,
  }));
}

/** Total previsto no ciclo. */
export function expectedTotal(installments: readonly { expectedCents: Cents }[]): Cents {
  return installments.reduce((sum, i) => sum + i.expectedCents, 0);
}
