import Link from "next/link";
import { notFound } from "next/navigation";
import { HandCoins, Paperclip } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { ContributionSummaryGrid, InstallmentsTable, SummaryCard } from "@/components/finance/contributions";
import { PAYMENT_METHOD_LABEL, PaymentStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, SelectField } from "@/components/ui/field";
import { LinkButton } from "@/components/ui/link-button";
import { MoneyValue } from "@/components/ui/money-value";
import { PageHeader } from "@/components/ui/page-header";
import { formatCompetence, formatDateBR, toISODate, todayInBrazil } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import {
  changeQuotasAction,
  leaveCycleAction,
  removeDraftMembershipAction,
  updateDraftMembershipAction,
} from "@/modules/cycles/actions";
import { getMembershipDetail } from "@/modules/cycles/queries";
import { returnPrincipalAction } from "@/modules/results/actions";
import { principalByMembership } from "@/modules/results/queries";

export const metadata = { title: "Participação no ciclo" };

export default async function MembershipPage({ params }: PageProps<"/admin/ciclos/[id]/participacoes/[membershipId]">) {
  const user = await requirePagePermission("participants.manage");
  const { id, membershipId } = await params;
  const m = await getMembershipDetail(membershipId, undefined, user.caixinhaId);
  if (!m || m.cycleId !== id) notFound();

  const today = todayInBrazil();
  const rules = m.cycle.rules[0];
  const quotaOptions = (rules?.quotaValuesCents ?? []).map((v) => ({ value: String(v), label: formatBRL(v) }));
  const isDraft = m.cycle.status === "DRAFT";
  const isOpen = m.cycle.status === "OPEN";
  const futureCompetences = m.summary.installments.filter((i) => i.dueDate >= today).map((i) => i.competence);
  const canPay = isOpen || m.cycle.status === "CONTRIBUTIONS_CLOSED";
  const principalHeld = (await principalByMembership(m.cycleId)).get(m.id) ?? 0;
  const canReturnPrincipal = m.status === "LEFT" && canPay && principalHeld > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.participant.fullName}
        eyebrow={m.cycle.name}
        back={{ href: `/admin/ciclos/${id}`, label: "Voltar ao ciclo" }}
        description={`${m.quotaCount} cota(s) de ${formatBRL(m.quotaValueCents)} · entrada em ${formatDateBR(toISODate(m.joinedAt))}${m.leftAt ? ` · saída em ${formatDateBR(toISODate(m.leftAt))}` : ""}`}
        actions={
          <>
            {m.status === "LEFT" && <Badge tone="gray">Saiu do ciclo</Badge>}
            <LinkButton href={`/admin/participantes/${m.participantId}`} variant="secondary" size="sm">
              Cadastro
            </LinkButton>
            {canPay && (
              <LinkButton href={`/admin/pagamentos/novo?participacao=${m.id}`} size="sm">
                <HandCoins className="size-4" aria-hidden /> Registrar pagamento
              </LinkButton>
            )}
          </>
        }
      />

      {isDraft ? (
        <Alert tone="info">As parcelas previstas serão geradas quando o ciclo for aberto.</Alert>
      ) : (
        <ContributionSummaryGrid summary={m.summary} monthlyCents={m.quotaCount * m.quotaValueCents} />
      )}

      {!isDraft && (
        <SummaryCard title="Parcelas previstas">
          <InstallmentsTable installments={m.summary.installments} />
          {m.summary.creditCents > 0 && (
            <p className="text-info border-line border-t px-5 py-3 text-sm">
              Crédito excedente: {formatBRL(m.summary.creditCents)} recebidos acima do total previsto.
            </p>
          )}
        </SummaryCard>
      )}

      <SummaryCard title="Pagamentos">
        {m.payments.length === 0 ? (
          <p className="text-muted p-5 text-sm">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="divide-line divide-y">
            {m.payments.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/pagamentos/${p.id}`}
                  className="hover:bg-canvas grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <MoneyValue cents={p.amountCents} kind={p.status === "CONFIRMED" ? "received" : "neutral"} />
                      <span className="text-muted ml-2 text-sm font-normal">
                        {PAYMENT_METHOD_LABEL[p.method]} ·{" "}
                        {p.receivedAt ? formatDateBR(toISODate(p.receivedAt)) : "sem data"}
                      </span>
                    </p>
                    <p className="text-muted truncate text-xs">
                      {p.confirmedBy
                        ? `Confirmado por ${p.confirmedBy.name}`
                        : `Registrado por ${p.registeredBy?.name ?? "—"}`}
                      {p.proofFileId && (
                        <>
                          {" · "}
                          <Paperclip className="inline size-3" aria-label="Com comprovante" />
                        </>
                      )}
                    </p>
                  </div>
                  <PaymentStatusBadge status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SummaryCard>

      {isDraft && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Ajustar participação</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateDraftMembershipAction} submitLabel="Salvar">
                <input type="hidden" name="membershipId" value={m.id} />
                <input type="hidden" name="cycleId" value={id} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field
                    label="Cotas"
                    name="quotaCount"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={m.quotaCount}
                    required
                  />
                  <SelectField
                    label="Valor da cota"
                    name="quotaValueCents"
                    options={quotaOptions}
                    defaultValue={String(m.quotaValueCents)}
                  />
                  <Field label="Entrada" name="joinedAt" type="date" defaultValue={toISODate(m.joinedAt)} required />
                </div>
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Remover do ciclo</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={removeDraftMembershipAction}
                submitLabel="Remover participação"
                submitVariant="danger"
                confirm="Remover este participante do ciclo em preparação?"
              >
                <input type="hidden" name="membershipId" value={m.id} />
                <input type="hidden" name="cycleId" value={id} />
                <p className="text-muted text-sm">Possível apenas enquanto o ciclo está em preparação.</p>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      )}

      {isOpen && m.status === "ACTIVE" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Alterar cotas</CardTitle>
            </CardHeader>
            <CardContent>
              {futureCompetences.length === 0 ? (
                <p className="text-muted text-sm">Não há parcelas futuras para alterar.</p>
              ) : (
                <ActionForm
                  action={changeQuotasAction}
                  submitLabel="Alterar cotas"
                  confirm="Confirmar a alteração de cotas?"
                >
                  <input type="hidden" name="membershipId" value={m.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Nova quantidade"
                      name="quotaCount"
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={m.quotaCount}
                      required
                    />
                    <SelectField
                      label="Valor da cota"
                      name="quotaValueCents"
                      options={quotaOptions}
                      defaultValue={String(m.quotaValueCents)}
                    />
                  </div>
                  <SelectField
                    label="Vale a partir de"
                    name="effectiveFrom"
                    options={futureCompetences.map((c) => ({ value: c, label: formatCompetence(c) }))}
                    hint="Parcelas já vencidas não mudam."
                  />
                  <Field label="Motivo" name="reason" required />
                </ActionForm>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Registrar saída do ciclo</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={leaveCycleAction}
                submitLabel="Registrar saída"
                submitVariant="danger"
                confirm="Registrar a saída? As parcelas dos meses seguintes deixarão de ser devidas."
              >
                <input type="hidden" name="membershipId" value={m.id} />
                <Field label="Data de saída" name="leftAt" type="date" defaultValue={today} required />
                <Field label="Motivo" name="reason" required />
                <Alert tone="warning">
                  Devolução de valores e participação nos resultados de quem sai seguem as regras a definir na apuração
                  (Fase 4). Nada é apagado.
                </Alert>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      )}

      {canReturnPrincipal && (
        <Card>
          <CardHeader>
            <CardTitle>Devolver o principal (saída do ciclo)</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={returnPrincipalAction}
              submitLabel={`Registrar devolução de ${formatBRL(principalHeld)}`}
              confirm={`Registrar a devolução de ${formatBRL(principalHeld)} a ${m.participant.fullName}?`}
            >
              <input type="hidden" name="membershipId" value={m.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Data do pagamento" name="paidOn" type="date" defaultValue={today} max={today} required />
                <Field label="Referência (opcional)" name="transactionRef" />
              </div>
              <p className="text-muted text-xs">
                Regra 6.2: quem sai recebe o valor depositado e participa do resultado só pelos dias até a devolução.
              </p>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {m.changes.length > 0 && (
        <SummaryCard title="Histórico de alterações de cotas">
          <ul className="divide-line divide-y text-sm">
            {m.changes.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <p className="font-semibold">
                  {c.previousQuotaCount} × {formatBRL(c.previousQuotaValueCts)} → {c.newQuotaCount} ×{" "}
                  {formatBRL(c.newQuotaValueCts)}
                </p>
                <p className="text-muted">
                  A partir de {formatDateBR(toISODate(c.effectiveFrom))} · {c.reason} · {formatDateTime(c.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </SummaryCard>
      )}
    </div>
  );
}
