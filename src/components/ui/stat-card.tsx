import type { LucideIcon } from "lucide-react";
import type { Cents } from "@/domain/money";
import { Card } from "@/components/ui/card";
import { MoneyValue, type MoneyKind } from "@/components/ui/money-value";

export function StatCard({
  label,
  icon: Icon,
  cents,
  value,
  kind = "neutral",
  hint,
}: {
  label: string;
  icon: LucideIcon;
  cents?: Cents;
  value?: string | number;
  kind?: MoneyKind;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-muted flex items-center gap-2 text-sm font-medium">
        <span className="bg-brand-50 text-brand-700 grid size-8 place-items-center rounded-lg">
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </div>
      <div className="mt-3 text-xl sm:text-2xl">
        {cents !== undefined ? (
          <MoneyValue cents={cents} kind={kind} />
        ) : (
          <span className="tabular text-ink font-bold">{value}</span>
        )}
      </div>
      {hint && <p className="text-muted mt-1 text-xs">{hint}</p>}
    </Card>
  );
}
