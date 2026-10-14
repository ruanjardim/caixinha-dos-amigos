import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export type LegendItem = { label: string; color: string; shape: "bar" | "line" };

/**
 * Moldura de gráfico: título, legenda (≥ 2 séries), gráfico e a VISÃO EM TABELA
 * (equivalente acessível — nenhum valor depende do tooltip).
 */
export function ChartCard({
  title,
  description,
  legend,
  table,
  children,
}: {
  title: string;
  description?: ReactNode;
  legend?: LegendItem[];
  table: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <figure className="space-y-3 p-5">
        <figcaption className="space-y-1">
          <h2 className="text-base font-bold">{title}</h2>
          {description && <p className="text-muted text-sm">{description}</p>}
        </figcaption>
        {legend && legend.length > 1 && (
          <ul className="text-ink-soft flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                {l.shape === "bar" ? (
                  <span className="size-2.5 rounded-[3px]" style={{ background: l.color }} aria-hidden />
                ) : (
                  <span className="h-0.5 w-3.5 rounded-full" style={{ background: l.color }} aria-hidden />
                )}
                {l.label}
              </li>
            ))}
          </ul>
        )}
        {children}
        <details className="border-line rounded-xl border text-sm">
          <summary className="text-ink-soft cursor-pointer px-3.5 py-2 font-semibold">Ver em tabela</summary>
          <div className="border-line overflow-x-auto border-t">
            <table className="w-full">
              <thead>
                <tr className="text-muted text-left text-xs">
                  {table.columns.map((c, i) => (
                    <th key={c} className={`px-3.5 py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {table.rows.map((row) => (
                  <tr key={String(row[0])}>
                    {row.map((cell, i) => (
                      <td key={i} className={`px-3.5 py-1.5 ${i > 0 ? "tabular text-right" : "font-semibold"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>
    </Card>
  );
}
