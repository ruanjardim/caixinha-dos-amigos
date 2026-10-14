import { describe, expect, it } from "vitest";
import { summarizeContributions, type InstallmentInput, type PaymentInput } from "@/domain/contributions";
import { buildSchedule } from "@/domain/installments";

// João: 2 cotas de R$ 50 → R$ 100/mês, ciclo dez/2026–nov/2027, vencimento dia 10.
const installments: InstallmentInput[] = buildSchedule({
  cycleStart: "2026-12-01",
  contributionEnd: "2027-11-30",
  dueDay: 10,
  joinedAt: "2026-12-01",
  monthlyCents: 10_000,
}).map((s, i) => ({ ...s, id: `i${i}`, cancelled: false }));

let seq = 0;
const confirmed = (amountCents: number): PaymentInput => ({ id: `p${seq++}`, amountCents, status: "CONFIRMED" });

describe("situação das contribuições", () => {
  it("sem pagamentos: tudo previsto, nada recebido", () => {
    const s = summarizeContributions({ installments, payments: [], today: "2026-11-01" });
    expect(s.expectedTotalCents).toBe(120_000);
    expect(s.receivedCents).toBe(0);
    expect(s.remainingCents).toBe(120_000);
    expect(s.overdueCount).toBe(0);
    expect(s.nextDue?.dueDate).toBe("2026-12-10");
  });

  it("parcela vencida e não paga fica em atraso (o dia do vencimento ainda não é atraso)", () => {
    expect(summarizeContributions({ installments, payments: [], today: "2026-12-10" }).overdueCount).toBe(0);
    const s = summarizeContributions({ installments, payments: [], today: "2026-12-11" });
    expect(s.overdueCount).toBe(1);
    expect(s.overdueCents).toBe(10_000);
  });

  it("pagamento parcial cobre parte da parcela", () => {
    const s = summarizeContributions({ installments, payments: [confirmed(6_000)], today: "2026-12-20" });
    expect(s.installments[0]).toMatchObject({ situation: "PARTIAL", coveredCents: 6_000, remainingCents: 4_000 });
    expect(s.overdueCents).toBe(4_000);
    expect(s.receivedCents).toBe(6_000);
  });

  it("dois pagamentos parciais completam a parcela", () => {
    const s = summarizeContributions({
      installments,
      payments: [confirmed(6_000), confirmed(4_000)],
      today: "2026-12-20",
    });
    expect(s.installments[0].situation).toBe("PAID");
    expect(s.overdueCount).toBe(0);
  });

  it("antecipação integral: R$ 1.200 cobre o ciclo inteiro", () => {
    const s = summarizeContributions({ installments, payments: [confirmed(120_000)], today: "2026-12-05" });
    expect(s.remainingCents).toBe(0);
    expect(s.openCount).toBe(0);
    expect(s.advancedCount).toBe(12);
    expect(s.advancedCents).toBe(120_000);
    expect(s.nextDue).toBeNull();
  });

  it("antecipação parcial: R$ 350 em dezembro cobre 3 parcelas e meia", () => {
    const s = summarizeContributions({ installments, payments: [confirmed(35_000)], today: "2026-12-05" });
    expect(s.installments.slice(0, 3).every((i) => i.situation === "PAID")).toBe(true);
    expect(s.installments[3]).toMatchObject({ situation: "PARTIAL", coveredCents: 5_000 });
    expect(s.advancedCents).toBe(35_000);
    expect(s.nextDue?.competence).toBe("2027-03");
  });

  it("pagamento em atraso quita primeiro a parcela mais antiga", () => {
    const s = summarizeContributions({ installments, payments: [confirmed(10_000)], today: "2027-01-20" });
    expect(s.installments[0].situation).toBe("PAID");
    expect(s.installments[1]).toMatchObject({ situation: "OPEN", overdue: true });
  });

  it("pagamento estornado não conta como recebido", () => {
    const s = summarizeContributions({
      installments,
      payments: [{ id: "x", amountCents: 10_000, status: "REVERSED" }],
      today: "2026-12-20",
    });
    expect(s.receivedCents).toBe(0);
    expect(s.overdueCount).toBe(1);
  });

  it("pagamento cancelado não conta; em análise aparece separado e NÃO cobre parcelas", () => {
    const s = summarizeContributions({
      installments,
      payments: [
        { id: "a", amountCents: 10_000, status: "CANCELLED" },
        { id: "b", amountCents: 10_000, status: "UNDER_REVIEW" },
      ],
      today: "2026-12-20",
    });
    expect(s.receivedCents).toBe(0);
    expect(s.underReviewCents).toBe(10_000);
    expect(s.installments[0].situation).toBe("OPEN");
  });

  it("valor acima do total previsto vira crédito (excedente)", () => {
    const s = summarizeContributions({ installments, payments: [confirmed(125_000)], today: "2026-12-05" });
    expect(s.creditCents).toBe(5_000);
    expect(s.remainingCents).toBe(0);
  });

  it("parcelas canceladas (saída do participante) deixam de ser devidas", () => {
    const withCancelled = installments.map((i, idx) => ({ ...i, cancelled: idx >= 6 }));
    const s = summarizeContributions({ installments: withCancelled, payments: [], today: "2026-11-01" });
    expect(s.expectedTotalCents).toBe(60_000);
    expect(s.installments).toHaveLength(6);
  });

  it("previsto e recebido nunca se misturam", () => {
    const s = summarizeContributions({ installments, payments: [confirmed(30_000)], today: "2027-06-20" });
    expect(s.expectedTotalCents).toBe(120_000);
    expect(s.receivedCents).toBe(30_000);
    expect(s.remainingCents).toBe(s.expectedTotalCents - s.receivedCents);
  });
});
