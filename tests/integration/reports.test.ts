/**
 * Relatórios: dados, PDF e Excel para os 10 tipos, contra o banco de TESTES.
 */
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";
import { addMembership, closeContributions, createCycle, openCycle, publishRules } from "@/modules/cycles/service";
import { recordManualEntry } from "@/modules/ledger/service";
import { registerPayment } from "@/modules/payments/service";
import { buildReport } from "@/modules/reports/data";
import { canEmitReport } from "@/modules/reports/policy";
import { ReportPdf } from "@/modules/reports/report-pdf";
import { reportToXlsx } from "@/modules/reports/report-xlsx";
import { REPORT_TYPES } from "@/modules/reports/types";
import { approveResults, calculateResults } from "@/modules/results/service";

const enabled = Boolean(process.env.DATABASE_URL);
const TODAY = "2026-01-20";

describe("quem emite cada relatório", () => {
  const admin: Actor = { userId: "a", role: "ADMIN", status: "ACTIVE", participantId: null };
  const joao: Actor = { userId: "j", role: "PARTICIPANT", status: "ACTIVE", participantId: "p-joao" };

  it("consolidados: só administração", () => {
    for (const t of REPORT_TYPES.filter((t) => t !== "prestacao-de-contas" && t !== "extrato")) {
      expect(canEmitReport(admin, t, { isMemberOfCycle: false }), t).toBe(true);
      expect(canEmitReport(joao, t, { isMemberOfCycle: true }), t).toBe(false);
    }
  });

  it("prestação de contas: participante só do próprio ciclo", () => {
    expect(canEmitReport(joao, "prestacao-de-contas", { isMemberOfCycle: true })).toBe(true);
    expect(canEmitReport(joao, "prestacao-de-contas", { isMemberOfCycle: false })).toBe(false);
  });

  it("extrato: só o próprio (ou a administração)", () => {
    expect(canEmitReport(joao, "extrato", { isMemberOfCycle: true, statementParticipantId: "p-joao" })).toBe(true);
    expect(canEmitReport(joao, "extrato", { isMemberOfCycle: true, statementParticipantId: "p-maria" })).toBe(false);
    expect(canEmitReport(admin, "extrato", { isMemberOfCycle: false, statementParticipantId: "p-maria" })).toBe(true);
    expect(
      canEmitReport({ ...joao, status: "SUSPENDED" }, "extrato", {
        isMemberOfCycle: true,
        statementParticipantId: "p-joao",
      }),
    ).toBe(false);
  });
});

describe.skipIf(!enabled)("relatórios (integração)", () => {
  let cycleId: string;
  let membershipId: string;

  beforeAll(async () => {
    const id = randomUUID();
    await db.user.create({
      data: { id, name: "Admin Relatório", email: `${id.slice(0, 8)}@rel.local`, role: "ADMIN" },
    });
    const admin: CurrentUser = {
      userId: id,
      name: "Admin Relatório",
      email: "",
      role: "ADMIN",
      status: "ACTIVE",
      participantId: null,
    };
    cycleId = (
      await createCycle(admin, {
        name: "Relatórios 2025",
        startDate: "2025-01-01",
        contributionEndDate: "2025-12-31",
        settlementDate: "2026-01-15",
        dueDay: 10,
        adminFeePercent: 1000,
        quotaValues: [10_000],
        rulesText: "",
      })
    ).id;
    const p = await db.participant.create({
      data: {
        fullName: "Zuleica Nome Sigiloso",
        email: `${id.slice(0, 8)}@z.local`,
        joinedAt: new Date("2025-01-01T00:00:00Z"),
      },
    });
    membershipId = (
      await addMembership(admin, cycleId, {
        participantId: p.id,
        quotaCount: 1,
        quotaValueCents: 10_000,
        joinedAt: "2025-01-01",
      })
    ).id;
    await publishRules(admin, cycleId);
    await openCycle(admin, cycleId);
    await registerPayment(
      admin,
      {
        membershipId,
        amountCents: 120_000,
        receivedAt: "2025-01-02",
        method: "CASH",
        transactionRef: null,
        notes: null,
        idempotencyKey: randomUUID(),
        acknowledgeDuplicate: true,
        confirmNow: true,
        confirmationNote: null,
      },
      TODAY,
    );
    await recordManualEntry(admin, {
      cycleId,
      kind: "REVENUE",
      amountCents: 50_000,
      occurredOn: "2025-05-01",
      description: '=HYPERLINK("http://x") bazar',
    });
    await closeContributions(admin, cycleId, TODAY);
    const calc = await calculateResults(admin, cycleId);
    await approveResults(admin, calc.id);
  });

  it.each(REPORT_TYPES)(
    "%s: gera dados, PDF e Excel válidos",
    async (type) => {
      const doc = await buildReport(type, cycleId, { membershipId });
      expect(doc.title.length).toBeGreaterThan(3);
      const pdf = await renderToBuffer(createElement(ReportPdf, { doc }) as Parameters<typeof renderToBuffer>[0]);
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const xlsx = await reportToXlsx(doc);
      expect(xlsx.subarray(0, 2).toString("latin1")).toBe("PK"); // arquivo .xlsx (zip)
    },
    30_000,
  );

  it("prestação de contas coletiva não contém o nome do participante", async () => {
    const doc = await buildReport("prestacao-de-contas", cycleId);
    expect(JSON.stringify(doc)).not.toContain("Zuleica");
    const consolidated = await buildReport("contribuicoes", cycleId);
    expect(JSON.stringify(consolidated)).toContain("Zuleica"); // consolidado (admin) tem
  });

  it("distribuição mostra a apuração aprovada; Excel guarda dinheiro como número e texto como texto", async () => {
    const doc = await buildReport("distribuicao", cycleId);
    expect(doc.stamp).toBeUndefined(); // aprovada: sem selo de rascunho
    const row = doc.sections[0].rows[0];
    expect(row.resultado).toBe(45_000); // 50.000 − 10%

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await reportToXlsx(doc)) as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const sheet = wb.worksheets[1];
    const cell = sheet.getRow(2).getCell(5);
    expect(cell.value).toBe(450); // R$ 450,00 como número
    expect(cell.numFmt).toContain("R$");

    const movements = new ExcelJS.Workbook();
    await movements.xlsx.load(
      (await reportToXlsx(await buildReport("movimentacoes", cycleId))) as unknown as Parameters<
        typeof movements.xlsx.load
      >[0],
    );
    const texts = movements.worksheets[1].getColumn(3).values.filter((v) => typeof v === "string") as string[];
    const injected = texts.find((t) => t.startsWith("=HYPERLINK"));
    expect(injected).toBeDefined(); // permanece texto, não vira fórmula
    const formulaCells: unknown[] = [];
    movements.worksheets[1].eachRow((r) => r.eachCell((c) => c.formula && formulaCells.push(c.formula)));
    expect(formulaCells).toHaveLength(0);
  });
});
