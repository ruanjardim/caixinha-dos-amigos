import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Dices, FileCheck2, ShieldAlert } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { SummaryCard } from "@/components/finance/contributions";
import { ACTIVITY_TYPE_LABEL, ActivityStatusBadge, ComplianceBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FileField, MoneyField, SelectField, TextareaField } from "@/components/ui/field";
import { MoneyValue } from "@/components/ui/money-value";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate, todayInBrazil } from "@/domain/dates";
import { canRecordMoney, checkRaffleAuthorization, formatRaffleNumber } from "@/domain/fundraising";
import { centsToInput, formatBRL } from "@/domain/money";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import {
  activateAuthorizedModeAction,
  activityEntryAction,
  addActivityParticipantAction,
  addImageAction,
  addPrizeAction,
  complianceDecisionAction,
  confirmNumberAction,
  generateNumbersAction,
  officialResultAction,
  releaseNumberAction,
  removeActivityParticipantAction,
  removeImageAction,
  removePrizeAction,
  reserveNumberAction,
  setActivityStatusAction,
  simulatedDrawAction,
  updateActivityAction,
} from "@/modules/fundraising/actions";
import { getActivityDetail } from "@/modules/fundraising/queries";
import { ActivityFields } from "../activity-fields";

export const metadata = { title: "Atividade" };

const NEXT_STATUS: Record<string, { status: string; label: string }[]> = {
  DRAFT: [{ status: "PLANNED", label: "Marcar como planejada" }],
  PLANNED: [{ status: "IN_PROGRESS", label: "Iniciar" }],
  IN_PROGRESS: [{ status: "FINISHED", label: "Concluir" }],
  FINISHED: [],
  CANCELLED: [],
};

const compactForm = "flex flex-wrap items-end gap-2 space-y-0 [&_button]:h-10 [&_button]:text-sm";

export default async function ActivityPage({ params }: PageProps<"/admin/arrecadacao/[id]">) {
  const user = await requirePagePermission("fundraising.manage");
  const { id } = await params;
  const a = await getActivityDetail(id, user.caixinhaId);
  if (!a) notFound();

  const [participants, flag] = await Promise.all([
    db.participant.findMany({
      where: { status: "ACTIVE", ...(user.caixinhaId ? { caixinhaId: user.caixinhaId } : {}) },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    db.featureFlag.findUnique({ where: { key: "RAFFLE_SALES_ENABLED" } }),
  ]);
  const today = todayInBrazil();
  const isRaffle = a.type === "RAFFLE";
  const editable = a.status !== "FINISHED" && a.status !== "CANCELLED";
  const money = canRecordMoney(a);
  const auth = checkRaffleAuthorization({
    type: a.type,
    complianceStatus: a.complianceStatus,
    salesFlagEnabled: Boolean(flag?.enabled),
    promotionRules: a.promotionRules,
    numbersGenerated: a.numbers.length > 0,
  });
  const numbersOpen = (a.status === "PLANNED" || a.status === "IN_PROGRESS") && !a.drawnAt;
  const end = a.numberRangeEnd ?? 0;
  const canDecide = user.role === "ADMIN";
  const participantOptions = participants.map((p) => ({ value: p.id, label: p.fullName }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={a.title}
        eyebrow={`${ACTIVITY_TYPE_LABEL[a.type]} · ${a.cycle.name}`}
        back={{ href: "/admin/arrecadacao", label: "Arrecadação" }}
        actions={
          <>
            <ActivityStatusBadge status={a.status} />
            {isRaffle && <ComplianceBadge status={a.complianceStatus} />}
          </>
        }
      />

      {isRaffle &&
        (a.simulationOnly ? (
          <Alert tone="warning" title="SIMULAÇÃO — nenhuma venda real">
            Reservas, confirmações e sorteio servem apenas para testar e organizar. Nenhum dinheiro é movimentado e
            nenhum resultado é oficial.
          </Alert>
        ) : (
          <Alert tone="success" title="Modo autorizado">
            Parecer favorável e recurso ligado. O sistema registra pagamentos e o resultado oficial obtido pelo meio
            autorizado — ele não executa sorteios reais.
          </Alert>
        ))}

      {editable && NEXT_STATUS[a.status].length > 0 && (
        <div className="flex flex-wrap gap-2">
          {NEXT_STATUS[a.status].map((s) => (
            <ActionForm key={s.status} action={setActivityStatusAction} submitLabel={s.label} className="space-y-0">
              <input type="hidden" name="activityId" value={a.id} />
              <input type="hidden" name="status" value={s.status} />
            </ActionForm>
          ))}
          <ActionForm
            action={setActivityStatusAction}
            submitLabel="Cancelar atividade"
            submitVariant="secondary"
            confirm="Cancelar esta atividade?"
            className="space-y-0"
          >
            <input type="hidden" name="activityId" value={a.id} />
            <input type="hidden" name="status" value="CANCELLED" />
          </ActionForm>
        </div>
      )}

      {/* Financeiro */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Receitas da atividade" cents={a.financials.revenueCents} />
        <Figure label="Custos da atividade" cents={a.financials.costCents} />
        <Figure label="Resultado da atividade" cents={a.financials.revenueCents - a.financials.costCents} strong />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lançar receita ou custo</CardTitle>
          </CardHeader>
          <CardContent>
            {!money.ok ? (
              <Alert tone="info">{money.reason}</Alert>
            ) : !editable ? (
              <p className="text-muted text-sm">Atividade encerrada.</p>
            ) : (
              <ActionForm action={activityEntryAction} submitLabel="Lançar no livro-caixa" resetOnSuccess>
                <input type="hidden" name="activityId" value={a.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Tipo"
                    name="kind"
                    options={[
                      { value: "REVENUE", label: "Receita" },
                      { value: "COST", label: "Custo" },
                    ]}
                  />
                  <MoneyField label="Valor (R$)" name="amountCents" required />
                  <Field label="Data" name="occurredOn" type="date" defaultValue={today} max={today} required />
                  <Field label="Descrição" name="description" required hint="Visível na prestação de contas." />
                </div>
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <SummaryCard title="Lançamentos da atividade">
          {a.ledger.length === 0 ? (
            <p className="text-muted p-5 text-sm">Nenhum lançamento.</p>
          ) : (
            <ul className="divide-line divide-y text-sm">
              {a.ledger.map((e) => {
                const effect = e.lines.filter((l) => l.account === "CASH").reduce((s, l) => s + l.amountCents, 0);
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{e.description}</span>
                      <span className="text-muted text-xs">
                        {formatDateBR(toISODate(e.occurredOn))} · {e.createdBy.name}
                      </span>
                    </span>
                    <span className={cn("tabular shrink-0 font-bold", effect < 0 ? "text-ink" : "text-received")}>
                      {effect < 0 ? "−" : "+"}
                      {formatBRL(Math.abs(effect))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SummaryCard>
      </div>

      {/* Prêmios e participantes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SummaryCard title="Prêmios">
          {a.prizes.length > 0 && (
            <ul className="divide-line divide-y text-sm">
              {a.prizes.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span>
                    <strong>
                      {p.position}º · {p.name}
                    </strong>
                    {p.costCents > 0 && <span className="text-muted"> · custo {formatBRL(p.costCents)}</span>}
                    {p.winningNumber !== null && (
                      <Badge tone="green" className="ml-2">
                        Número {formatRaffleNumber(p.winningNumber, end)}
                      </Badge>
                    )}
                  </span>
                  {editable && !a.drawnAt && (
                    <ActionForm
                      action={removePrizeAction}
                      submitLabel="Remover"
                      submitVariant="ghost"
                      className="space-y-0 [&_button]:h-8 [&_button]:text-xs"
                    >
                      <input type="hidden" name="prizeId" value={p.id} />
                      <input type="hidden" name="activityId" value={a.id} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && !a.drawnAt && (
            <div className="border-line border-t p-5">
              <ActionForm action={addPrizeAction} submitLabel="Incluir prêmio" resetOnSuccess>
                <input type="hidden" name="activityId" value={a.id} />
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr_80px]">
                  <Field label="Prêmio" name="name" required />
                  <MoneyField label="Custo (R$, opcional)" name="costCents" />
                  <Field label="Ordem" name="position" type="number" min={1} defaultValue={a.prizes.length + 1} />
                </div>
                <p className="text-muted text-xs">
                  O custo informado aqui é só referência; a compra entra como custo da atividade.
                </p>
              </ActionForm>
            </div>
          )}
        </SummaryCard>

        <SummaryCard title="Participantes envolvidos">
          {a.participants.length > 0 && (
            <ul className="divide-line divide-y text-sm">
              {a.participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span>
                    <strong>{p.participant.fullName}</strong>
                    {p.role && <span className="text-muted"> · {p.role}</span>}
                  </span>
                  {editable && (
                    <ActionForm
                      action={removeActivityParticipantAction}
                      submitLabel="Remover"
                      submitVariant="ghost"
                      className="space-y-0 [&_button]:h-8 [&_button]:text-xs"
                    >
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="activityId" value={a.id} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <div className="border-line border-t p-5">
              <ActionForm action={addActivityParticipantAction} submitLabel="Incluir" resetOnSuccess>
                <input type="hidden" name="activityId" value={a.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Participante"
                    name="participantId"
                    placeholder="Selecione…"
                    options={participantOptions}
                  />
                  <Field label="Papel (opcional)" name="role" placeholder="voluntário, organizador…" />
                </div>
              </ActionForm>
            </div>
          )}
        </SummaryCard>
      </div>

      {/* Imagens */}
      <SummaryCard title="Imagens">
        {a.images.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            {a.images.map((img) => (
              <li key={img.id} className="space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- arquivo protegido servido pela API */}
                <img
                  src={`/api/arquivos/${img.file.id}?inline=1`}
                  alt={img.caption ?? a.title}
                  className="border-line aspect-square w-full rounded-xl border object-cover"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted truncate text-xs">{img.caption}</span>
                  {editable && (
                    <ActionForm
                      action={removeImageAction}
                      submitLabel="Remover"
                      submitVariant="ghost"
                      className="space-y-0 [&_button]:h-7 [&_button]:px-2 [&_button]:text-xs"
                    >
                      <input type="hidden" name="imageId" value={img.id} />
                      <input type="hidden" name="activityId" value={a.id} />
                    </ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="border-line border-t p-5">
            <ActionForm action={addImageAction} submitLabel="Enviar imagem" resetOnSuccess>
              <input type="hidden" name="activityId" value={a.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FileField
                  label="Imagem"
                  name="image"
                  accept="image/png,image/jpeg,image/webp"
                  hint="PNG, JPG ou WEBP até 5 MB."
                />
                <Field label="Legenda (opcional)" name="caption" />
              </div>
            </ActionForm>
          </div>
        )}
      </SummaryCard>

      {/* Numeração */}
      {isRaffle && (
        <SummaryCard title="Numeração do sorteio">
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="gray">Disponíveis: {a.counts.AVAILABLE}</Badge>
              <Badge tone="amber">Reservados: {a.counts.RESERVED}</Badge>
              <Badge tone="green">Confirmados: {a.counts.CONFIRMED}</Badge>
              {a.unitPriceCents ? <Badge tone="gray">Preço: {formatBRL(a.unitPriceCents)}</Badge> : null}
            </div>

            {a.numbers.length === 0 ? (
              editable ? (
                <ActionForm
                  action={generateNumbersAction}
                  submitLabel="Gerar numeração"
                  confirm="Gerar a numeração? A faixa não poderá mais mudar."
                >
                  <input type="hidden" name="activityId" value={a.id} />
                  <p className="text-muted text-sm">
                    Faixa: {a.numberRangeStart ?? "—"} a {a.numberRangeEnd ?? "—"}.{" "}
                    {a.simulationOnly && "Os números serão de SIMULAÇÃO e nunca poderão ser vendidos."}
                  </p>
                </ActionForm>
              ) : null
            ) : (
              <>
                {a.numbers.length <= 1000 ? (
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1" aria-label="Números">
                    {a.numbers.map((n) => (
                      <li
                        key={n.id}
                        title={
                          n.participant
                            ? `${n.participant.fullName}${n.transactionRef ? ` · ${n.transactionRef}` : ""}`
                            : "Disponível"
                        }
                        className={cn(
                          "tabular rounded-md border px-1 py-1 text-center text-xs font-semibold",
                          n.status === "CONFIRMED" && "border-brand-600 bg-brand-600 text-white",
                          n.status === "RESERVED" && "bg-warning-bg text-warning border-amber-300",
                          n.status === "AVAILABLE" && "border-line bg-surface text-ink-soft",
                        )}
                      >
                        {formatRaffleNumber(n.number, end)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted text-sm">{a.numbers.length} números (grade exibida até 1.000).</p>
                )}
                <p className="text-muted text-xs">Branco = disponível · amarelo = reservado · verde = confirmado.</p>

                {numbersOpen && (
                  <div className="grid gap-4 lg:grid-cols-3">
                    <ActionForm action={reserveNumberAction} submitLabel="Reservar" className={compactForm}>
                      <input type="hidden" name="activityId" value={a.id} />
                      <Field
                        label="Número"
                        name="number"
                        type="number"
                        min={a.numberRangeStart ?? 0}
                        max={end}
                        required
                        className="w-24"
                      />
                      <SelectField
                        label="Para"
                        name="participantId"
                        placeholder="Selecione…"
                        options={participantOptions}
                      />
                    </ActionForm>
                    <ActionForm action={confirmNumberAction} submitLabel="Confirmar pagamento" className={compactForm}>
                      <input type="hidden" name="activityId" value={a.id} />
                      <Field label="Número" name="number" type="number" required className="w-24" />
                      <Field label="Data" name="paidOn" type="date" defaultValue={today} max={today} required />
                      <Field
                        label={a.simulationOnly ? "Ref. (opcional)" : "Identificação da transação"}
                        name="transactionRef"
                        className="w-40"
                      />
                    </ActionForm>
                    <ActionForm
                      action={releaseNumberAction}
                      submitLabel="Liberar reserva"
                      submitVariant="secondary"
                      className={compactForm}
                    >
                      <input type="hidden" name="activityId" value={a.id} />
                      <Field label="Número" name="number" type="number" required className="w-24" />
                    </ActionForm>
                  </div>
                )}
              </>
            )}

            {a.simulationOnly && a.counts.CONFIRMED > 0 && (
              <ActionForm action={simulatedDrawAction} submitLabel="Simular sorteio" submitVariant="secondary">
                <input type="hidden" name="activityId" value={a.id} />
                <p className="text-muted flex items-center gap-1.5 text-sm">
                  <Dices className="size-4" aria-hidden /> Sorteia entre os confirmados só para teste. Não é gravado nem
                  é oficial.
                </p>
              </ActionForm>
            )}

            {!a.simulationOnly && a.status === "IN_PROGRESS" && !a.drawnAt && a.prizes.length > 0 && (
              <ActionForm
                action={officialResultAction}
                submitLabel="Registrar resultado oficial"
                confirm="Registrar o resultado oficial? Ele não poderá ser alterado."
              >
                <input type="hidden" name="activityId" value={a.id} />
                <p className="text-sm font-semibold">Resultado oficial (obtido pelo meio autorizado)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Fonte do resultado"
                    name="drawSource"
                    placeholder="Ex.: Loteria Federal, extração nº…"
                    required
                  />
                  <Field label="Data do sorteio" name="drawnOn" type="date" defaultValue={today} max={today} required />
                  {a.prizes.map((p) => (
                    <Field
                      key={p.id}
                      label={`Número do ${p.position}º prêmio (${p.name})`}
                      name={`winner_${p.id}`}
                      type="number"
                      required
                    />
                  ))}
                </div>
              </ActionForm>
            )}

            {a.drawnAt && (
              <Alert tone="success" title="Resultado oficial registrado">
                {a.drawResult} · Fonte: {a.drawSource} · {formatDateBR(toISODate(a.drawnAt))}
              </Alert>
            )}
          </div>
        </SummaryCard>
      )}

      {/* Conformidade */}
      <SummaryCard title="Conformidade">
        <div className="space-y-4 p-5">
          {isRaffle && a.simulationOnly && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Condições para o modo autorizado</p>
              <ul className="space-y-1 text-sm">
                {[
                  ["Parecer de conformidade favorável", a.complianceStatus === "APPROVED"],
                  ["Recurso de venda de números ligado", Boolean(flag?.enabled)],
                  [
                    "Regulamento da promoção escrito",
                    Boolean(a.promotionRules && a.promotionRules.trim().length >= 50),
                  ],
                  ["Numeração ainda não gerada em simulação", a.numbers.length === 0],
                ].map(([label, done]) => (
                  <li key={String(label)} className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="text-status-good size-4" aria-label="Cumprido" />
                    ) : (
                      <Circle className="text-muted size-4" aria-label="Pendente" />
                    )}
                    {label}
                  </li>
                ))}
              </ul>
              {auth.ok && (
                <ActionForm
                  action={activateAuthorizedModeAction}
                  submitLabel="Ativar modo autorizado"
                  confirm="Ativar a venda real de números para esta atividade?"
                >
                  <input type="hidden" name="activityId" value={a.id} />
                </ActionForm>
              )}
            </div>
          )}

          {a.approvals.length > 0 && (
            <ul className="divide-line border-line divide-y rounded-xl border text-sm">
              {a.approvals.map((ap) => (
                <li key={ap.id} className="space-y-1 px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ComplianceBadge status={ap.decision} />
                    <span className="font-semibold">{ap.legalModality}</span>
                    {ap.authorization && <span className="text-muted">· {ap.authorization}</span>}
                  </div>
                  <p className="text-ink-soft whitespace-pre-line">{ap.legalOpinion}</p>
                  <p className="text-muted flex items-center gap-1.5 text-xs">
                    <FileCheck2 className="size-3.5" aria-hidden /> {ap.decidedBy.name} · {formatDateTime(ap.createdAt)}
                    {ap.documentFileId && (
                      <a href={`/api/arquivos/${ap.documentFileId}`} className="text-brand-700 underline">
                        documento
                      </a>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {canDecide && editable && (
            <ActionForm
              action={complianceDecisionAction}
              submitLabel="Registrar parecer"
              confirm="Registrar este parecer de conformidade?"
            >
              <input type="hidden" name="activityId" value={a.id} />
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <ShieldAlert className="text-warning size-4" aria-hidden /> Novo parecer de conformidade
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Modalidade legal identificada" name="legalModality" required />
                <Field label="Autorização / processo (se houver)" name="authorization" />
              </div>
              <TextareaField
                label="Parecer"
                name="legalOpinion"
                rows={3}
                hint="Fundamentação (idealmente de advogado). Registro permanente na auditoria."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Decisão"
                  name="decision"
                  options={[
                    { value: "REJECTED", label: "Parecer contrário" },
                    { value: "APPROVED", label: "Parecer favorável" },
                  ]}
                />
                <FileField label="Documento (opcional)" name="document" accept=".pdf,image/png,image/jpeg" />
              </div>
            </ActionForm>
          )}
        </div>
      </SummaryCard>

      {/* Edição */}
      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Editar atividade</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateActivityAction} submitLabel="Salvar">
              <input type="hidden" name="activityId" value={a.id} />
              <input type="hidden" name="cycleId" value={a.cycleId} />
              <ActivityFields
                lockType
                defaults={{
                  type: a.type,
                  title: a.title,
                  description: a.description ?? "",
                  startsOn: a.startsOn ? toISODate(a.startsOn) : "",
                  endsOn: a.endsOn ? toISODate(a.endsOn) : "",
                  numberRangeStart: a.numberRangeStart?.toString() ?? "",
                  numberRangeEnd: a.numberRangeEnd?.toString() ?? "",
                  unitPrice: a.unitPriceCents ? centsToInput(a.unitPriceCents) : "",
                  promotionRules: a.promotionRules ?? "",
                }}
              />
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Figure({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-muted text-xs font-semibold">{label}</p>
      <MoneyValue cents={cents} className={cn("mt-1 block", strong ? "text-2xl" : "text-lg")} />
    </Card>
  );
}
