import { describe, expect, it } from "vitest";
import {
  addMonths,
  competencesBetween,
  DateError,
  daysBetween,
  dueDateFor,
  formatCompetence,
  formatDateBR,
  fromISODate,
  isISODate,
  toISODate,
  todayInBrazil,
} from "@/domain/dates";

describe("datas de calendário", () => {
  it("valida datas reais", () => {
    expect(isISODate("2026-12-01")).toBe(true);
    expect(isISODate("2028-02-29")).toBe(true); // bissexto
    expect(isISODate("2027-02-29")).toBe(false);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("01/12/2026")).toBe(false);
  });

  it("ida e volta Date ↔ ISO sem deslocamento de fuso", () => {
    expect(toISODate(fromISODate("2026-12-01"))).toBe("2026-12-01");
  });

  it("conta dias corridos (exemplo do cálculo de saldo diário)", () => {
    expect(daysBetween("2026-12-01", "2027-12-01")).toBe(365);
    expect(daysBetween("2027-11-01", "2027-12-01")).toBe(30);
    expect(daysBetween("2027-12-01", "2027-11-01")).toBe(-30);
  });

  it("avança competências atravessando o ano", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(competencesBetween("2026-12", "2027-11")).toHaveLength(12);
  });

  it("vencimento limitado ao último dia do mês", () => {
    expect(dueDateFor("2027-02", 10)).toBe("2027-02-10");
    expect(dueDateFor("2027-02", 31)).toBe("2027-02-28");
    expect(() => dueDateFor("2027-02", 0)).toThrow(DateError);
  });

  it("formata para o padrão brasileiro", () => {
    expect(formatDateBR("2027-11-10")).toBe("10/11/2027");
    expect(formatCompetence("2026-12")).toBe("dez/2026");
  });

  it("'hoje' usa o fuso de Brasília", () => {
    // 02:00 UTC de 15/10 ainda é 14/10 em Brasília (UTC−3).
    expect(todayInBrazil(new Date("2026-10-15T02:00:00Z"))).toBe("2026-10-14");
  });
});
