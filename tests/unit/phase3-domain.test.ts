import { describe, expect, it } from "vitest";
import { brlToWords, integerToWords } from "@/domain/extenso";
import { contributionLines, expenseLines, reversalLines, revenueLines, taxLines } from "@/domain/ledger";
import { buildMonthlySeries, monthRange, periodPresets, slicePeriod } from "@/domain/series";
import { buildStatement } from "@/domain/statement";

describe("valor por extenso", () => {
  it.each([
    [1, "um centavo"],
    [100, "um real"],
    [150, "um real e cinquenta centavos"],
    [10_000, "cem reais"],
    [10_100, "cento e um reais"],
    [84_500, "oitocentos e quarenta e cinco reais"],
    [100_000, "mil reais"],
    [150_000, "mil e quinhentos reais"],
    [123_456, "mil duzentos e trinta e quatro reais e cinquenta e seis centavos"],
    [2_001_000, "vinte mil e dez reais"],
    [100_000_000, "um milhão de reais"],
    [250_000_000, "dois milhões e quinhentos mil reais"],
    [0, "zero real"],
  ])("%i centavos → %s", (cents, words) => {
    expect(brlToWords(cents)).toBe(words);
  });

  it("números de 11 a 19 e dezenas", () => {
    expect(integerToWords(14)).toBe("quatorze");
    expect(integerToWords(70)).toBe("setenta");
    expect(integerToWords(999)).toBe("novecentos e noventa e nove");
  });

  it("recusa negativos e não inteiros", () => {
    expect(() => brlToWords(-1)).toThrow();
    expect(() => brlToWords(1.5)).toThrow();
  });
});

describe("séries mensais (a partir do livro-caixa)", () => {
  const lines = [
    ...contributionLines(10_000, "m").map((l) => ({ ...l, occurredOn: "2026-10-14" })), // antecipação antes do início
    ...contributionLines(10_000, "m").map((l) => ({ ...l, occurredOn: "2026-12-05" })),
    ...revenueLines(20_000).map((l) => ({ ...l, occurredOn: "2027-01-20" })),
    ...expenseLines(2_500).map((l) => ({ ...l, occurredOn: "2027-01-25" })),
    ...taxLines(500).map((l) => ({ ...l, occurredOn: "2027-02-10" })),
    // contribuição estornada em fevereiro
    ...reversalLines(contributionLines(10_000, "m")).map((l) => ({ ...l, occurredOn: "2027-02-11" })),
  ];
  const months = monthRange(
    "2026-12-01",
    "2027-11-30",
    lines.map((l) => l.occurredOn),
  );
  const installments = months
    .filter((m) => m >= "2026-12")
    .map((competence) => ({ competence, expectedCents: 10_000, cancelled: false }));
  const series = buildMonthlySeries({ months, installments, lines });
  const at = (c: string) => series.find((p) => p.competence === c)!;

  it("estende o período para incluir antecipações anteriores ao ciclo", () => {
    expect(months[0]).toBe("2026-10");
    expect(months[months.length - 1]).toBe("2027-11");
  });

  it("previsto e recebido separados", () => {
    expect(at("2026-10")).toMatchObject({ expectedCents: 0, receivedCents: 10_000 });
    expect(at("2026-12")).toMatchObject({ expectedCents: 10_000, receivedCents: 10_000 });
  });

  it("estorno reduz o recebido do mês e aparece como saída", () => {
    expect(at("2027-02").receivedCents).toBe(-10_000);
    expect(at("2027-02").outCents).toBe(10_500);
  });

  it("entradas, saídas e resultado parcial acumulado", () => {
    expect(at("2027-01")).toMatchObject({ inCents: 20_000, outCents: 2_500, resultCents: 17_500 });
    expect(at("2027-02").resultCents).toBe(-500);
    expect(at("2027-11").cumulativeResultCents).toBe(17_000);
  });

  it("totais da série batem com o livro-caixa", () => {
    const totalIn = series.reduce((s, p) => s + p.inCents, 0);
    const totalOut = series.reduce((s, p) => s + p.outCents, 0);
    const cash = lines.filter((l) => l.account === "CASH").reduce((s, l) => s + l.amountCents, 0);
    expect(totalIn - totalOut).toBe(cash);
  });

  it("recorte de período e atalhos", () => {
    expect(slicePeriod(series, "2027-01", "2027-02").map((p) => p.competence)).toEqual(["2027-01", "2027-02"]);
    expect(periodPresets(months, "2027-02").last3).toEqual({ from: "2026-12", to: "2027-02" });
    expect(periodPresets(months, "2026-10").last6.from).toBe("2026-10"); // limitado ao início
  });
});

describe("extrato individual", () => {
  it("lista somente dinheiro recebido, com estornos e saldo acumulado", () => {
    const statement = buildStatement([
      {
        id: "a",
        amountCents: 10_000,
        status: "CONFIRMED",
        receivedAt: "2026-12-05",
        reversedAt: null,
        method: "PIX_MANUAL",
      },
      {
        id: "b",
        amountCents: 5_000,
        status: "UNDER_REVIEW",
        receivedAt: "2026-12-06",
        reversedAt: null,
        method: "PIX_MANUAL",
      },
      { id: "c", amountCents: 3_000, status: "CANCELLED", receivedAt: "2026-12-07", reversedAt: null, method: "CASH" },
      {
        id: "d",
        amountCents: 10_000,
        status: "REVERSED",
        receivedAt: "2027-01-05",
        reversedAt: "2027-01-08",
        method: "PIX_MANUAL",
      },
      { id: "e", amountCents: 6_000, status: "CONFIRMED", receivedAt: "2027-01-06", reversedAt: null, method: "CASH" },
    ]);
    expect(statement.map((e) => [e.date, e.kind, e.amountCents, e.balanceCents])).toEqual([
      ["2026-12-05", "CONTRIBUTION", 10_000, 10_000],
      ["2027-01-05", "CONTRIBUTION", 10_000, 20_000],
      ["2027-01-06", "CONTRIBUTION", 6_000, 26_000],
      ["2027-01-08", "REVERSAL", -10_000, 16_000],
    ]);
  });
});
