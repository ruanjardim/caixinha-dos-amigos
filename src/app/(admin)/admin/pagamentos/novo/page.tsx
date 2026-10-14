import { randomUUID } from "node:crypto";
import { ActionForm, DuplicateAck } from "@/components/forms/action-form";
import { MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { CheckboxField, Field, FileField, MoneyField, SelectField, TextareaField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { todayInBrazil } from "@/domain/dates";
import { requirePagePermission } from "@/modules/auth/session";
import { listPayableMemberships } from "@/modules/cycles/queries";
import { ACCEPTED_UPLOADS } from "@/modules/files/service";
import { registerPaymentAction } from "@/modules/payments/actions";

export const metadata = { title: "Registrar pagamento" };

export default async function NewPaymentPage({ searchParams }: PageProps<"/admin/pagamentos/novo">) {
  await requirePagePermission("payments.register");
  const params = await searchParams;
  const preselected = typeof params.participacao === "string" ? params.participacao : "";
  const memberships = await listPayableMemberships();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Registrar pagamento" back={{ href: "/admin/pagamentos", label: "Pagamentos" }} />
      {memberships.length === 0 ? (
        <Alert tone="warning">Não há ciclos abertos recebendo pagamentos.</Alert>
      ) : (
        <Card>
          <CardContent>
            <ActionForm action={registerPaymentAction} submitLabel="Registrar pagamento">
              {/* Chave única deste formulário: um reenvio acidental não duplica o pagamento. */}
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <SelectField
                label="Participante"
                name="membershipId"
                placeholder="Selecione…"
                defaultValue={preselected}
                options={memberships.map((m) => ({
                  value: m.id,
                  label: `${m.participant.fullName} — ${m.cycle.name}${m.status === "LEFT" ? " (saiu)" : ""}`,
                }))}
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField label="Valor (R$)" name="amountCents" required />
                <Field
                  label="Data do crédito na conta"
                  name="receivedAt"
                  type="date"
                  max={todayInBrazil()}
                  defaultValue={todayInBrazil()}
                  required
                  hint="Data em que o dinheiro entrou de fato."
                />
                <SelectField
                  label="Forma de pagamento"
                  name="method"
                  options={MANUAL_PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
                />
                <Field
                  label="Referência da transação"
                  name="transactionRef"
                  autoComplete="off"
                  hint="ID do Pix (E2E) ou nº do comprovante. Obrigatória para Pix e transferência."
                />
              </div>
              <TextareaField label="Observações (opcional)" name="notes" rows={2} />
              <FileField
                label="Comprovante (opcional)"
                name="proof"
                accept={ACCEPTED_UPLOADS}
                hint="PDF, PNG, JPG ou WEBP até 5 MB."
              />
              <CheckboxField
                name="confirmNow"
                label="Já conferi no extrato — confirmar agora"
                hint="Sem esta opção, o pagamento fica 'em análise' até a conferência."
              />
              <Field
                label="Justificativa (somente se for o seu próprio pagamento)"
                name="confirmationNote"
                hint="Exigida quando o administrador confirma um pagamento próprio sem outro administrador disponível."
              />
              <DuplicateAck />
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
