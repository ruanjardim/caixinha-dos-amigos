import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Coins,
  Landmark,
  MinusCircle,
  PlusCircle,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { ComplianceMeter } from "@/components/charts/compliance-meter";
import { CashFlowChart, ContributionsChart, CumulativeResultChart } from "@/components/charts/finance-charts";
import { PeriodFilter } from "@/components/charts/period-filter";
import { CycleStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { MoneyLegend, MoneyValue } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatCompetence, type Competence } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { formatPercentBps } from "@/domain/rules";
import { db } from "@/lib/db";
import { firstName } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import { defaultCycleId, getAdminDashboard, listDashboardCycles } from "@/modules/dashboard/queries";

export const metadata = { title: "Painel do administrador" };

const FLAG_LABELS: Record<string, { title: string; why: string }> = {
  RAFFLE_SALES_ENABLED: { title: "Venda de números de sorteio", why: "Modalidade legal + aprovação de conformidade." },
  PIX_LIVE_ENABLED: { title: "Cobrança Pix real", why: "Estrutura jurídica e conta adequada (não pessoal)." },
  ADMIN_PAYOUT_ENABLED: { title: "Pagamento da remuneração administrativa", why: "Validação jurídica e tributária." },
};

function shortMonth(c: Competence) {
  const [m, y] = formatCompetence(c).split("/");
  return `${m}/${y.slice(2)}`;
}

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  const user = await requirePagePermission("dashboard.admin");
  const params = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);

  const [cycles, flags, underReview] = await Promise.all([
    listDashboardCycles(),
    db.featureFlag.findMany({ orderBy: { key: "asc" } }),
    db.payment.count({ where: { status: "UNDER_REVIEW" } }),
  ]);
  const requested = str(params.ciclo);
  const cycleId = cycles.some((c) => c.id === requested) ? requested! : defaultCycleId(cycles);
  const d = cycleId ? await getAdminDashboard(cycleId, { from: str(params.de), to: str(params.ate) }) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Painel do administrador"
        title={`Olá, ${firstName(user.name)}!`}
        description={d ? `${d.cycle.name} · situação em tempo real` : "Comece criando o primeiro ciclo."}
        actions={d ? <CycleStatusBadge status={d.cycle.status} /> : null}
      />

      {underReview > 0 && (
        <Alert tone="warning" title={`${underReview} pagamento(s) aguardando conferência`}>
          <Link href="/admin/pagamentos?status=UNDER_REVIEW" className="font-semibold underline">
            Conferir agora
          </Link>
        </Alert>
      )}

      {!d ? (
        <Card>
          <EmptyState icon={<CalendarPlus className="size-7" />} title="Nenhum ciclo ainda">
            <LinkButton href="/admin/ciclos/novo" className="mt-2">
              Criar ciclo
            </LinkButton>
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Situação atual do ciclo (independe do período dos gráficos) */}
          <section aria-labelledby="situacao" className="space-y-3">
            <h2 id="situacao" className="text-muted text-sm font-semibold">
              Situação atual do ciclo
            </h2>
            <div className="grid gap-3 lg:grid-cols-[1.2fr_2fr]">
              <Card className="flex flex-col justify-between p-5">
                <p className="text-muted flex items-center gap-2 text-sm font-medium">
                  <Landmark className="text-brand-700 size-4" aria-hidden /> Saldo disponível em caixa
                </p>
                <p className="text-received mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {formatBRL(d.kpis.cashCents)}
                </p>
                <p className="text-muted mt-2 text-xs">
                  {formatBRL(d.kpis.principalOwedCents)} pertencem aos participantes (contribuições). Saldo contábil:
                  concilie com o extrato.
                </p>
              </Card>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard label="Participantes ativos" icon={Users} value={d.kpis.activeMembers} />
                <StatCard
                  label="Cotas"
                  icon={Coins}
                  value={d.kpis.quotas}
                  hint={`${formatBRL(d.kpis.monthlyExpectedCents)}/mês`}
                />
                <StatCard
                  label="Arrecadação prevista"
                  icon={CalendarClock}
                  cents={d.kpis.expectedCents}
                  hint="Total do ciclo (obrigação)"
                />
                <StatCard
                  label="Arrecadação recebida"
                  icon={CheckCircle2}
                  cents={d.kpis.receivedCents}
                  kind="received"
                  hint="Confirmada"
                />
                <StatCard
                  label="Pendente (em atraso)"
                  icon={AlertTriangle}
                  cents={d.kpis.overdueCents}
                  hint={`${d.compliance.overdue} participante(s)`}
                />
                <StatCard
                  label="Em análise"
                  icon={Wallet}
                  cents={d.kpis.underReviewCents}
                  hint="Aguardando conferência"
                />
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Receitas, despesas e resultado</CardTitle>
                <Badge tone="amber">não apurado</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="divide-line divide-y">
                  <ResultRow icon={PlusCircle} label="Receitas adicionais" cents={d.kpis.revenueCents} />
                  <ResultRow icon={MinusCircle} label="Despesas" cents={d.kpis.expenseCents} negative />
                  <ResultRow icon={Receipt} label="Tributos e deduções" cents={d.kpis.taxCents} negative />
                  <ResultRow
                    label="Resultado líquido parcial"
                    cents={d.kpis.partialResultCents}
                    kind="projection"
                    strong
                  />
                  <ResultRow
                    label={`Remuneração administrativa (${d.rules ? formatPercentBps(d.rules.adminFeeBps) : "—"}) — projeção`}
                    cents={d.kpis.adminFeeProjectionCents}
                    kind="projection"
                  />
                  <ResultRow
                    label="Destinado aos participantes — projeção"
                    cents={d.kpis.participantsProjectionCents}
                    kind="projection"
                  />
                </dl>
                <p className="text-muted text-xs">
                  Projeções não garantidas: o resultado só existe após a apuração ao final do ciclo. A remuneração
                  incide apenas sobre resultado líquido positivo, nunca sobre o principal.
                </p>
                <MoneyLegend />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Participantes adimplentes e inadimplentes</CardTitle>
              </CardHeader>
              <CardContent>
                <ComplianceMeter
                  upToDate={d.compliance.upToDate}
                  overdue={d.compliance.overdue}
                  overdueMembers={d.compliance.overdueMembers}
                  cycleId={d.cycle.id}
                />
              </CardContent>
            </Card>
          </div>

          {/* Filtros acima de tudo o que recortam */}
          <section aria-labelledby="graficos" className="space-y-4">
            <div className="space-y-3">
              <h2 id="graficos" className="text-muted text-sm font-semibold">
                Evolução · {formatCompetence(d.period.from)} a {formatCompetence(d.period.to)}
              </h2>
              <PeriodFilter
                basePath="/admin"
                cycles={cycles}
                cycleId={d.cycle.id}
                months={d.months}
                current={{ from: d.period.from, to: d.period.to }}
                presets={d.period.presets}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard
                title="Contribuições por mês"
                description="Recebido no mês (regime de caixa) comparado ao previsto para a competência."
                legend={[
                  { label: "Recebido", color: "#039855", shape: "bar" },
                  { label: "Previsto", color: "#8a9692", shape: "line" },
                ]}
                table={{
                  columns: ["Mês", "Recebido", "Previsto"],
                  rows: d.series.map((p) => [
                    formatCompetence(p.competence),
                    formatBRL(p.receivedCents),
                    formatBRL(p.expectedCents),
                  ]),
                }}
              >
                <ContributionsChart
                  data={d.series.map((p) => ({
                    label: shortMonth(p.competence),
                    receivedCents: p.receivedCents,
                    // Fora do período do ciclo não há obrigação: sem linha (e não "zero").
                    expectedCents:
                      p.competence >= d.cycleMonths.from && p.competence <= d.cycleMonths.to ? p.expectedCents : null,
                  }))}
                />
              </ChartCard>

              <ChartCard
                title="Entradas e saídas do caixa"
                description="Entradas acima da linha; saídas (despesas, tributos, estornos) abaixo."
                legend={[
                  { label: "Entradas", color: "#039855", shape: "bar" },
                  { label: "Saídas", color: "#4a3aa7", shape: "bar" },
                ]}
                table={{
                  columns: ["Mês", "Entradas", "Saídas"],
                  rows: d.series.map((p) => [
                    formatCompetence(p.competence),
                    formatBRL(p.inCents),
                    formatBRL(p.outCents),
                  ]),
                }}
              >
                <CashFlowChart
                  data={d.series.map((p) => ({
                    label: shortMonth(p.competence),
                    inCents: p.inCents,
                    outCents: p.outCents,
                  }))}
                />
              </ChartCard>

              <div className="xl:col-span-2">
                <ChartCard
                  title="Resultado parcial acumulado do ciclo"
                  description="Receitas adicionais − despesas − tributos, acumulados. Ainda não apurado: pode mudar até o encerramento."
                  table={{
                    columns: ["Mês", "Resultado do mês", "Acumulado"],
                    rows: d.series.map((p) => [
                      formatCompetence(p.competence),
                      formatBRL(p.resultCents),
                      formatBRL(p.cumulativeResultCents),
                    ]),
                  }}
                >
                  <CumulativeResultChart
                    data={d.series.map((p) => ({
                      label: shortMonth(p.competence),
                      cumulativeResultCents: p.cumulativeResultCents,
                    }))}
                  />
                </ChartCard>
              </div>
            </div>
          </section>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recursos sensíveis</CardTitle>
          <Badge tone="gray">desativados por padrão</Badge>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {flags.map((flag) => {
              const info = FLAG_LABELS[flag.key] ?? { title: flag.key, why: "" };
              return (
                <li key={flag.key} className="border-line rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{info.title}</p>
                    <Badge tone={flag.enabled ? "amber" : "gray"}>{flag.enabled ? "Ativo" : "Desligado"}</Badge>
                  </div>
                  <p className="text-muted mt-1 text-xs">{info.why}</p>
                </li>
              );
            })}
          </ul>
          <Link
            href="/admin/auditoria"
            className="text-brand-700 mt-4 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          >
            <ShieldCheck className="size-4" aria-hidden /> Ver trilha de auditoria
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ResultRow({
  label,
  cents,
  icon: Icon,
  kind = "neutral",
  negative = false,
  strong = false,
}: {
  label: string;
  cents: number;
  icon?: typeof Wallet;
  kind?: "neutral" | "projection";
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={`flex items-center gap-2 ${strong ? "font-bold" : "text-ink-soft"}`}>
        {Icon && <Icon className="text-muted size-4" aria-hidden />}
        {label}
      </dt>
      <dd className="shrink-0">
        {negative && cents > 0 && <span className="text-muted mr-0.5">−</span>}
        <MoneyValue cents={cents} kind={kind} className={strong ? "" : "font-semibold"} />
      </dd>
    </div>
  );
}
