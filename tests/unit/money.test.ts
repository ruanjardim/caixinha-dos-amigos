import { describe, expect, it } from "vitest";
import { applyBps, formatBRL, MoneyError, parseBRL, sumCents } from "@/domain/money";

describe("parseBRL", () => {
  it.each([
    ["50", 5000],
    ["R$ 50", 5000],
    ["100,00", 10000],
    ["1.234,56", 123456],
    ["1234,5", 123450],
    ["1234.56", 123456],
    ["0,01", 1],
    ["1.000", 100000], // ponto de milhar sem decimais
    ["-10,00", -1000],
  ])("converte %s em %i centavos", (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });

  it.each(["", "abc", "10,999", "1,2,3", "R$"])("rejeita %j", (input) => {
    expect(() => parseBRL(input)).toThrow(MoneyError);
  });

  it("não sofre erro de ponto flutuante (0,1 + 0,2)", () => {
    expect(sumCents([parseBRL("0,10"), parseBRL("0,20")])).toBe(30);
  });
});

describe("formatBRL", () => {
  it("formata em reais", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(5)).toBe("R$ 0,05");
  });

  it('nunca exibe "-R$ 0,00" (zero negativo)', () => {
    expect(formatBRL(-0)).toBe("R$ 0,00");
  });

  it("recusa valores não inteiros", () => {
    expect(() => formatBRL(10.5)).toThrow(MoneyError);
  });
});

describe("applyBps", () => {
  it("10% de R$ 1.400 = R$ 140 (exemplo do enunciado)", () => {
    expect(applyBps(140_000, 1000)).toBe(14_000);
  });

  it("arredonda para baixo (nunca cobra centavo a mais)", () => {
    expect(applyBps(999, 1000)).toBe(99);
  });

  it("não perde precisão com valores grandes", () => {
    expect(applyBps(9_000_000_000_000, 1)).toBe(900_000_000);
  });

  it("recusa percentuais fora de 0–100%", () => {
    expect(() => applyBps(100, -1)).toThrow(MoneyError);
    expect(() => applyBps(100, 10_001)).toThrow(MoneyError);
    expect(() => applyBps(100, 10.5)).toThrow(MoneyError);
  });
});
