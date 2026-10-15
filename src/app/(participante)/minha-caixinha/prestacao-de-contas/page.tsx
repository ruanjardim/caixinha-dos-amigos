import { Landmark, MinusCircle, PiggyBank, PlusCircle, Receipt, Scale, ScrollText, Users } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { CashFlowChart } from "@/components/charts/finance-charts";
import { SummaryCard } from "@/components/finance/contributions";
import { CATEGORY_LABEL } from "@/components/finance/ledger-labels";
import { Alert } from "@/components/ui/alert";
import { DownloadLink } from "@/components/ui/download-link";
import { Card } from "@/components/ui/card";
import { MoneyLegend } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatCompetence, formatDateBR } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { formatPercentBps } from "@/domain/rules";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { requirePagePermission } from "@/modules/auth/session";
import { getCollectiveReport } from "@/modules/dashboard/queries";

export const metadata = { title: "Prestação de contas" };

export default async function CollectiveReportPage({ searchParams }: PageProps<"/minha-caixinha/prestacao-de-contas">) {
  const user = await requirePagePermission("reports.collective");
  const params = await searchParams;

  // Participante: somente ciclos dos quais participa. Administrador: todos os ciclos abertos ou encerrados.
  const cycles = await db.cycle.findMany({
    where: {
      status: { not: "DRAFT" },
      ...(user.role === "ADMIN" ? {} : { memberships: { some: { participantId: user.participantId ?? "-" } } }),
    },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true },
  });
  const requested = typeof params.ciclo === "string" ? params.ciclo : undefined;
  const cycleId = cycles.find((c) => c.id === requested)?.id ?? cycles[0]?.id;
  const report = cycleId ? await getCollectiveReport(cycleId) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Prestação de contas"
        description="Números coletivos do grupo. Nenhum valor individual de participante é exibido aqui."
      />

      {!report ? (
        <Card>
          <EmptyState icon={<ScrollText className="size-7" />} title="Nada para mostrar ainda">
            A prestação de contas aparece quando o seu ciclo for aberto.
          </EmptyState>
        </Card>
      ) : (
        <>
          {cycles.length > 1 && (
            <nav className="flex gap-1 overflow-x-auto" aria-label="Ciclo">
              {cycles.map((c) => (
                <a
                  key={c.id}
                  href={`?ciclo=${c.id}`}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap",
                    c.id === report.cycle.id ? "bg-brand-600 text-white" : "border-line bg-surface border",
                  )}
                >
                  {c.name}
                </a>
              ))}
            </nav>
          )}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do ciclo">
            <StatCard label="Participantes" icon={Users} value={report.participants} hint={`${report.quotas} cotas`} />
            <StatCard label="Saldo em caixa" icon={Landmark} cents={report.overview.cashCents} kind="received" />
            <StatCard
              label="Contribuições"
              icon={PiggyBank}
              cents={report.overview.principalOwedCents}
              hint="Pertencem aos participantes"
            />
            <StatCard label="Receitas adicionais" icon={PlusCircle} cents={report.overview.revenueCents} />
            <StatCard label="Despesas" icon={MinusCircle} cents={report.overview.expenseCents} />
            <StatCard label="Tributos e deduções" icon={Receipt} cents={report.overview.taxCents} />
            <StatCard
              label="Resultado parcial"
              icon={Scale}
              cents={report.overview.partialResultCents}
              kind="projection"
              hint="Ainda não apurado"
            />
            <StatCard
              label="Remuneração adm."
              icon={ScrollText}
              value={report.rules ? formatPercentBps(report.rules.adminFeeBps) : "—"}
              hint="Só sobre resultado positivo"
            />
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MoneyLegend />
            <div className="flex gap-2">
              <DownloadLink
                href={`/api/relatorios/prestacao-de-contas?ciclo=${report.cycle.id}&formato=pdf`}
                icon="pdf"
              />
              <DownloadLink
                href={`/api/relatorios/prestacao-de-contas?ciclo=${report.cycle.id}&formato=xlsx`}
                icon="xlsx"
              />
            </div>
          </div>

          <ChartCard
            title="Entradas e saídas do caixa"
            description="Movimento mensal do grupo (contribuições, receitas, despesas e tributos)."
            legend={[
              { label: "Entradas", color: "#60702f", shape: "bar" },
              { label: "Saídas", color: "#4a3aa7", shape: "bar" },
            ]}
            table={{
              columns: ["Mês", "Entradas", "Saídas", "Contribuições"],
              rows: report.series.map((p) => [
                formatCompetence(p.competence),
                formatBRL(p.inCents),
                formatBRL(p.outCents),
                formatBRL(p.receivedCents),
              ]),
            }}
          >
            <CashFlowChart
              data={report.series.map((p) => ({
                label: formatCompetence(p.competence).replace(/\/20(\d\d)$/, "/$1"),
                inCents: p.inCents,
                outCents: p.outCents,
              }))}
            />
          </ChartCard>

          <SummaryCard title="Receitas, despesas e tributos lançados">
            {report.otherEntries.length === 0 ? (
              <p className="text-muted p-5 text-sm">Nenhum lançamento além das contribuições até agora.</p>
            ) : (
              <ul className="divide-line divide-y">
                {report.otherEntries.map((e) => (
                  <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.description}</p>
                      <p className="text-muted text-xs">
                        {formatDateBR(e.occurredOn)} · {CATEGORY_LABEL[e.category] ?? e.category}
                      </p>
                    </div>
                    <span className={cn("tabular font-bold", e.cashEffectCents < 0 ? "text-ink" : "text-received")}>
                      {e.cashEffectCents < 0 ? "−" : "+"}
                      {formatBRL(Math.abs(e.cashEffectCents))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SummaryCard>

          <Alert tone="info">
            Contribuições aparecem somente somadas por mês. Cada participante vê os próprios pagamentos no extrato
            individual.
          </Alert>
        </>
      )}
    </div>
  );
}
