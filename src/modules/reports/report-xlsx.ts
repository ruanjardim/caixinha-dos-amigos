import ExcelJS from "exceljs";
import { fromISODate, isISODate } from "@/domain/dates";
import type { CellKind, CellValue, ReportDoc } from "./types";

const MONEY_FMT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const GREEN = "FF039855";

/** Valor nativo do Excel: dinheiro em reais (número), data como data, texto como TEXTO (nunca fórmula). */
function excelValue(value: CellValue, kind: CellKind): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (kind === "money" && typeof value === "number") return value / 100;
  if (kind === "percent" && typeof value === "number") return value / 100;
  if (kind === "date" && typeof value === "string" && isISODate(value)) return fromISODate(value);
  // Texto vai como string tipada: o Excel não o interpreta como fórmula.
  if (typeof value === "string") return value;
  return value;
}

function numFmt(kind: CellKind) {
  return kind === "money"
    ? MONEY_FMT
    : kind === "date"
      ? "dd/mm/yyyy"
      : kind === "percent"
        ? "0.00%"
        : kind === "int"
          ? "#,##0"
          : undefined;
}

/** Nome de aba válido no Excel (≤ 31 caracteres, sem []:*?/\). */
function sheetName(title: string, used: Set<string>) {
  const base =
    title
      .replace(/[[\]:*?/\\]/g, " ")
      .slice(0, 28)
      .trim() || "Dados";
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name);
  return name;
}

export async function reportToXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Caixinha dos Amigos";
  wb.title = `${doc.title} — ${doc.subtitle}`;
  wb.created = new Date();
  const used = new Set<string>();

  // Aba de resumo
  const summary = wb.addWorksheet(sheetName("Resumo", used));
  summary.columns = [{ width: 44 }, { width: 28 }];
  summary.addRow([doc.title]).font = { bold: true, size: 14, color: { argb: GREEN } };
  summary.addRow([doc.subtitle]);
  summary.addRow([`Gerado em ${doc.generatedAt}`]).font = { italic: true, color: { argb: "FF66746E" } };
  if (doc.stamp) summary.addRow([doc.stamp]).font = { bold: true, color: { argb: "FFB54708" } };
  summary.addRow([]);
  for (const item of doc.summary) {
    const row = summary.addRow([item.label, excelValue(item.value, item.kind)]);
    row.getCell(1).font = { bold: true };
    const fmt = numFmt(item.kind);
    if (fmt) row.getCell(2).numFmt = fmt;
  }
  if (doc.notes.length) {
    summary.addRow([]);
    for (const n of doc.notes) {
      const row = summary.addRow([n]);
      row.getCell(1).alignment = { wrapText: true };
      summary.mergeCells(row.number, 1, row.number, 2);
      row.height = 30;
    }
  }

  // Uma aba por seção
  for (const section of doc.sections) {
    const ws = wb.addWorksheet(sheetName(section.title, used), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = section.columns.map((c) => ({
      header: c.label,
      key: c.key,
      width: Math.max(12, Math.round((c.width ?? 1.4) * 10)),
      style: numFmt(c.kind) ? { numFmt: numFmt(c.kind) } : {},
    }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };

    for (const row of section.rows) {
      ws.addRow(Object.fromEntries(section.columns.map((c) => [c.key, excelValue(row[c.key] ?? null, c.kind)])));
    }
    if (section.rows.length === 0) ws.addRow({ [section.columns[0].key]: section.emptyMessage ?? "Sem registros." });
    if (section.totals && section.rows.length > 0) {
      const totals = ws.addRow(
        Object.fromEntries(section.columns.map((c) => [c.key, excelValue(section.totals![c.key] ?? null, c.kind)])),
      );
      totals.font = { bold: true };
      totals.border = { top: { style: "thin" } };
    }
    if (section.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1 + section.rows.length, column: section.columns.length },
      };
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
