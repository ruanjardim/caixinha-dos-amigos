/**
 * Dinheiro em CENTAVOS inteiros. Nenhum cálculo financeiro usa ponto flutuante.
 *
 * Este módulo é puro (sem I/O) e pode ser usado no servidor e no navegador.
 */

export type Cents = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertCents(value: number, label = "valor"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} deve ser um número inteiro de centavos (recebido: ${value}).`);
  }
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total, "soma");
  return total;
}

/**
 * Converte texto digitado em reais para centavos, sem passar por float.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 50", "50".
 */
export function parseBRL(input: string): Cents {
  const cleaned = input.replace(/R\$|\s/g, "").trim();
  if (!cleaned) throw new MoneyError("Informe um valor.");

  const negative = cleaned.startsWith("-");
  const body = negative ? cleaned.slice(1) : cleaned;

  let intPart: string;
  let fracPart = "";
  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");

  if (lastComma >= 0) {
    // Formato brasileiro: vírgula decimal, pontos de milhar.
    intPart = body.slice(0, lastComma).replace(/\./g, "");
    fracPart = body.slice(lastComma + 1);
  } else if (lastDot >= 0 && body.length - lastDot - 1 <= 2 && body.indexOf(".") === lastDot) {
    // Um único ponto seguido de até 2 dígitos: ponto decimal.
    intPart = body.slice(0, lastDot);
    fracPart = body.slice(lastDot + 1);
  } else {
    intPart = body.replace(/\./g, "");
  }

  if (!/^\d+$/.test(intPart || "0") || !/^\d{0,2}$/.test(fracPart)) {
    throw new MoneyError(`Valor inválido: "${input}".`);
  }

  const cents = Number(intPart || "0") * 100 + Number(fracPart.padEnd(2, "0"));
  assertCents(cents);
  return negative ? -cents : cents;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata centavos como moeda brasileira: 123456 → "R$ 1.234,56". */
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  // Divisão por 100 apenas para exibição; o valor exibido é exato até 2^53.
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** Multiplica centavos por pontos-base (1 bp = 0,01%), arredondando para baixo. */
export function applyBps(cents: Cents, bps: number): Cents {
  assertCents(cents);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new MoneyError(`Percentual inválido: ${bps} bps.`);
  }
  // BigInt evita perda de precisão em produtos grandes.
  return Number((BigInt(cents) * BigInt(bps)) / 10_000n);
}
