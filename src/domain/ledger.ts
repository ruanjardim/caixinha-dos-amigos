/**
 * Livro-caixa em partidas dobradas simplificadas.
 * Convenção: valor POSITIVO = débito, NEGATIVO = crédito. Cada lançamento soma zero.
 *
 *   CASH (ativo)                  saldo positivo = dinheiro disponível
 *   PARTICIPANT_PRINCIPAL (passivo) saldo negativo = principal devido aos participantes
 *   ADDITIONAL_REVENUE            saldo negativo = receitas acumuladas
 *   EXPENSE / TAX                 saldo positivo = gastos acumulados
 */
import { assertCents, type Cents } from "./money";

export const LEDGER_ACCOUNTS = [
  "CASH",
  "PARTICIPANT_PRINCIPAL",
  "ADDITIONAL_REVENUE",
  "EXPENSE",
  "TAX",
  "ADMIN_FEE",
  "RESULT_TO_DISTRIBUTE",
] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export type LedgerLineInput = {
  account: LedgerAccount;
  amountCents: Cents;
  membershipId?: string | null;
};

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

export function assertBalanced(lines: readonly LedgerLineInput[]): void {
  if (lines.length < 2) throw new LedgerError("Um lançamento precisa de ao menos duas linhas.");
  let total = 0;
  for (const line of lines) {
    assertCents(line.amountCents, "valor da linha");
    if (line.amountCents === 0) throw new LedgerError("Linhas com valor zero não são permitidas.");
    total += line.amountCents;
  }
  if (total !== 0) throw new LedgerError(`Lançamento desbalanceado: soma das linhas = ${total} centavos.`);
}

function positive(amountCents: Cents, label: string) {
  assertCents(amountCents, label);
  if (amountCents <= 0) throw new LedgerError(`${label} deve ser maior que zero.`);
}

/** Contribuição recebida: entra no caixa e vira principal devido ao participante. */
export function contributionLines(amountCents: Cents, membershipId: string): LedgerLineInput[] {
  positive(amountCents, "Valor da contribuição");
  return [
    { account: "CASH", amountCents },
    { account: "PARTICIPANT_PRINCIPAL", amountCents: -amountCents, membershipId },
  ];
}

/** Receita adicional (ex.: atividade de arrecadação). */
export function revenueLines(amountCents: Cents): LedgerLineInput[] {
  positive(amountCents, "Valor da receita");
  return [
    { account: "CASH", amountCents },
    { account: "ADDITIONAL_REVENUE", amountCents: -amountCents },
  ];
}

/** Despesa paga com dinheiro da caixinha. */
export function expenseLines(amountCents: Cents): LedgerLineInput[] {
  positive(amountCents, "Valor da despesa");
  return [
    { account: "EXPENSE", amountCents },
    { account: "CASH", amountCents: -amountCents },
  ];
}

/** Tributo ou dedução paga. */
export function taxLines(amountCents: Cents): LedgerLineInput[] {
  positive(amountCents, "Valor do tributo");
  return [
    { account: "TAX", amountCents },
    { account: "CASH", amountCents: -amountCents },
  ];
}

/** Reversão: mesmas linhas com sinal invertido. */
export function reversalLines(original: readonly LedgerLineInput[]): LedgerLineInput[] {
  return original.map((l) => ({
    account: l.account,
    amountCents: -l.amountCents,
    membershipId: l.membershipId ?? null,
  }));
}

/** Efeito do lançamento sobre o caixa (positivo = entrada). */
export function cashEffect(lines: readonly LedgerLineInput[]): Cents {
  return lines.filter((l) => l.account === "CASH").reduce((s, l) => s + l.amountCents, 0);
}

export type LedgerBalances = Record<LedgerAccount, Cents>;

export function balancesFrom(sums: readonly { account: LedgerAccount; amountCents: Cents }[]): LedgerBalances {
  const balances = Object.fromEntries(LEDGER_ACCOUNTS.map((a) => [a, 0])) as LedgerBalances;
  for (const s of sums) balances[s.account] += s.amountCents;
  return balances;
}

/** Indicadores em linguagem de negócio (valores positivos). */
export function ledgerOverview(b: LedgerBalances) {
  const revenueCents = 0 - b.ADDITIONAL_REVENUE; // "0 -" evita -0
  const expenseCents = b.EXPENSE;
  const taxCents = b.TAX;
  return {
    cashCents: b.CASH,
    principalOwedCents: 0 - b.PARTICIPANT_PRINCIPAL,
    revenueCents,
    expenseCents,
    taxCents,
    /** Resultado PARCIAL (não apurado): receitas − despesas − tributos. */
    partialResultCents: revenueCents - expenseCents - taxCents,
  };
}
