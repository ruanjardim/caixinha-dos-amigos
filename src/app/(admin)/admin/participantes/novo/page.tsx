import { ShieldCheck } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { todayInBrazil } from "@/domain/dates";
import { requirePagePermission } from "@/modules/auth/session";
import { createParticipantAction } from "@/modules/participants/actions";
import { ParticipantFields } from "../participant-fields";

export const metadata = { title: "Novo participante" };

export default async function NewParticipantPage() {
  await requirePagePermission("participants.manage");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Novo participante" back={{ href: "/admin/participantes", label: "Participantes" }} />
      <Card>
        <CardContent>
          <ActionForm action={createParticipantAction} submitLabel="Cadastrar participante">
            <ParticipantFields defaults={{ fullName: "", email: "", phone: null, joinedAt: todayInBrazil() }} />
          </ActionForm>
        </CardContent>
      </Card>
      <p className="text-muted flex gap-2 text-sm">
        <ShieldCheck className="text-brand-600 mt-0.5 size-4 shrink-0" aria-hidden />
        LGPD: coletamos apenas o necessário para a gestão da caixinha. Dados adicionais só serão pedidos quando forem
        realmente necessários.
      </p>
    </div>
  );
}
