import { describe, expect, it } from "vitest";
import {
  canRecordMoney,
  checkRaffleAuthorization,
  formatRaffleNumber,
  FundraisingError,
  initialComplianceStatus,
  MAX_RAFFLE_NUMBERS,
  simulateDraw,
  validateNumberRange,
} from "@/domain/fundraising";

const RULES = "Regulamento: sorteio pela extração da Loteria Federal do dia 20/12, prêmio entregue em até 30 dias.";
const ok = {
  type: "RAFFLE" as const,
  complianceStatus: "APPROVED" as const,
  salesFlagEnabled: true,
  promotionRules: RULES,
  numbersGenerated: false,
};

describe("conformidade de sorteios (desativado por padrão)", () => {
  it("sorteio começa em análise; demais atividades não exigem parecer", () => {
    expect(initialComplianceStatus("RAFFLE")).toBe("PENDING_REVIEW");
    expect(initialComplianceStatus("EVENT")).toBe("NOT_REQUIRED");
  });

  it("modo autorizado exige TODAS as condições", () => {
    expect(checkRaffleAuthorization(ok)).toEqual({ ok: true });
  });

  it.each([
    [{ complianceStatus: "PENDING_REVIEW" as const }, /parecer de conformidade aprovado/],
    [{ salesFlagEnabled: false }, /desligado na Conformidade/],
    [{ promotionRules: "curto" }, /regulamento/],
    [{ promotionRules: null }, /regulamento/],
    [{ numbersGenerated: true }, /gerada em simulação/],
    [{ type: "EVENT" as const }, /Somente atividades do tipo sorteio/],
  ])("bloqueia quando falta: %o", (change, reason) => {
    const r = checkRaffleAuthorization({ ...ok, ...change });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reasons.join(" ")).toMatch(reason);
  });

  it("grupo privado sem parecer e sem recurso ligado: lista os dois impedimentos", () => {
    const r = checkRaffleAuthorization({ ...ok, complianceStatus: "PENDING_REVIEW", salesFlagEnabled: false });
    expect(!r.ok && r.reasons).toHaveLength(2);
  });
});

describe("movimentação de dinheiro", () => {
  it("sorteio em simulação não movimenta dinheiro", () => {
    expect(canRecordMoney({ type: "RAFFLE", complianceStatus: "APPROVED", simulationOnly: true }).ok).toBe(false);
  });
  it("sorteio autorizado e atividades comuns podem", () => {
    expect(canRecordMoney({ type: "RAFFLE", complianceStatus: "APPROVED", simulationOnly: false }).ok).toBe(true);
    expect(canRecordMoney({ type: "EVENT", complianceStatus: "NOT_REQUIRED", simulationOnly: true }).ok).toBe(true);
  });
  it("parecer reprovado bloqueia qualquer atividade", () => {
    expect(canRecordMoney({ type: "PRODUCT_SALE", complianceStatus: "REJECTED", simulationOnly: true }).ok).toBe(false);
  });
});

describe("numeração e sorteio simulado", () => {
  it("valida a faixa e o limite", () => {
    expect(() => validateNumberRange(1, 100)).not.toThrow();
    expect(() => validateNumberRange(0, MAX_RAFFLE_NUMBERS - 1)).not.toThrow();
    expect(() => validateNumberRange(1, MAX_RAFFLE_NUMBERS + 1)).toThrow(FundraisingError);
    expect(() => validateNumberRange(10, 5)).toThrow(FundraisingError);
    expect(() => validateNumberRange(-1, 5)).toThrow(FundraisingError);
  });

  it("formata com zeros à esquerda", () => {
    expect(formatRaffleNumber(7, 1000)).toBe("0007");
    expect(formatRaffleNumber(42, 99)).toBe("42");
  });

  it("escolhe só entre confirmados, com gerador injetado", () => {
    expect(simulateDraw([10, 20, 30], () => 2)).toBe(30);
    expect(() => simulateDraw([], () => 0)).toThrow(/Não há números confirmados/);
    expect(() => simulateDraw([1], () => 5)).toThrow(/Gerador/);
  });

  it("distribuição aproximadamente uniforme com o gerador criptográfico", async () => {
    const { randomInt } = await import("node:crypto");
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8_000; i++) counts[[1, 2, 3, 4].indexOf(simulateDraw([1, 2, 3, 4], (n) => randomInt(n)))]++;
    for (const c of counts) expect(c).toBeGreaterThan(1_700); // esperado 2.000 cada
  });
});
