import { ActionForm } from "@/components/forms/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField, Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate } from "@/domain/dates";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import { updateOwnProfileAction } from "@/modules/participants/actions";
import { updateNotificationPreferenceAction } from "@/modules/notifications/actions";

export const metadata = { title: "Meus dados" };

export default async function ProfilePage() {
  const user = await requirePagePermission("self.profile.update");
  const [participant, account] = await Promise.all([
    user.participantId ? db.participant.findUnique({ where: { id: user.participantId } }) : null,
    db.user.findUnique({ where: { id: user.userId }, select: { emailNotifications: true } }),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Meus dados" />
      {!participant ? (
        <Alert tone="warning">Seu acesso não está vinculado a um cadastro de participante.</Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Cadastro</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted text-xs font-semibold">Nome</dt>
                  <dd className="font-semibold">{participant.fullName}</dd>
                </div>
                <div>
                  <dt className="text-muted text-xs font-semibold">E-mail de acesso</dt>
                  <dd className="font-semibold">{participant.email}</dd>
                </div>
                <div>
                  <dt className="text-muted text-xs font-semibold">No grupo desde</dt>
                  <dd className="font-semibold">{formatDateBR(toISODate(participant.joinedAt))}</dd>
                </div>
              </dl>
              <p className="text-muted mt-4 text-xs">Para alterar nome ou e-mail, fale com a administração.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Contato</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateOwnProfileAction} submitLabel="Salvar">
                <Field
                  label="Telefone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="(11) 91234-5678"
                  defaultValue={participant.phone ? formatPhone(participant.phone) : ""}
                />
              </ActionForm>
            </CardContent>
          </Card>
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Avisos por e-mail</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateNotificationPreferenceAction} submitLabel="Salvar preferência">
            <CheckboxField
              name="emailNotifications"
              label="Quero receber avisos por e-mail"
              hint="Lembretes de vencimento, confirmação de pagamentos, comunicados e resultados. E-mails de segurança (como redefinição de senha) são sempre enviados."
              defaultChecked={account?.emailNotifications ?? true}
            />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
