import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, FastForward, Wallet } from "lucide-react";
import type { ContributionSummary, InstallmentCoverage } from "@/domain/contributions";
import { formatCompetence, formatDateBR } from "@/domain/dates";
import { formatBRL, type Cents } from "@/domain/money";
import { InstallmentStatusBadge } from "@/components/finance/status-badges";
import { Card } from "@/components/ui/card";
import { MoneyValue } from "@/components/ui/money-value";
import { cn } from "@/lib/cn";

export function installmentStatus(i: InstallmentCoverage): string {
  if (i.situation === "PAID") return i.advanced ? "ADVANCED" : "PAID";
  if (i.overdue) return "OVERDUE";
  return i.situation === "PARTIAL" ? "PARTIAL" : "OPEN";
}

function Metric({
  label,
  icon: Icon,
  children,
  hint,
  tone = "default",
}: {
  label: string;
  icon: typeof Wallet;
  children: React.ReactNode;
  hint?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        tone === "danger" ? "bg-danger-bg border-red-200" : "border-line bg-white",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-xs font-semibold",
          tone === "danger" ? "text-danger" : "text-muted",
        )}
      >
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <div className="mt-1.5 text-lg">{children}</div>
      {hint && <p className="text-muted mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

/** Resumo das contribuições de uma participação — previsto, recebido e pendente separados. */
export function ContributionSummaryGrid({
  summary,
  monthlyCents,
}: {
  summary: ContributionSummary;
  monthlyCents: Cents;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
      <Metric label="Mensalidade" icon={CalendarClock}>
        <MoneyValue cents={monthlyCents} />
      </Metric>
      <Metric label="Previsto no ciclo" icon={Clock3} hint="Obrigação, não é dinheiro">
        <MoneyValue cents={summary.expectedTotalCents} />
      </Metric>
      <Metric label="Total recebido" icon={CheckCircle2} hint="Pagamentos confirmados">
        <MoneyValue cents={summary.receivedCents} kind="received" />
      </Metric>
      <Metric
        label="Em atraso"
        icon={AlertTriangle}
        tone={summary.overdueCents > 0 ? "danger" : "default"}
        hint={summary.overdueCount > 0 ? `${summary.overdueCount} parcela(s)` : "Nenhuma"}
      >
        <MoneyValue cents={summary.overdueCents} />
      </Metric>
      <Metric
        label="Antecipado"
        icon={FastForward}
        hint={`${summary.advancedCount} parcela(s) quitada(s) antes do vencimento`}
      >
        <MoneyValue cents={summary.advancedCents} />
      </Metric>
      <Metric
        label="Falta pagar no ciclo"
        icon={Wallet}
        hint={summary.underReviewCents > 0 ? `${formatBRL(summary.underReviewCents)} em análise` : undefined}
      >
        <MoneyValue cents={summary.remainingCents} />
      </Metric>
    </div>
  );
}

export function InstallmentsTable({ installments }: { installments: InstallmentCoverage[] }) {
  if (installments.length === 0) {
    return <p className="text-muted p-5 text-center text-sm">Nenhuma parcela prevista.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-muted border-line border-b text-left text-xs">
            <th className="px-4 py-2.5 font-semibold">Competência</th>
            <th className="px-4 py-2.5 font-semibold">Vencimento</th>
            <th className="px-4 py-2.5 text-right font-semibold">Previsto</th>
            <th className="px-4 py-2.5 text-right font-semibold">Coberto</th>
            <th className="px-4 py-2.5 font-semibold">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {installments.map((i) => (
            <tr key={i.id}>
              <td className="px-4 py-2.5 font-semibold">{formatCompetence(i.competence)}</td>
              <td className="tabular px-4 py-2.5">{formatDateBR(i.dueDate)}</td>
              <td className="tabular px-4 py-2.5 text-right">{formatBRL(i.expectedCents)}</td>
              <td className="tabular px-4 py-2.5 text-right">
                {i.coveredCents > 0 ? (
                  <MoneyValue cents={i.coveredCents} kind="received" className="font-semibold" />
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2.5">
                <InstallmentStatusBadge status={installmentStatus(i)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SummaryCard({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {title && <h2 className="border-line border-b px-5 py-3.5 text-base font-bold">{title}</h2>}
      {children}
    </Card>
  );
}
