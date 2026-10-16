import { ActionForm } from "@/components/forms/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Field, TextareaField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { createCaixinhaAction } from "@/modules/caixinhas/actions";
import { requirePagePermission } from "@/modules/auth/session";

export const metadata = { title: "Nova caixinha" };

export default async function NewCaixinhaPage() {
  await requirePagePermission("dashboard.admin");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Criar uma caixinha" back={{ href: "/admin/caixinhas", label: "Minhas caixinhas" }} />
      <Alert tone="info" title="Um espaço para cada grupo">
        Depois de criar, você cadastra os participantes e configura o primeiro ciclo. Os dados ficam separados das
        outras caixinhas.
      </Alert>
      <Card>
        <CardContent>
          <ActionForm action={createCaixinhaAction} submitLabel="Criar caixinha">
            <Field
              name="name"
              label="Nome da caixinha"
              placeholder="Ex.: Amigos do Bairro"
              maxLength={80}
              required
              autoFocus
            />
            <TextareaField
              name="description"
              label="Descrição (opcional)"
              placeholder="Uma breve identificação do grupo."
              maxLength={300}
              rows={3}
            />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

