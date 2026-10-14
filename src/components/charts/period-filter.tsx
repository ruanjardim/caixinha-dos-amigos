import Link from "next/link";
import { formatCompetence, type Competence } from "@/domain/dates";
import { cn } from "@/lib/cn";

type Range = { from: Competence; to: Competence };

/**
 * Filtros em UMA linha, acima de tudo o que eles recortam (ciclo e período).
 * Formulário GET simples: funciona sem JavaScript e o link pode ser compartilhado.
 */
export function PeriodFilter({
  basePath,
  cycles,
  cycleId,
  months,
  current,
  presets,
}: {
  basePath: string;
  cycles: { id: string; name: string }[];
  cycleId: string;
  months: Competence[];
  current: Range;
  presets: { all: Range; last3: Range; last6: Range };
}) {
  const href = (r: Range) => `${basePath}?ciclo=${cycleId}&de=${r.from}&ate=${r.to}`;
  const isActive = (r: Range) => r.from === current.from && r.to === current.to;
  const presetLinks: [string, Range][] = [
    ["Ciclo todo", presets.all],
    ["Últimos 6 meses", presets.last6],
    ["Últimos 3 meses", presets.last3],
  ];
  const selectClass = "border-line h-10 rounded-xl border bg-white px-3 text-sm";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav className="flex flex-wrap gap-1.5" aria-label="Atalhos de período">
        {presetLinks.map(([label, r]) => (
          <Link
            key={label}
            href={href(r)}
            aria-current={isActive(r) ? "true" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap",
              isActive(r) ? "bg-brand-600 text-white" : "border-line text-ink-soft hover:bg-canvas border bg-white",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
        {cycles.length > 1 ? (
          <select name="ciclo" defaultValue={cycleId} aria-label="Ciclo" className={selectClass}>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="ciclo" value={cycleId} />
        )}
        <select name="de" defaultValue={current.from} aria-label="De" className={selectClass}>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatCompetence(m)}
            </option>
          ))}
        </select>
        <span className="text-muted text-sm">até</span>
        <select name="ate" defaultValue={current.to} aria-label="Até" className={selectClass}>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatCompetence(m)}
            </option>
          ))}
        </select>
        <button type="submit" className="bg-ink h-10 rounded-xl px-4 text-sm font-semibold text-white">
          Aplicar
        </button>
      </form>
    </div>
  );
}
