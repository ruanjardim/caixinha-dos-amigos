import { describe, expect, it } from "vitest";
import { summarizeContributions } from "@/domain/contributions";
import { selectDueReminders } from "@/domain/reminders";

const installments = [
  { id: "dez", competence: "2026-12", dueDate: "2026-12-10", expectedCents: 10_000, cancelled: false },
  { id: "jan", competence: "2027-01", dueDate: "2027-01-10", expectedCents: 10_000, cancelled: false },
  { id: "fev", competence: "2027-02", dueDate: "2027-02-10", expectedCents: 10_000, cancelled: false },
];

function remind(today: string, paidCents = 0) {
  const summary = summarizeContributions({
    installments,
    payments: paidCents ? [{ id: "p", amountCents: paidCents, status: "CONFIRMED" }] : [],
    today,
  });
  return selectDueReminders(summary.installments, today).map((r) => `${r.installmentId}:${r.kind}`);
}

describe("lembretes de vencimento", () => {
  it("avisa nos 3 dias anteriores ao vencimento (inclusive no dia)", () => {
    expect(remind("2026-12-06")).toEqual([]);
    expect(remind("2026-12-07")).toEqual(["dez:before"]);
    expect(remind("2026-12-10")).toEqual(["dez:before"]);
  });

  it("avisa atraso dentro da janela de 30 dias", () => {
    expect(remind("2026-12-11")).toEqual(["dez:late"]);
    expect(remind("2027-01-09")).toEqual(["dez:late", "jan:before"]);
    expect(remind("2027-01-15")).toEqual(["jan:late"]); // dezembro passou da janela
  });

  it("não lembra parcelas cobertas, nem as cobertas parcialmente além do restante", () => {
    expect(remind("2026-12-08", 10_000)).toEqual([]);
    const partial = summarizeContributions({
      installments,
      payments: [{ id: "p", amountCents: 4_000, status: "CONFIRMED" }],
      today: "2026-12-08",
    });
    expect(selectDueReminders(partial.installments, "2026-12-08")[0]?.remainingCents).toBe(6_000);
  });
});
