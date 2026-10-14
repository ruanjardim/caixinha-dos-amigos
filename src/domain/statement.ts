/**
 * Extrato individual: movimentos de dinheiro efetivamente recebido, com saldo acumulado.
 * Pagamentos em análise ou recusados NÃO entram (não são dinheiro recebido).
 */
import type { Cents } from "./money";
import type { ISODate } from "./dates";

export type StatementPayment = {
  id: string;
  amountCents: Cents;
  status: "PENDING" | "UNDER_REVIEW" | "CONFIRMED" | "CANCELLED" | "REVERSED";
  receivedAt: ISODate | null;
  reversedAt: ISODate | null;
  method: string;
};

export type StatementEntry = {
  date: ISODate;
  kind: "CONTRIBUTION" | "REVERSAL";
  paymentId: string;
  method: string;
  amountCents: Cents; // positivo = entrada; negativo = estorno
  balanceCents: Cents; // saldo de contribuições após o movimento
};

export function buildStatement(payments: readonly StatementPayment[]): StatementEntry[] {
  const raw: Omit<StatementEntry, "balanceCents">[] = [];
  for (const p of payments) {
    if ((p.status === "CONFIRMED" || p.status === "REVERSED") && p.receivedAt) {
      raw.push({
        date: p.receivedAt,
        kind: "CONTRIBUTION",
        paymentId: p.id,
        method: p.method,
        amountCents: p.amountCents,
      });
    }
    if (p.status === "REVERSED" && p.reversedAt) {
      raw.push({
        date: p.reversedAt,
        kind: "REVERSAL",
        paymentId: p.id,
        method: p.method,
        amountCents: -p.amountCents,
      });
    }
  }
  // Ordem cronológica; no mesmo dia, a contribuição vem antes do seu estorno.
  raw.sort((a, b) =>
    a.date === b.date ? (a.kind === b.kind ? 0 : a.kind === "CONTRIBUTION" ? -1 : 1) : a.date < b.date ? -1 : 1,
  );

  let balance = 0;
  return raw.map((e) => {
    balance += e.amountCents;
    return { ...e, balanceCents: balance };
  });
}
