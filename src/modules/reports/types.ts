/**
 * Modelo neutro de relatório: os dados são montados uma vez e renderizados em PDF e Excel.
 * Valores monetários em CENTAVOS; datas em "AAAA-MM-DD".
 */
export type CellKind = "text" | "money" | "date" | "int" | "percent";
export type CellValue = string | number | null;

export type ReportColumn = { key: string; label: string; kind: CellKind; width?: number };

export type ReportSection = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, CellValue>[];
  totals?: Record<string, CellValue>;
  emptyMessage?: string;
};

export type ReportDoc = {
  /** Nome do arquivo, sem extensão. */
  fileName: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  /** Selo exibido no topo (ex.: "RASCUNHO — não aprovado", "Projeção não garantida"). */
  stamp?: string;
  summary: { label: string; value: CellValue; kind: CellKind }[];
  sections: ReportSection[];
  notes: string[];
};

export const REPORT_TYPES = [
  "contribuicoes",
  "pendencias",
  "movimentacoes",
  "receitas-despesas",
  "resultado",
  "remuneracao",
  "distribuicao",
  "encerramento",
  "prestacao-de-contas",
  "extrato",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TITLES: Record<ReportType, string> = {
  contribuicoes: "Contribuições por participante",
  pendencias: "Pagamentos pendentes",
  movimentacoes: "Movimentações financeiras",
  "receitas-despesas": "Receitas e despesas",
  resultado: "Resultado líquido",
  remuneracao: "Remuneração administrativa",
  distribuicao: "Distribuição dos resultados",
  encerramento: "Encerramento anual",
  "prestacao-de-contas": "Prestação de contas coletiva",
  extrato: "Extrato individual",
};

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}
