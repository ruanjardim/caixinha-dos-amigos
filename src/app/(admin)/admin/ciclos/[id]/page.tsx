import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Coins,
  FileCheck2,
  Lock,
  Pencil,
  Users,
  Wallet,
} from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { CycleStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, SelectField } from "@/components/ui/field";
import { LinkButton } from "@/components/ui/link-button";
import { MoneyValue } from "@/components/ui/money-value";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateBR, toISODate } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { formatPercentBps } from "@/domain/rules";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import {
  addMembershipAction,
  closeContributionsAction,
  openCycleAction,
  publishRulesAction,
} from "@/modules/cycles/actions";
import { getCycleDetail } from "@/modules/cycles/queries";

export const metadata = { title: "Ciclo" };

export default async function CyclePage({ params }: PageProps<"/admin/ciclos/[id]">) {
  await requirePagePermission("cycles.manage");
  const { id } = await params;
  const detail = await getCycleDetail(id);
  if (!detail) notFound();
  const { cycle, rules, memberships, totals, today } = detail;

  const frozen = Boolean(rules?.frozenAt);
  const canAddMembers = cycle.status === "DRAFT" || cycle.status === "OPEN";
  const endISO = toISODate(cycle.contributionEndDate);
  const acceptedCount = memberships.filter((m) => m.acceptedRules).length;

  const available = canAddMembers
    ? await db.participant.findMany({
        where: { status: "ACTIVE", memberships: { none: { cycleId: id } } },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={cycle.name}
        eyebrow="Ciclo"
        back={{ href: "/admin/ciclos", label: "Ciclos" }}
        description={`${formatDateBR(toISODate(cycle.startDate))} a ${formatDateBR(endISO)} · prestação de contas em ${formatDateBR(toISODate(cycle.settlementDate))} · vencimento dia ${cycle.dueDay}`}
        actions={
          <>
            <CycleStatusBadge status={cycle.status} />
            {cycle.status === "DRAFT" && !frozen && (
              <LinkButton href={`/admin/ciclos/${id}/editar`} variant="secondary" size="sm">
                <Pencil className="size-4" aria-hidden /> Editar
              </LinkButton>
            )}
          </>
        }
      />

      {/* Próximo passo do ciclo */}
      {cycle.status === "DRAFT" && !frozen && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-semibold">Passo 1 de 2 — publicar as regras</p>
            <p className="text-muted text-sm">
              Revise datas, cotas, percentual e texto. Ao publicar, as regras ficam <strong>congeladas</strong> (com
              registro de hash) e os participantes podem dar o aceite. Participantes ainda podem ser incluídos depois.
            </p>
            <ActionForm
              action={publishRulesAction}
              submitLabel="Publicar e congelar regras"
              confirm="Publicar as regras? Depois disso datas, cotas, percentual e texto NÃO poderão ser alterados."
            >
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {cycle.status === "DRAFT" && frozen && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-semibold">Passo 2 de 2 — abrir o ciclo</p>
            <p className="text-muted text-sm">
              Ao abrir, as parcelas previstas de cada participante são geradas e o ciclo passa a receber pagamentos.{" "}
              {acceptedCount}/{memberships.length} participante(s) já aceitaram as regras.
            </p>
            {acceptedCount < memberships.length && (
              <Alert tone="warning">Há participantes que ainda não registraram o aceite das regras.</Alert>
            )}
            <ActionForm
              action={openCycleAction}
              submitLabel="Abrir ciclo"
              confirm={`Abrir o ciclo com ${memberships.length} participante(s)?`}
            >
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {(cycle.status === "CONTRIBUTIONS_CLOSED" || cycle.status === "SETTLING" || cycle.status === "CLOSED") && (
        <Alert tone="info" title="Apuração, distribuição e encerramento">
          <Link href={`/admin/resultados?ciclo=${id}`} className="font-semibold underline">
            Ir para os resultados deste ciclo
          </Link>
        </Alert>
      )}
      {cycle.status === "OPEN" && today > endISO && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-semibold">Período de contribuições terminou em {formatDateBR(endISO)}</p>
            <ActionForm
              action={closeContributionsAction}
              submitLabel="Encerrar contribuições"
              confirm="Encerrar o período de contribuições deste ciclo?"
            >
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores do ciclo">
        <StatCard label="Participantes ativos" icon={Users} value={totals.activeMembers} />
        <StatCard
          label="Cotas"
          icon={Coins}
          value={totals.quotas}
          hint={`${formatBRL(totals.monthlyCents)} previstos por mês`}
        />
        <StatCard
          label="Previsto no ciclo"
          icon={CalendarClock}
          cents={totals.expectedCents}
          hint="Obrigações (não é dinheiro)"
        />
        <StatCard
          label="Recebido"
          icon={CheckCircle2}
          cents={totals.receivedCents}
          kind="received"
          hint="Pagamentos confirmados"
        />
        <StatCard
          label="Em atraso"
          icon={AlertTriangle}
          cents={totals.overdueCents}
          hint={`${totals.membersOverdue} participante(s)`}
        />
        <StatCard label="Em análise" icon={Wallet} cents={totals.underReviewCents} hint="Aguardando conferência" />
      </section>

      {rules && (
        <Card>
          <CardHeader>
            <CardTitle>Regras (versão {rules.version})</CardTitle>
            {frozen ? (
              <Badge tone="blue">
                <Lock className="size-3" aria-hidden /> Congeladas
              </Badge>
            ) : (
              <Badge tone="amber">Rascunho</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-muted text-xs font-semibold">Valores de cota</dt>
                <dd className="font-semibold">{rules.quotaValuesCents.map((v) => formatBRL(v)).join(" · ")}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs font-semibold">Remuneração administrativa</dt>
                <dd className="font-semibold">{formatPercentBps(rules.adminFeeBps)} do resultado líquido positivo</dd>
              </div>
              <div>
                <dt className="text-muted text-xs font-semibold">Aceites</dt>
                <dd className="font-semibold">
                  {acceptedCount} de {memberships.length}
                </dd>
              </div>
            </dl>
            {frozen && rules.frozenAt && (
              <p className="text-muted flex items-start gap-1.5 text-xs break-all">
                <FileCheck2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Publicadas em {formatDateTime(rules.frozenAt)} · hash SHA-256 {rules.contentHash}
              </p>
            )}
            <details className="border-line rounded-xl border">
              <summary className="cursor-pointer px-4 py-2.5 font-semibold">Ver texto completo</summary>
              <div className="text-ink-soft border-line border-t px-4 py-3 whitespace-pre-line">{rules.rulesText}</div>
            </details>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Participantes do ciclo</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {memberships.length === 0 ? (
            <p className="text-muted px-5 pb-5 text-sm">Nenhum participante incluído ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-muted border-line border-b text-left text-xs">
                    <th className="px-5 py-2.5 font-semibold">Participante</th>
                    <th className="px-3 py-2.5 font-semibold">Cotas</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Mensalidade</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Recebido</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Em atraso</th>
                    <th className="px-3 py-2.5 font-semibold">Regras</th>
                    <th className="px-5 py-2.5 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {memberships.map((m) => (
                    <tr key={m.id} className="hover:bg-canvas">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/ciclos/${id}/participacoes/${m.id}`}
                          className="font-semibold hover:underline"
                        >
                          {m.participant.fullName}
                        </Link>
                      </td>
                      <td className="tabular px-3 py-3">
                        {m.quotaCount} × {formatBRL(m.quotaValueCents)}
                      </td>
                      <td className="tabular px-3 py-3 text-right">{formatBRL(m.quotaCount * m.quotaValueCents)}</td>
                      <td className="px-3 py-3 text-right">
                        <MoneyValue cents={m.summary.receivedCents} kind="received" className="font-semibold" />
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        {m.summary.overdueCents > 0 ? (
                          <span className="text-danger font-semibold">{formatBRL(m.summary.overdueCents)}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {m.acceptedRules ? <Badge tone="green">Aceitas</Badge> : <Badge tone="gray">Pendente</Badge>}
                      </td>
                      <td className="px-5 py-3">
                        {m.status === "LEFT" ? (
                          <Badge tone="gray">Saiu</Badge>
                        ) : m.summary.overdueCount > 0 ? (
                          <Badge tone="red">Inadimplente</Badge>
                        ) : (
                          <Badge tone="green">Em dia</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {canAddMembers && rules && (
        <Card>
          <CardHeader>
            <CardTitle>Incluir participante</CardTitle>
          </CardHeader>
          <CardContent>
            {available.length === 0 ? (
              <p className="text-muted text-sm">
                Todos os participantes ativos já estão neste ciclo.{" "}
                <Link href="/admin/participantes/novo" className="text-brand-700 font-semibold hover:underline">
                  Cadastrar novo participante
                </Link>
              </p>
            ) : (
              <ActionForm action={addMembershipAction} submitLabel="Incluir no ciclo" resetOnSuccess>
                <input type="hidden" name="cycleId" value={id} />
                {cycle.status === "OPEN" && (
                  <Alert tone="info">Com o ciclo aberto, as parcelas são geradas a partir do mês de entrada.</Alert>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <SelectField
                    label="Participante"
                    name="participantId"
                    placeholder="Selecione…"
                    options={available.map((p) => ({ value: p.id, label: p.fullName }))}
                    required
                  />
                  <Field
                    label="Quantidade de cotas"
                    name="quotaCount"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={1}
                    required
                  />
                  <SelectField
                    label="Valor da cota"
                    name="quotaValueCents"
                    options={rules.quotaValuesCents.map((v) => ({ value: String(v), label: formatBRL(v) }))}
                    required
                  />
                  <Field
                    label="Data de entrada"
                    name="joinedAt"
                    type="date"
                    required
                    defaultValue={cycle.status === "OPEN" ? today : toISODate(cycle.startDate)}
                  />
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
