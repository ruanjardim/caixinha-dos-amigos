/**
 * APURAÇÃO E DISTRIBUIÇÃO DE RESULTADOS — política v1 (aprovada pelo grupo em 14/10/2026).
 *
 * 1. Saldo diário proporcional: cada movimento de principal pesa (valor × dias até a data de corte).
 *    - Data de corte = fim das contribuições; conta-se até o dia seguinte a ela (exclusivo).
 *      Ex.: crédito em 01/12/2026 e fim em 30/11/2027 → 365 dias.
 *    - Pagamentos ANTES do início do ciclo contam a partir do início.
 *    - Estornos e devoluções de principal (saída no meio do ciclo) SUBTRAEM a partir da sua data:
 *      o valor só conta pelos dias em que realmente ficou na caixinha.
 *    - Movimentos após a data de corte não geram peso (mas o principal continua devido).
 * 2. Resultado POSITIVO: remuneração administrativa = % (regras do ciclo) do resultado líquido;
 *    o restante é distribuído pelo peso. Nunca incide sobre o principal.
 * 3. Resultado NEGATIVO: prejuízo dividido proporcionalmente ao principal ainda na caixinha na
 *    apuração (quem já recebeu o principal de volta ao sair não é cobrado). Sem remuneração.
 * 4. Nunca se distribui mais do que o disponível: caixa ≥ principal devido + resultado distribuível.
 * 5. Centavos inteiros; arredondamento pelo maior resto (a soma fecha exatamente).
 */
import { applyBps, assertCents, type Cents } from "./money";
import { daysBetween, fromISODate, toISODate, type ISODate } from "./dates";

export const POLICY_VERSION = "v1-2026-10-14";

export class DistributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DistributionError";
  }
}

/** Movimento de principal: positivo = contribuição recebida; negativo = estorno ou devolução. */
export type PrincipalMovement = { date: ISODate; amountCents: Cents };

export type MemberInput = { membershipId: string; movements: readonly PrincipalMovement[] };

export type DistributionInput = {
  cycleStart: ISODate;
  /** Último dia das contribuições (data de corte). */
  cutoffDate: ISODate;
  adminFeeBps: number;
  revenueCents: Cents;
  expenseCents: Cents;
  taxCents: Cents;
  /** Saldo em caixa no momento da apuração. */
  availableCashCents: Cents;
  members: readonly MemberInput[];
};

export type MemberShare = {
  membershipId: string;
  /** Principal ainda na caixinha (a devolver no encerramento). */
  principalCents: Cents;
  /** Σ valor × dias (centavos·dia). */
  weight: bigint;
  /** Participação no resultado (negativa em caso de prejuízo). */
  shareCents: Cents;
  /** Total a receber no encerramento = principal + participação. */
  payoutCents: Cents;
};

export type DistributionResult = {
  policyVersion: string;
  netResultCents: Cents;
  adminFeeCents: Cents;
  /** Resultado a distribuir (positivo) ou prejuízo a ratear (negativo). */
  distributableCents: Cents;
  principalOutstandingCents: Cents;
  totalWeight: bigint;
  shares: MemberShare[];
};

function nextDay(date: ISODate): ISODate {
  const d = fromISODate(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return toISODate(d);
}

/** Dias em que um movimento conta até a data de corte (0 se após o corte). */
export function daysCounted(movementDate: ISODate, cycleStart: ISODate, cutoffDate: ISODate): number {
  const effective = movementDate < cycleStart ? cycleStart : movementDate;
  return Math.max(0, daysBetween(effective, nextDay(cutoffDate)));
}

export function memberWeight(
  movements: readonly PrincipalMovement[],
  cycleStart: ISODate,
  cutoffDate: ISODate,
): bigint {
  let weight = 0n;
  for (const m of movements) {
    assertCents(m.amountCents, "movimento");
    weight += BigInt(m.amountCents) * BigInt(daysCounted(m.date, cycleStart, cutoffDate));
  }
  return weight < 0n ? 0n : weight;
}

export function memberPrincipal(movements: readonly PrincipalMovement[]): Cents {
  const total = movements.reduce((s, m) => s + m.amountCents, 0);
  return total < 0 ? 0 : total;
}

/**
 * Divide `total` centavos proporcionalmente aos `weights` pelo método do maior resto.
 * Empates no resto: ordem estável pelo índice (determinístico). Σ resultado === total.
 */
export function allocateLargestRemainder(total: Cents, weights: readonly bigint[]): Cents[] {
  assertCents(total, "total");
  const sign = total < 0 ? -1n : 1n;
  const amount = BigInt(Math.abs(total));
  const sumW = weights.reduce((s, w) => s + w, 0n);
  if (weights.some((w) => w < 0n)) throw new DistributionError("Pesos negativos não são permitidos.");
  if (amount === 0n) return weights.map(() => 0);
  if (sumW === 0n) throw new DistributionError("Não há base para dividir: todos os pesos são zero.");

  const floors = weights.map((w) => (amount * w) / sumW);
  const remainders = weights.map((w, i) => ({ i, r: (amount * w) % sumW }));
  let leftover = amount - floors.reduce((s, f) => s + f, 0n);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (leftover === 0n) break;
    floors[i] += 1n;
    leftover -= 1n;
  }
  return floors.map((f) => Number(f * sign));
}

export function calculateDistribution(input: DistributionInput): DistributionResult {
  for (const [label, v] of [
    ["receitas", input.revenueCents],
    ["despesas", input.expenseCents],
    ["tributos", input.taxCents],
    ["caixa", input.availableCashCents],
  ] as const) {
    assertCents(v, label);
  }
  if (input.cutoffDate < input.cycleStart) throw new DistributionError("Data de corte anterior ao início do ciclo.");

  const netResultCents = input.revenueCents - input.expenseCents - input.taxCents;
  const members = input.members.map((m) => ({
    membershipId: m.membershipId,
    principalCents: memberPrincipal(m.movements),
    weight: memberWeight(m.movements, input.cycleStart, input.cutoffDate),
  }));
  const principalOutstandingCents = members.reduce((s, m) => s + m.principalCents, 0);

  let adminFeeCents = 0;
  let distributableCents = 0;
  let shares: Cents[] = members.map(() => 0);

  if (netResultCents > 0) {
    adminFeeCents = applyBps(netResultCents, input.adminFeeBps);
    distributableCents = netResultCents - adminFeeCents;
    const totalWeight = members.reduce((s, m) => s + m.weight, 0n);
    if (distributableCents > 0) {
      if (totalWeight === 0n) {
        throw new DistributionError(
          "Há resultado a distribuir, mas nenhuma contribuição contou dias até a data de corte.",
        );
      }
      shares = allocateLargestRemainder(
        distributableCents,
        members.map((m) => m.weight),
      );
    }
  } else if (netResultCents < 0) {
    // Prejuízo: proporcional ao principal ainda na caixinha; sem remuneração administrativa.
    distributableCents = netResultCents;
    if (-netResultCents > principalOutstandingCents) {
      throw new DistributionError("O prejuízo é maior que todo o principal disponível. Revise os lançamentos.");
    }
    shares = allocateLargestRemainder(
      netResultCents,
      members.map((m) => BigInt(m.principalCents)),
    );
  }

  // Trava de recursos: o caixa precisa cobrir o principal devido + o resultado (e a remuneração).
  const required = principalOutstandingCents + distributableCents + adminFeeCents;
  if (input.availableCashCents < required) {
    throw new DistributionError(
      `Recursos insuficientes: caixa de ${input.availableCashCents} centavos para obrigações de ${required} centavos.`,
    );
  }

  return {
    policyVersion: POLICY_VERSION,
    netResultCents,
    adminFeeCents,
    distributableCents,
    principalOutstandingCents,
    totalWeight: members.reduce((s, m) => s + m.weight, 0n),
    shares: members.map((m, i) => ({
      membershipId: m.membershipId,
      principalCents: m.principalCents,
      weight: m.weight,
      shareCents: shares[i] + 0,
      payoutCents: m.principalCents + shares[i],
    })),
  };
}
