import { formatDateBR, isISODate } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import type { CellKind, CellValue } from "./types";

/** Formatação textual de uma célula (PDF e telas). */
export function formatCell(value: CellValue, kind: CellKind): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (kind) {
    case "money":
      return typeof value === "number" ? formatBRL(value) : String(value);
    case "date":
      return typeof value === "string" && isISODate(value) ? formatDateBR(value) : String(value);
    case "int":
      return typeof value === "number" ? value.toLocaleString("pt-BR") : String(value);
    case "percent":
      return typeof value === "number"
        ? `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
        : String(value);
    default:
      return String(value);
  }
}

/**
 * A fonte Helvetica embutida no PDF usa a codificação WinAnsi: caracteres fora dela
 * (Σ, sinal de menos "−", setas, ≥/≤) viram lixo. Troca por equivalentes seguros.
 */
const PDF_REPLACEMENTS: [RegExp, string][] = [
  [/−/g, "-"],
  [/Σ\s*/g, "soma de "],
  [/→/g, "->"],
  [/≥/g, ">="],
  [/≤/g, "<="],
];

export function pdfText(text: string): string {
  return PDF_REPLACEMENTS.reduce((t, [re, to]) => t.replace(re, to), text);
}
