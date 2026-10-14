import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  balancesFrom,
  cashEffect,
  contributionLines,
  expenseLines,
  LedgerError,
  ledgerOverview,
  reversalLines,
  revenueLines,
  taxLines,
} from "@/domain/ledger";

describe("livro-caixa em partidas dobradas", () => {
  it("todos os modelos de lançamento são balanceados", () => {
    for (const lines of [contributionLines(10_000, "m1"), revenueLines(500), expenseLines(300), taxLines(20)]) {
      expect(() => assertBalanced(lines)).not.toThrow();
    }
  });

  it("rejeita lançamento desbalanceado, com linha zero ou com uma linha só", () => {
    expect(() =>
      assertBalanced([
        { account: "CASH", amountCents: 100 },
        { account: "EXPENSE", amountCents: -99 },
      ]),
    ).toThrow(LedgerError);
    expect(() =>
      assertBalanced([
        { account: "CASH", amountCents: 0 },
        { account: "EXPENSE", amountCents: 0 },
      ]),
    ).toThrow(LedgerError);
    expect(() => assertBalanced([{ account: "CASH", amountCents: 0 }])).toThrow(LedgerError);
  });

  it("rejeita valores não positivos nos modelos", () => {
    expect(() => contributionLines(0, "m")).toThrow(LedgerError);
    expect(() => expenseLines(-5)).toThrow(LedgerError);
  });

  it("reversão anula exatamente o lançamento original", () => {
    const original = contributionLines(10_000, "m1");
    const reversal = reversalLines(original);
    assertBalanced(reversal);
    const b = balancesFrom([...original, ...reversal]);
    expect(Object.values(b).every((v) => v === 0)).toBe(true);
  });

  it("efeito no caixa: contribuição e receita entram, despesa e tributo saem", () => {
    expect(cashEffect(contributionLines(100, "m"))).toBe(100);
    expect(cashEffect(revenueLines(100))).toBe(100);
    expect(cashEffect(expenseLines(100))).toBe(-100);
    expect(cashEffect(taxLines(100))).toBe(-100);
  });

  it("livro vazio não produz zero negativo", () => {
    const o = ledgerOverview(balancesFrom([]));
    for (const v of Object.values(o)) expect(Object.is(v, -0)).toBe(false);
  });

  it("separa contribuições, receitas, despesas e tributos", () => {
    const b = balancesFrom([
      ...contributionLines(120_000, "ana"),
      ...contributionLines(120_000, "bruno"),
      ...revenueLines(200_000),
      ...expenseLines(50_000),
      ...taxLines(10_000),
    ]);
    const o = ledgerOverview(b);
    expect(o.principalOwedCents).toBe(240_000);
    expect(o.revenueCents).toBe(200_000);
    expect(o.expenseCents).toBe(50_000);
    expect(o.taxCents).toBe(10_000);
    expect(o.partialResultCents).toBe(140_000); // R$ 1.400, exemplo do enunciado
    expect(o.cashCents).toBe(240_000 + 200_000 - 50_000 - 10_000);
    // Caixa = principal devido + resultado parcial
    expect(o.cashCents).toBe(o.principalOwedCents + o.partialResultCents);
  });
});
