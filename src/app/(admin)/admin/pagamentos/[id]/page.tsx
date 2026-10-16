import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, History } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { SummaryCard } from "@/components/finance/contributions";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABEL, PaymentStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, MoneyField, SelectField, TextareaField } from "@/components/ui/field";
import { MoneyValue } from "@/components/ui/money-value";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate, todayInBrazil } from "@/domain/dates";
import { centsToInput } from "@/domain/money";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import {
  confirmPaymentAction,
  editPaymentAction,
  rejectPaymentAction,
  reversePaymentAction,
} from "@/modules/payments/actions";
import { getPayment, paymentHistory } from "@/modules/payments/service";

export const metadata = { title: "Pagamento" };

const HISTORY_LABEL: Record<string, string> = {
  "payment.register": "Registrado pela administração",
  "payment.inform": "Informado pelo participante",
  "payment.confirm": "Confirmado",
  "payment.reject": "Recusado",
  "payment.reverse": "Estornado",
  "payment.edit": "Dados corrigidos",
  "pix.webhook.paid": "Recebido pelo webhook Pix",
  "pix.webhook.refund": "Pix devolvido pelo provedor",
};

export default async function PaymentPage({ params }: PageProps<"/admin/pagamentos/[id]">) {
  const actor = await requirePagePermission("payments.register");
  const { id } = await params;
  const [p, history] = await Promise.all([getPayment(id, actor.caixinhaId), paymentHistory(id)]);
  if (!p) notFound();

  const today = todayInBrazil();
  const pending = p.status === "PENDING" || p.status === "UNDER_REVIEW";
  const isOwn = actor.participantId !== null && actor.participantId === p.membership.participant.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<MoneyValue cents={p.amountCents} kind={p.status === "CONFIRMED" ? "received" : "neutral"} />}
        eyebrow="Pagamento"
        back={{ href: "/admin/pagamentos", label: "Pagamentos" }}
        actions={<PaymentStatusBadge status={p.status} />}
      />

      <Card>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <Item label="Participante">
              <Link
                href={`/admin/ciclos/${p.membership.cycle.id}/participacoes/${p.membershipId}`}
                className="text-brand-700 font-semibold hover:underline"
              >
                {p.membership.participant.fullName}
              </Link>
            </Item>
            <Item label="Ciclo">{p.membership.cycle.name}</Item>
            <Item label="Forma">{PAYMENT_METHOD_LABEL[p.method]}</Item>
            <Item label="Data do crédito">{p.receivedAt ? formatDateBR(toISODate(p.receivedAt)) : "—"}</Item>
            <Item label="Referência">{p.transactionRef ?? "—"}</Item>
            <Item label="Registrado por">
              {p.registeredBy
                ? `${p.registeredBy.name}${p.registeredBy.role === "PARTICIPANT" ? " (participante)" : ""}`
                : p.pixCharge
                  ? "Webhook Pix (sistema)"
                  : "—"}
            </Item>
            {p.pixCharge && (
              <Item label="Cobrança Pix">
                <Link
                  href={`/admin/pix/${p.pixCharge.id}`}
                  className="text-brand-700 font-mono text-xs hover:underline"
                >
                  {p.pixCharge.externalId}
                </Link>
                {p.pixCharge.isSimulation && (
                  <span className="text-warning block text-xs font-semibold">Simulação</span>
                )}
                {p.pixCharge.amountCents !== p.amountCents && (
                  <span className="text-warning block text-xs font-semibold">Valor diferente do cobrado</span>
                )}
              </Item>
            )}
            {p.confirmedBy && (
              <Item label="Confirmado por">
                {p.confirmedBy.name} em {p.confirmedAt ? formatDateTime(p.confirmedAt) : "—"}
              </Item>
            )}
            {p.notes && <Item label="Observações">{p.notes}</Item>}
            {p.confirmationNote && <Item label="Justificativa da confirmação">{p.confirmationNote}</Item>}
            {p.cancelReason && <Item label="Motivo da recusa">{p.cancelReason}</Item>}
            {p.reversalReason && (
              <Item label="Estorno">
                {p.reversedAt ? formatDateBR(toISODate(p.reversedAt)) : ""} — {p.reversalReason}
              </Item>
            )}
          </dl>
          {p.status === "CONFIRMED" && (
            <a
              href={`/api/recibos/${p.id}`}
              className="border-line hover:bg-canvas mt-5 mr-2 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold"
            >
              <Download className="size-4" aria-hidden /> Baixar recibo (PDF)
            </a>
          )}
          {p.proofFile && (
            <a
              href={`/api/arquivos/${p.proofFile.id}`}
              className="border-line hover:bg-canvas mt-5 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold"
            >
              <Download className="size-4" aria-hidden /> Baixar comprovante ({p.proofFile.fileName})
            </a>
          )}
        </CardContent>
      </Card>

      {pending && (
        <>
          <Alert tone="info" title="Conferência">
            Confira no extrato da conta da caixinha se o valor realmente entrou. O comprovante enviado pelo
            participante, sozinho, não garante o recebimento.
          </Alert>
          {isOwn && (
            <Alert tone="warning">Este pagamento é seu. Havendo outro administrador, ele é quem deve confirmar.</Alert>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Confirmar recebimento</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm
                  action={confirmPaymentAction}
                  submitLabel="Confirmar pagamento"
                  confirm="Confirmar que este valor entrou na conta?"
                >
                  <input type="hidden" name="paymentId" value={p.id} />
                  <Field
                    label="Data do crédito na conta"
                    name="receivedAt"
                    type="date"
                    max={today}
                    defaultValue={p.receivedAt ? toISODate(p.receivedAt) : today}
                    required
                  />
                  <Field
                    label={isOwn ? "Justificativa (obrigatória)" : "Observação (opcional)"}
                    name="confirmationNote"
                  />
                </ActionForm>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recusar</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm
                  action={rejectPaymentAction}
                  submitLabel="Recusar pagamento"
                  submitVariant="danger"
                  confirm="Recusar este pagamento?"
                >
                  <input type="hidden" name="paymentId" value={p.id} />
                  <Field
                    label="Motivo"
                    name="reason"
                    required
                    hint="Ex.: valor não localizado no extrato; duplicado."
                  />
                </ActionForm>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Corrigir dados antes de confirmar</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={editPaymentAction} submitLabel="Salvar correção" submitVariant="secondary">
                <input type="hidden" name="paymentId" value={p.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoneyField
                    label="Valor (R$)"
                    name="amountCents"
                    defaultValue={centsToInput(p.amountCents)}
                    required
                  />
                  <Field
                    label="Data do crédito"
                    name="receivedAt"
                    type="date"
                    max={today}
                    defaultValue={p.receivedAt ? toISODate(p.receivedAt) : today}
                    required
                  />
                  <SelectField
                    label="Forma"
                    name="method"
                    defaultValue={p.method}
                    options={MANUAL_PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
                  />
                  <Field label="Referência" name="transactionRef" defaultValue={p.transactionRef ?? ""} />
                </div>
                <TextareaField label="Observações" name="notes" rows={2} defaultValue={p.notes ?? ""} />
              </ActionForm>
            </CardContent>
          </Card>
        </>
      )}

      {p.status === "CONFIRMED" && (
        <Card>
          <CardHeader>
            <CardTitle>Estornar</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={reversePaymentAction}
              submitLabel="Estornar pagamento"
              submitVariant="danger"
              confirm="Estornar este pagamento? O livro-caixa receberá um lançamento inverso e o original será mantido."
            >
              <input type="hidden" name="paymentId" value={p.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Data do estorno"
                  name="reversedAt"
                  type="date"
                  max={today}
                  defaultValue={today}
                  required
                />
                <Field label="Motivo" name="reason" required />
              </div>
              <p className="text-muted text-xs">
                Dados de um pagamento confirmado nunca são editados: correções são feitas por estorno.
              </p>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <SummaryCard title="Histórico">
        <ol className="divide-line divide-y text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex gap-3 px-5 py-3">
              <History className="text-muted mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">{HISTORY_LABEL[h.action] ?? h.action}</p>
                <p className="text-muted">
                  {h.actor?.name ?? "Sistema"} · {formatDateTime(h.createdAt)}
                  {h.reason ? ` · ${h.reason}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </SummaryCard>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted text-xs font-semibold">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
