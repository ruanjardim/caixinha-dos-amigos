/**
 * Atividades de arrecadação — regras de conformidade (puras, testáveis).
 *
 * REQUISITO OBRIGATÓRIO: venda de números, cobrança vinculada a sorteio e execução de
 * sorteios ficam DESATIVADAS por padrão. Uma atividade do tipo sorteio só sai do modo
 * SIMULAÇÃO quando, cumulativamente:
 *   1. há parecer de conformidade APROVADO para ela (modalidade legal identificada);
 *   2. o recurso global RAFFLE_SALES_ENABLED foi ligado (com justificativa registrada);
 *   3. o regulamento da promoção está escrito;
 *   4. a numeração ainda não foi gerada em simulação (simulação nunca vira venda real).
 * Ser um grupo privado NÃO é autorização. O sistema nunca executa sorteio real:
 * apenas registra o resultado obtido pelo meio autorizado (ex.: Loteria Federal).
 */

export const MAX_RAFFLE_NUMBERS = 10_000;

export type ActivityTypeLike = "EVENT" | "PRODUCT_SALE" | "DONATION" | "RAFFLE" | "OTHER";
export type ComplianceStatusLike = "NOT_REQUIRED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export class FundraisingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FundraisingError";
  }
}

/** Situação inicial de conformidade: sorteios sempre exigem análise. */
export function initialComplianceStatus(type: ActivityTypeLike): ComplianceStatusLike {
  return type === "RAFFLE" ? "PENDING_REVIEW" : "NOT_REQUIRED";
}

export type AuthorizationCheck = { ok: true } | { ok: false; reasons: string[] };

/** Pode ativar o modo AUTORIZADO (venda real de números)? Lista todos os impedimentos. */
export function checkRaffleAuthorization(a: {
  type: ActivityTypeLike;
  complianceStatus: ComplianceStatusLike;
  salesFlagEnabled: boolean;
  promotionRules: string | null;
  numbersGenerated: boolean;
}): AuthorizationCheck {
  const reasons: string[] = [];
  if (a.type !== "RAFFLE") reasons.push("Somente atividades do tipo sorteio têm modo autorizado.");
  if (a.complianceStatus !== "APPROVED") reasons.push("Falta parecer de conformidade aprovado para esta atividade.");
  if (!a.salesFlagEnabled) reasons.push("O recurso de venda de números está desligado na Conformidade.");
  if (!a.promotionRules || a.promotionRules.trim().length < 50)
    reasons.push("Escreva o regulamento da promoção (mín. 50 caracteres).");
  if (a.numbersGenerated)
    reasons.push("A numeração já foi gerada em simulação; crie uma nova atividade para a versão autorizada.");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/** Pode registrar dinheiro (receitas/custos) no livro-caixa ligado a esta atividade? */
export function canRecordMoney(a: {
  type: ActivityTypeLike;
  complianceStatus: ComplianceStatusLike;
  simulationOnly: boolean;
}) {
  if (a.complianceStatus === "REJECTED")
    return { ok: false as const, reason: "Atividade com parecer de conformidade REPROVADO." };
  if (a.type === "RAFFLE" && a.simulationOnly) {
    return { ok: false as const, reason: "Sorteio em simulação: nenhum dinheiro pode ser movimentado." };
  }
  return { ok: true as const };
}

export function validateNumberRange(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new FundraisingError("Faixa de números inválida.");
  }
  if (end - start + 1 > MAX_RAFFLE_NUMBERS) {
    throw new FundraisingError(`No máximo ${MAX_RAFFLE_NUMBERS.toLocaleString("pt-BR")} números por atividade.`);
  }
}

/** Sorteio SIMULADO (nunca oficial): escolhe um número entre os confirmados. */
export function simulateDraw(confirmedNumbers: readonly number[], randomInt: (maxExclusive: number) => number): number {
  if (confirmedNumbers.length === 0) throw new FundraisingError("Não há números confirmados para simular o sorteio.");
  const index = randomInt(confirmedNumbers.length);
  if (!Number.isInteger(index) || index < 0 || index >= confirmedNumbers.length) {
    throw new FundraisingError("Gerador aleatório inválido.");
  }
  return confirmedNumbers[index];
}

/** Largura para exibir números com zeros à esquerda (ex.: 0007 numa faixa até 1000). */
export function numberWidth(end: number): number {
  return String(end).length;
}

export function formatRaffleNumber(n: number, end: number): string {
  return String(n).padStart(numberWidth(end), "0");
}
