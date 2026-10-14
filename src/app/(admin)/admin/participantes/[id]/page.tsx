import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, KeyRound } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { CycleStatusBadge, ParticipantStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { toISODate } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { requirePagePermission } from "@/modules/auth/session";
import {
  grantAccessAction,
  setParticipantStatusAction,
  suspendAccessAction,
  updateParticipantAction,
} from "@/modules/participants/actions";
import { getParticipant } from "@/modules/participants/service";
import { ParticipantFields } from "../participant-fields";

export const metadata = { title: "Participante" };

export default async function ParticipantPage({ params }: PageProps<"/admin/participantes/[id]">) {
  const actor = await requirePagePermission("participants.manage");
  const { id } = await params;
  const p = await getParticipant(id);
  if (!p) notFound();

  const hasAccess = p.user?.status === "ACTIVE";
  const isSelf = p.user?.id === actor.userId;

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.fullName}
        eyebrow="Participante"
        back={{ href: "/admin/participantes", label: "Participantes" }}
        actions={<ParticipantStatusBadge status={p.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dados cadastrais</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateParticipantAction} submitLabel="Salvar alterações">
              <input type="hidden" name="id" value={p.id} />
              <ParticipantFields
                defaults={{ fullName: p.fullName, email: p.email, phone: p.phone, joinedAt: toISODate(p.joinedAt) }}
              />
              <p className="text-muted text-xs">Toda alteração fica registrada na auditoria (antes e depois).</p>
            </ActionForm>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Acesso ao sistema</CardTitle>
              {p.user ? (
                <Badge tone={hasAccess ? "blue" : "gray"}>{hasAccess ? "Ativo" : "Suspenso"}</Badge>
              ) : (
                <Badge tone="gray">Sem acesso</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {p.user?.role === "ADMIN" && (
                <Alert tone="info">Este participante também é administrador do sistema.</Alert>
              )}
              {!hasAccess && p.status === "ACTIVE" && (
                <ActionForm
                  action={grantAccessAction}
                  submitLabel={p.user ? "Reativar e enviar link" : "Enviar convite de acesso"}
                >
                  <input type="hidden" name="id" value={p.id} />
                  <p className="text-muted flex gap-2 text-sm">
                    <KeyRound className="text-brand-600 mt-0.5 size-4 shrink-0" aria-hidden />O participante recebe por
                    e-mail um link para definir a própria senha. Ninguém mais a conhece.
                  </p>
                </ActionForm>
              )}
              {hasAccess && (
                <>
                  <ActionForm action={grantAccessAction} submitLabel="Reenviar link de senha" submitVariant="secondary">
                    <input type="hidden" name="id" value={p.id} />
                  </ActionForm>
                  {!isSelf && (
                    <ActionForm
                      action={suspendAccessAction}
                      submitLabel="Suspender acesso"
                      submitVariant="danger"
                      confirm="Suspender o acesso deste participante? As sessões abertas serão encerradas."
                    >
                      <input type="hidden" name="id" value={p.id} />
                      <Field label="Motivo da suspensão" name="reason" required />
                    </ActionForm>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Situação do cadastro</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={setParticipantStatusAction}
                submitLabel={p.status === "ACTIVE" ? "Inativar cadastro" : "Reativar cadastro"}
                submitVariant={p.status === "ACTIVE" ? "danger" : "primary"}
                confirm={
                  p.status === "ACTIVE"
                    ? "Inativar este cadastro? O acesso ao sistema também será suspenso."
                    : undefined
                }
              >
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="status" value={p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                <Field label="Motivo" name="reason" required />
                <p className="text-muted text-xs">Cadastros nunca são apagados: o histórico financeiro é preservado.</p>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Participação nos ciclos</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {p.memberships.length === 0 ? (
            <p className="text-muted px-5 pb-5 text-sm">
              Ainda não participa de nenhum ciclo. Inclua-o pela tela do ciclo.
            </p>
          ) : (
            <ul className="divide-line divide-y">
              {p.memberships.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/admin/ciclos/${m.cycle.id}/participacoes/${m.id}`}
                    className="hover:bg-canvas flex items-center gap-3 px-5 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{m.cycle.name}</p>
                      <p className="text-muted text-sm">
                        {m.quotaCount} × {formatBRL(m.quotaValueCents)} = {formatBRL(m.quotaCount * m.quotaValueCents)}
                        /mês
                        {m.status === "LEFT" ? " · saiu do ciclo" : ""}
                      </p>
                    </div>
                    <CycleStatusBadge status={m.cycle.status} />
                    <ChevronRight className="text-muted size-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
