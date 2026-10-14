import Link from "next/link";
import { CalendarPlus, CalendarRange, ChevronRight } from "lucide-react";
import { CycleStatusBadge } from "@/components/finance/status-badges";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { formatPercentBps } from "@/domain/rules";
import { requirePagePermission } from "@/modules/auth/session";
import { listCycles } from "@/modules/cycles/queries";

export const metadata = { title: "Ciclos e cotas" };

export default async function CyclesPage() {
  await requirePagePermission("cycles.manage");
  const cycles = await listCycles();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ciclos e cotas"
        description="Cada ciclo tem suas datas, valores de cota e regras aceitas pelos participantes."
        actions={
          <LinkButton href="/admin/ciclos/novo">
            <CalendarPlus className="size-4" aria-hidden /> Novo ciclo
          </LinkButton>
        }
      />
      <Card className="overflow-hidden">
        {cycles.length === 0 ? (
          <EmptyState icon={<CalendarRange className="size-7" />} title="Nenhum ciclo criado">
            Crie o primeiro ciclo anual da caixinha.
          </EmptyState>
        ) : (
          <ul className="divide-line divide-y">
            {cycles.map((c) => {
              const rules = c.rules[0];
              return (
                <li key={c.id}>
                  <Link href={`/admin/ciclos/${c.id}`} className="hover:bg-canvas flex items-center gap-3 px-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-muted text-sm">
                        {formatDateBR(toISODate(c.startDate))} a {formatDateBR(toISODate(c.contributionEndDate))} ·{" "}
                        {c._count.memberships} participante(s)
                        {rules
                          ? ` · cotas ${rules.quotaValuesCents.map((v) => formatBRL(v)).join(", ")} · adm. ${formatPercentBps(rules.adminFeeBps)}`
                          : ""}
                      </p>
                    </div>
                    <CycleStatusBadge status={c.status} />
                    <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
