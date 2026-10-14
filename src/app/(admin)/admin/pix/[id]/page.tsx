import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { PixCode } from "@/components/finance/pix-code";
import { PaymentStatusBadge, PixChargeStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyField, TextareaField } from "@/components/ui/field";
import { MoneyValue } from "@/components/ui/money-value";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import { cancelChargeAction, simulatePixEventAction } from "@/modules/pix/actions";
import { ATTENTION_OUTCOMES, outcomeLabel } from "@/modules/pix/outcomes";
import { getChargeDetail, qrDataUrl } from "@/modules/pix/queries";
import type { SimulationKind } from "@/modules/pix/schemas";

export const metadata = { title: "Cobrança Pix" };

const SIMULATIONS: { kind: SimulationKind; label: string; hint: string; when: (status: string) => boolean }[] = [
  {
    kind: "paid",
    label: "Simular pagamento",
    hint: "O provedor avisa que o Pix foi pago no valor cobrado.",
    when: (s) => s !== "PAID" && s !== "REFUNDED",
  },
  {
    kind: "resend",
    label: "Reenviar o último evento",
    hint: "Mesmo id de evento: deve ser ignorado (idempotência).",
    when: () => true,
  },
  {
    kind: "second_payment",
    label: "Simular segundo pagamento",
    hint: "Outro Pix para a mesma cobrança: tratado como duplicidade.",
    when: (s) => s === "PAID",
  },
  {
    kind: "refund",
    label: "Simular devolução",
    hint: "O valor volta ao pagador (MED/devolução).",
    when: (s) => s === "PAID",
  },
  {
    kind: "expire",
    label: "Simular expiração",
    hint: "O provedor informa que o prazo acabou.",
    when: (s) => s === "ACTIVE" || s === "CREATED",
  },
  {
    kind: "bad_signature",
    label: "Simular assinatura inválida",
    hint: "Mensagem forjada: deve ser rejeitada e registrada.",
    when: () => true,
  },
];

export default async function PixChargePage({ params }: PageProps<"/admin/pix/[id]">) {
  await requirePagePermission("payments.register");
  const { id } = await params;
  const charge = await getChargeDetail(id);
  if (!charge) notFound();
  const qr = charge.copyPaste ? await qrDataUrl(charge.copyPaste) : null;
  const canCancel = charge.status === "ACTIVE" || charge.status === "CREATED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={<MoneyValue cents={charge.amountCents} />}
        eyebrow={`Cobrança Pix${charge.isSimulation ? " · simulação" : ""}`}
        back={{ href: "/admin/pix", label: "Pix e conciliação" }}
        actions={<PixChargeStatusBadge status={charge.effectiveStatus} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Item label="Participante">{charge.membership?.participant.fullName ?? "—"}</Item>
                <Item label="Ciclo">{charge.membership?.cycle.name ?? "—"}</Item>
                <Item label="Identificador (txid)">
                  <span className="font-mono text-xs break-all">{charge.externalId}</span>
                </Item>
                <Item label="Provedor">{charge.provider === "simulated" ? "Simulação" : "Manual"}</Item>
                <Item label="Criada em">{formatDateTime(charge.createdAt)}</Item>
                <Item label="Válida até">{charge.expiresAt ? formatDateTime(charge.expiresAt) : "—"}</Item>
                {charge.description && <Item label="Descrição">{charge.description}</Item>}
                {charge.paidAt && <Item label="Paga em">{formatDateTime(charge.paidAt)}</Item>}
                {charge.endToEndId && (
                  <Item label="E2E do Pix">
                    <span className="font-mono text-xs break-all">{charge.endToEndId}</span>
                  </Item>
                )}
                <Item label="Pagamento vinculado">
                  {charge.payment ? (
                    <Link
                      href={`/admin/pagamentos/${charge.payment.id}`}
                      className="text-brand-700 inline-flex items-center gap-2 font-semibold hover:underline"
                    >
                      Abrir pagamento <PaymentStatusBadge status={charge.payment.status} />
                    </Link>
                  ) : (
                    "Nenhum ainda"
                  )}
                </Item>
              </dl>
              {charge.payment?.status === "UNDER_REVIEW" && (
                <Alert tone="info" className="mt-4">
                  O provedor avisou o recebimento. Confira e confirme o pagamento para lançá-lo no livro-caixa.
                </Alert>
              )}
            </CardContent>
          </Card>

          {charge.isSimulation && (
            <Card>
              <CardHeader className="flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="size-5" aria-hidden /> Ambiente de simulação
                </CardTitle>
                <p className="text-muted text-sm">
                  Cada botão gera um evento assinado e o entrega pelo mesmo caminho do webhook real.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {SIMULATIONS.filter((s) => s.when(charge.status)).map((s) => (
                  <ActionForm
                    key={s.kind}
                    action={simulatePixEventAction}
                    submitLabel={s.label}
                    submitVariant="secondary"
                    fullWidthSubmit
                    className="border-line rounded-xl border p-3"
                  >
                    <input type="hidden" name="chargeId" value={charge.id} />
                    <input type="hidden" name="kind" value={s.kind} />
                    <p className="text-muted text-xs">{s.hint}</p>
                  </ActionForm>
                ))}
                {charge.status !== "PAID" && charge.status !== "REFUNDED" && (
                  <ActionForm
                    action={simulatePixEventAction}
                    submitLabel="Simular pagamento com outro valor"
                    submitVariant="secondary"
                    fullWidthSubmit
                    className="border-line rounded-xl border p-3"
                  >
                    <input type="hidden" name="chargeId" value={charge.id} />
                    <input type="hidden" name="kind" value="paid_other_amount" />
                    <MoneyField label="Valor pago (R$)" name="amountCents" required />
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Eventos desta cobrança</CardTitle>
            </CardHeader>
            {charge.events.length === 0 ? (
              <p className="text-muted px-5 pb-5 text-sm">Nenhum evento recebido.</p>
            ) : (
              <ul className="divide-line divide-y text-sm">
                {charge.events.map((e) => {
                  const attention = e.outcome ? ATTENTION_OUTCOMES.has(e.outcome) : false;
                  return (
                    <li key={e.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs">{e.eventType ?? "—"}</span>
                        <span className="text-muted text-xs">{formatDateTime(e.receivedAt)}</span>
                      </div>
                      <p className={attention ? "text-warning mt-1 font-semibold" : "mt-1"}>
                        {attention && <AlertTriangle className="mr-1 inline size-3.5" aria-label="Atenção" />}
                        {outcomeLabel(e.outcome)}
                      </p>
                      {e.error && <p className="text-muted text-xs">{e.error}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Código para pagamento</CardTitle>
              {charge.isSimulation && (
                <Badge tone="amber" className="w-fit">
                  Simulação
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {charge.copyPaste ? (
                <PixCode copyPaste={charge.copyPaste} qr={qr} simulation={charge.isSimulation} />
              ) : (
                <p className="text-muted text-sm">Código indisponível.</p>
              )}
            </CardContent>
          </Card>

          {canCancel && (
            <Card>
              <CardHeader>
                <CardTitle>Cancelar cobrança</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm
                  action={cancelChargeAction}
                  submitLabel="Cancelar cobrança"
                  submitVariant="danger"
                  confirm="Cancelar esta cobrança? O código deixará de ser exibido ao participante."
                >
                  <input type="hidden" name="chargeId" value={charge.id} />
                  <TextareaField label="Motivo" name="reason" rows={2} required />
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted text-xs font-semibold">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
