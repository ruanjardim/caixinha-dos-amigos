import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatBRL } from "@/domain/money";

/**
 * Adimplência: uma razão → medidor (não pizza). Cores de STATUS (reservadas),
 * sempre com ícone + rótulo + número — nunca cor sozinha.
 */
export function ComplianceMeter({
  upToDate,
  overdue,
  overdueMembers,
  cycleId,
}: {
  upToDate: number;
  overdue: number;
  overdueMembers: { membershipId: string; name: string; overdueCents: number; count: number }[];
  cycleId: string;
}) {
  const total = upToDate + overdue;
  const pct = total ? Math.round((upToDate / total) * 100) : 0;
  return (
    <div className="space-y-4">
      {total === 0 ? (
        <p className="text-muted text-sm">Nenhuma participação ativa.</p>
      ) : (
        <>
          <div
            className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
            role="img"
            aria-label={`${upToDate} em dia e ${overdue} em atraso`}
          >
            {upToDate > 0 && <div className="bg-status-good rounded-l-full" style={{ flexGrow: upToDate }} />}
            {overdue > 0 && <div className="bg-status-critical rounded-r-full" style={{ flexGrow: overdue }} />}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="text-status-good size-4" aria-hidden />
              <strong>{upToDate}</strong> em dia ({pct}%)
            </li>
            <li className="flex items-center gap-1.5">
              <AlertTriangle className="text-status-critical size-4" aria-hidden />
              <strong>{overdue}</strong> em atraso
            </li>
          </ul>
        </>
      )}
      {overdueMembers.length > 0 && (
        <ul className="divide-line border-line divide-y rounded-xl border text-sm">
          {overdueMembers.slice(0, 8).map((m) => (
            <li key={m.membershipId}>
              <Link
                href={`/admin/ciclos/${cycleId}/participacoes/${m.membershipId}`}
                className="hover:bg-canvas flex items-center justify-between gap-3 px-3.5 py-2"
              >
                <span className="truncate font-semibold">{m.name}</span>
                <span className="tabular text-danger shrink-0 font-semibold">
                  {formatBRL(m.overdueCents)} · {m.count} parc.
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
