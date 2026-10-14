import { describe, expect, it } from "vitest";
import { buildSchedule, expectedTotal, InstallmentError, monthlyAmount } from "@/domain/installments";

const CYCLE = { cycleStart: "2026-12-01", contributionEnd: "2027-11-30", dueDay: 10 };

describe("cálculo de cotas", () => {
  it("João: 2 cotas de R$ 50 = R$ 100 por mês (exemplo do enunciado)", () => {
    expect(monthlyAmount(2, 5_000)).toBe(10_000);
  });

  it("cotas de R$ 100", () => {
    expect(monthlyAmount(3, 10_000)).toBe(30_000);
  });

  it("rejeita quantidade ou valor inválidos", () => {
    expect(() => monthlyAmount(0, 5_000)).toThrow(InstallmentError);
    expect(() => monthlyAmount(1.5, 5_000)).toThrow(InstallmentError);
    expect(() => monthlyAmount(1, 0)).toThrow(InstallmentError);
    expect(() => monthlyAmount(1, 50.5)).toThrow();
  });
});

describe("cronograma de parcelas previstas", () => {
  it("ciclo dez/2026 a nov/2027 gera 12 parcelas com vencimento no dia 10", () => {
    const schedule = buildSchedule({ ...CYCLE, joinedAt: "2026-12-01", monthlyCents: 10_000 });
    expect(schedule).toHaveLength(12);
    expect(schedule[0]).toEqual({ competence: "2026-12", dueDate: "2026-12-10", expectedCents: 10_000 });
    expect(schedule[11]).toEqual({ competence: "2027-11", dueDate: "2027-11-10", expectedCents: 10_000 });
  });

  it("total previsto no ciclo = 12 × mensalidade", () => {
    const schedule = buildSchedule({ ...CYCLE, joinedAt: "2026-12-01", monthlyCents: 10_000 });
    expect(expectedTotal(schedule)).toBe(120_000);
  });

  it("quem entra no meio do ciclo deve a partir do mês de entrada", () => {
    const schedule = buildSchedule({ ...CYCLE, joinedAt: "2027-03-15", monthlyCents: 5_000 });
    expect(schedule).toHaveLength(9);
    expect(schedule[0].competence).toBe("2027-03");
  });

  it("entrada antes do início do ciclo conta a partir do início", () => {
    const schedule = buildSchedule({ ...CYCLE, joinedAt: "2026-06-01", monthlyCents: 5_000 });
    expect(schedule[0].competence).toBe("2026-12");
  });

  it("entrada depois do fim das contribuições não gera parcelas", () => {
    expect(buildSchedule({ ...CYCLE, joinedAt: "2027-12-05", monthlyCents: 5_000 })).toEqual([]);
  });
});
