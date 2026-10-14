import { randomUUID } from "node:crypto";
import { ShieldCheck } from "lucide-react";
import { ActionForm, DuplicateAck } from "@/components/forms/action-form";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FileField, MoneyField, SelectField, TextareaField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { todayInBrazil } from "@/domain/dates";
import { centsToInput } from "@/domain/money";
import { requirePagePermission } from "@/modules/auth/session";
import { getOwnMemberships } from "@/modules/cycles/queries";
import { ACCEPTED_UPLOADS } from "@/modules/files/service";
import { informPaymentAction } from "@/modules/payments/actions";

export const metadata = { title: "Informar pagamento" };

export default async function InformPaymentPage() {
  const user = await requirePagePermission("self.payments.inform");
  const memberships = user.participantId ? await getOwnMemberships(user.participantId) : [];
  const payable = memberships.filter((m) => m.cycle.status === "OPEN" || m.cycle.status === "CONTRIBUTIONS_CLOSED");
  const first = payable[0];
  const suggested = first ? (first.summary.nextDue?.remainingCents ?? first.quotaCount * first.quotaValueCents) : 0;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Informar pagamento" back={{ href: "/minha-caixinha", label: "Minha Caixinha" }} />
      {payable.length === 0 ? (
        <Alert tone="info">Você não tem um ciclo aberto recebendo pagamentos no momento.</Alert>
      ) : (
        <>
          <Alert tone="info">
            Fez um Pix ou depósito para a conta da caixinha? Informe aqui. O pagamento fica <strong>em análise</strong>{" "}
            até a administração conferir no extrato — o comprovante sozinho não confirma o pagamento.
          </Alert>
          <Card>
            <CardContent>
              <ActionForm action={informPaymentAction} submitLabel="Enviar para conferência" fullWidthSubmit>
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                {payable.length === 1 ? (
                  <input type="hidden" name="membershipId" value={payable[0].id} />
                ) : (
                  <SelectField
                    label="Ciclo"
                    name="membershipId"
                    options={payable.map((m) => ({ value: m.id, label: m.cycle.name }))}
                  />
                )}
                <MoneyField
                  label="Valor pago (R$)"
                  name="amountCents"
                  defaultValue={suggested ? centsToInput(suggested) : ""}
                  hint="Pode ser uma parcela, parte dela ou um valor antecipado."
                  required
                />
                <Field
                  label="Data do pagamento"
                  name="receivedAt"
                  type="date"
                  max={todayInBrazil()}
                  defaultValue={todayInBrazil()}
                  required
                />
                <SelectField
                  label="Como pagou"
                  name="method"
                  options={MANUAL_PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
                />
                <Field
                  label="Código da transação (opcional)"
                  name="transactionRef"
                  autoComplete="off"
                  hint="No comprovante do Pix aparece como “ID da transação” ou “E2E”."
                />
                <FileField
                  label="Comprovante (opcional)"
                  name="proof"
                  accept={ACCEPTED_UPLOADS}
                  hint="PDF ou imagem, até 5 MB."
                />
                <TextareaField label="Observação (opcional)" name="notes" rows={2} />
                <DuplicateAck />
              </ActionForm>
            </CardContent>
          </Card>
          <p className="text-muted flex gap-2 text-xs">
            <ShieldCheck className="text-brand-600 size-4 shrink-0" aria-hidden />
            Nunca informe senhas bancárias. A caixinha jamais pedirá esse tipo de dado.
          </p>
        </>
      )}
    </div>
  );
}
