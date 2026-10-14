import { describe, expect, it } from "vitest";
import {
  allocateLargestRemainder,
  calculateDistribution,
  daysCounted,
  DistributionError,
  memberWeight,
  type DistributionInput,
} from "@/domain/distribution";

const CYCLE = { cycleStart: "2026-12-01", cutoffDate: "2027-11-30", adminFeeBps: 1000 };
const monthly = (amountCents: number) =>
  [
    "2026-12",
    "2027-01",
    "2027-02",
    "2027-03",
    "2027-04",
    "2027-05",
    "2027-06",
    "2027-07",
    "2027-08",
    "2027-09",
    "2027-10",
    "2027-11",
  ].map((m) => ({ date: `${m}-01`, amountCents }));

function input(overrides: Partial<DistributionInput>): DistributionInput {
  return {
    ...CYCLE,
    revenueCents: 0,
    expenseCents: 0,
    taxCents: 0,
    availableCashCents: 10_000_000,
    members: [],
    ...overrides,
  };
}

describe("contagem de dias (data de corte = fim das contribuições)", () => {
  it("01/12/2026 → 30/11/2027 conta 365 dias", () => {
    expect(daysCounted("2026-12-01", CYCLE.cycleStart, CYCLE.cutoffDate)).toBe(365);
  });
  it("no último dia conta 1 dia; depois do corte, 0", () => {
    expect(daysCounted("2027-11-30", CYCLE.cycleStart, CYCLE.cutoffDate)).toBe(1);
    expect(daysCounted("2027-12-05", CYCLE.cycleStart, CYCLE.cutoffDate)).toBe(0);
  });
  it("pagamento ANTES do início conta a partir do início (decisão 3)", () => {
    expect(daysCounted("2026-10-14", CYCLE.cycleStart, CYCLE.cutoffDate)).toBe(365);
  });
});

describe("exemplo do planejamento (Ana antecipou, Bruno pagou mês a mês)", () => {
  const result = calculateDistribution(
    input({
      revenueCents: 140_000,
      availableCashCents: 240_000 + 140_000,
      members: [
        { membershipId: "ana", movements: [{ date: "2026-12-01", amountCents: 120_000 }] },
        { membershipId: "bruno", movements: monthly(10_000) },
      ],
    }),
  );
  const ana = result.shares.find((s) => s.membershipId === "ana")!;
  const bruno = result.shares.find((s) => s.membershipId === "bruno")!;

  it("pesos 438.000 e 237.500 (em R$·dia)", () => {
    expect(ana.weight).toBe(120_000n * 365n);
    expect(bruno.weight).toBe(10_000n * 2_375n);
  });
  it("remuneração de 10% sobre R$ 1.400 = R$ 140; distribuível R$ 1.260", () => {
    expect(result.netResultCents).toBe(140_000);
    expect(result.adminFeeCents).toBe(14_000);
    expect(result.distributableCents).toBe(126_000);
  });
  it("Ana R$ 816,99 e Bruno R$ 443,01 (maior resto)", () => {
    expect(ana.shareCents).toBe(81_699);
    expect(bruno.shareCents).toBe(44_301);
    expect(ana.payoutCents).toBe(120_000 + 81_699);
  });
});

describe("regras de proteção", () => {
  it("não distribui sobre valor não recebido nem após o corte", () => {
    const r = calculateDistribution(
      input({
        revenueCents: 10_000,
        members: [
          { membershipId: "a", movements: [{ date: "2027-01-01", amountCents: 10_000 }] },
          { membershipId: "atrasado", movements: [{ date: "2027-12-10", amountCents: 10_000 }] },
        ],
      }),
    );
    expect(r.shares.find((s) => s.membershipId === "atrasado")).toMatchObject({
      weight: 0n,
      shareCents: 0,
      principalCents: 10_000,
    });
  });

  it("estorno subtrai os dias a partir da sua data", () => {
    const w = memberWeight(
      [
        { date: "2026-12-01", amountCents: 10_000 },
        { date: "2027-01-01", amountCents: -10_000 },
      ],
      CYCLE.cycleStart,
      CYCLE.cutoffDate,
    );
    expect(w).toBe(10_000n * 31n);
  });

  it("saída com devolução: conta só até a saída e não tem principal a receber (decisão 4)", () => {
    const r = calculateDistribution(
      input({
        revenueCents: 20_000,
        members: [
          { membershipId: "ficou", movements: [{ date: "2026-12-01", amountCents: 50_000 }] },
          {
            membershipId: "saiu",
            movements: [
              { date: "2026-12-01", amountCents: 50_000 },
              { date: "2027-06-01", amountCents: -50_000 },
            ],
          },
        ],
      }),
    );
    const saiu = r.shares.find((s) => s.membershipId === "saiu")!;
    const ficou = r.shares.find((s) => s.membershipId === "ficou")!;
    expect(saiu.principalCents).toBe(0);
    expect(saiu.weight).toBe(50_000n * 182n); // 01/12/2026 → 01/06/2027
    expect(saiu.shareCents).toBeGreaterThan(0);
    expect(ficou.shareCents).toBeGreaterThan(saiu.shareCents);
    expect(saiu.shareCents + ficou.shareCents).toBe(r.distributableCents);
  });

  it("prejuízo: proporcional ao principal, sem remuneração (decisão 1); quem saiu não é cobrado", () => {
    const r = calculateDistribution(
      input({
        revenueCents: 1_000,
        expenseCents: 7_000, // prejuízo de R$ 60
        availableCashCents: 300_000 - 6_000,
        members: [
          { membershipId: "a", movements: [{ date: "2026-12-01", amountCents: 200_000 }] },
          { membershipId: "b", movements: [{ date: "2027-05-01", amountCents: 100_000 }] },
          {
            membershipId: "saiu",
            movements: [
              { date: "2026-12-01", amountCents: 30_000 },
              { date: "2027-03-01", amountCents: -30_000 },
            ],
          },
        ],
      }),
    );
    expect(r.netResultCents).toBe(-6_000);
    expect(r.adminFeeCents).toBe(0);
    expect(r.shares.map((s) => [s.membershipId, s.shareCents])).toEqual([
      ["a", -4_000],
      ["b", -2_000],
      ["saiu", 0],
    ]);
    expect(r.shares.find((s) => s.membershipId === "a")!.payoutCents).toBe(196_000);
  });

  it("resultado zero: ninguém ganha nem perde, sem remuneração", () => {
    const r = calculateDistribution(
      input({ revenueCents: 5_000, expenseCents: 5_000, members: [{ membershipId: "a", movements: monthly(1_000) }] }),
    );
    expect(r).toMatchObject({ netResultCents: 0, adminFeeCents: 0, distributableCents: 0 });
    expect(r.shares[0].shareCents).toBe(0);
  });

  it("impede distribuir mais do que o disponível em caixa", () => {
    expect(() =>
      calculateDistribution(
        input({
          revenueCents: 10_000,
          availableCashCents: 10_000 + 9_999, // falta 1 centavo
          members: [{ membershipId: "a", movements: [{ date: "2026-12-01", amountCents: 10_000 }] }],
        }),
      ),
    ).toThrow(/Recursos insuficientes/);
  });

  it("prejuízo maior que todo o principal é recusado", () => {
    expect(() =>
      calculateDistribution(
        input({
          expenseCents: 20_000,
          availableCashCents: 0,
          members: [{ membershipId: "a", movements: [{ date: "2026-12-01", amountCents: 10_000 }] }],
        }),
      ),
    ).toThrow(DistributionError);
  });

  it("remuneração nunca incide sobre o principal", () => {
    const r = calculateDistribution(
      input({
        revenueCents: 0,
        members: [{ membershipId: "a", movements: [{ date: "2026-12-01", amountCents: 1_000_000 }] }],
      }),
    );
    expect(r.adminFeeCents).toBe(0);
  });
});

describe("maior resto", () => {
  it("1 centavo para o maior resto; empates em ordem estável", () => {
    expect(allocateLargestRemainder(100, [1n, 1n, 1n])).toEqual([34, 33, 33]);
    expect(allocateLargestRemainder(-100, [1n, 1n, 1n])).toEqual([-34, -33, -33]);
    expect(allocateLargestRemainder(0, [0n, 0n])).toEqual([0, 0]);
  });

  it("propriedade: a soma SEMPRE fecha exatamente (1.000 casos aleatórios)", () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    for (let k = 0; k < 1_000; k++) {
      const total = rand(10_000_000) - 2_000_000;
      const weights = Array.from({ length: 1 + rand(30) }, () => BigInt(rand(1_000_000_000)) + 1n);
      const parts = allocateLargestRemainder(total, weights);
      expect(parts.reduce((s, p) => s + p, 0)).toBe(total);
      // ninguém recebe mais de 1 centavo além da parte exata
      const sumW = weights.reduce((s, w) => s + w, 0n);
      parts.forEach((p, i) => {
        const exact = (Number(weights[i]) / Number(sumW)) * total;
        expect(Math.abs(p - exact)).toBeLessThanOrEqual(1.000001);
      });
    }
  });
});
