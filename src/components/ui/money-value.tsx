import { formatBRL, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";

/**
 * Três naturezas de valor, SEMPRE visualmente distintas:
 * - received:   dinheiro efetivamente recebido/confirmado (verde sólido)
 * - calculated: resultado já apurado e aprovado (azul-petróleo)
 * - projection: estimativa não garantida (cinza, sublinhado tracejado, com aviso)
 */
export type MoneyKind = "received" | "calculated" | "projection" | "neutral";

const styles: Record<MoneyKind, string> = {
  received: "text-received",
  calculated: "text-calculated",
  projection: "text-projection italic underline decoration-dashed decoration-1 underline-offset-4",
  neutral: "text-ink",
};

export const MONEY_KIND_LABEL: Record<Exclude<MoneyKind, "neutral">, string> = {
  received: "Recebido",
  calculated: "Apurado",
  projection: "Projeção (não garantida)",
};

export function MoneyValue({
  cents,
  kind = "neutral",
  className,
}: {
  cents: Cents;
  kind?: MoneyKind;
  className?: string;
}) {
  const label = kind === "neutral" ? undefined : MONEY_KIND_LABEL[kind];
  return (
    <span className={cn("tabular font-bold", styles[kind], className)} title={label}>
      {formatBRL(cents)}
      {label && <span className="sr-only"> ({label})</span>}
    </span>
  );
}

export function MoneyLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs", className)}>
      <li className="flex items-center gap-1.5">
        <span className="bg-received size-2.5 rounded-full" aria-hidden /> Recebido
      </li>
      <li className="flex items-center gap-1.5">
        <span className="bg-calculated size-2.5 rounded-full" aria-hidden /> Resultado apurado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="border-projection size-2.5 rounded-full border border-dashed" aria-hidden /> Projeção não
        garantida
      </li>
    </ul>
  );
}
