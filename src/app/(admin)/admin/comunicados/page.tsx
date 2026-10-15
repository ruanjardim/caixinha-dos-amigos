import Link from "next/link";
import { Megaphone, Pencil } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField, Field, SelectField, TextareaField } from "@/components/ui/field";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { createAnnouncementAction, toggleAnnouncementAction } from "@/modules/announcements/actions";
import { listAnnouncementsForAdmin } from "@/modules/announcements/service";
import { requirePagePermission } from "@/modules/auth/session";
import { listNotificationLog, NOTIFICATION_KIND_LABEL } from "@/modules/notifications/service";

export const metadata = { title: "Comunicados" };

export default async function AdminAnnouncementsPage() {
  await requirePagePermission("announcements.manage");
  const [items, cycles, log] = await Promise.all([
    listAnnouncementsForAdmin(),
    db.cycle.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    listNotificationLog(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Comunicados" description="Avisos para todo o grupo ou para os participantes de um ciclo." />

      <Card>
        <CardHeader>
          <CardTitle>Novo comunicado</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createAnnouncementAction} submitLabel="Salvar" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label="Título" name="title" required maxLength={120} />
              <SelectField
                label="Para quem"
                name="cycleId"
                options={[{ value: "", label: "Todo o grupo" }, ...cycles.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </div>
            <TextareaField
              label="Texto"
              name="body"
              rows={5}
              maxLength={5000}
              hint="Texto simples. Não inclua dados pessoais ou financeiros individuais."
            />
            <CheckboxField
              name="publishNow"
              label="Publicar agora"
              hint="Sem marcar, fica como rascunho."
              defaultChecked
            />
          </ActionForm>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={<Megaphone className="size-7" />} title="Nenhum comunicado ainda" />
        ) : (
          <ul className="divide-line divide-y">
            {items.map((a) => (
              <li key={a.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.title}</p>
                    {a.publishedAt ? <Badge tone="green">Publicado</Badge> : <Badge tone="gray">Rascunho</Badge>}
                    <Badge tone="gray">{a.cycle?.name ?? "Todo o grupo"}</Badge>
                  </div>
                  <p className="text-muted line-clamp-2 text-sm">{a.body}</p>
                  <p className="text-muted text-xs">
                    {a.publishedAt
                      ? `Publicado em ${formatDateTime(a.publishedAt)}`
                      : `Criado em ${formatDateTime(a.createdAt)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/comunicados/${a.id}`}
                    className="border-line bg-surface hover:bg-canvas inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold"
                  >
                    <Pencil className="size-4" aria-hidden /> Editar
                  </Link>
                  <ActionForm
                    action={toggleAnnouncementAction}
                    submitLabel={a.publishedAt ? "Despublicar" : "Publicar"}
                    submitVariant={a.publishedAt ? "secondary" : "primary"}
                    className="space-y-0 [&_button]:h-9 [&_button]:text-sm"
                  >
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="publish" value={a.publishedAt ? "false" : "true"} />
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-col gap-1">
          <CardTitle>Avisos por e-mail enviados</CardTitle>
          <p className="text-muted text-sm">
            Cada aviso é enviado uma única vez. Quem desativou os avisos aparece como “não enviado (preferência)”.
          </p>
        </CardHeader>
        {log.length === 0 ? (
          <EmptyState title="Nenhum aviso enviado ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-muted bg-canvas text-left text-xs">
                <tr>
                  <th className="px-4 py-2 font-semibold">Quando</th>
                  <th className="px-4 py-2 font-semibold">Tipo</th>
                  <th className="px-4 py-2 font-semibold">Para</th>
                  <th className="px-4 py-2 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {log.map((n) => (
                  <tr key={n.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(n.createdAt)}</td>
                    <td className="px-4 py-2">
                      {NOTIFICATION_KIND_LABEL[n.kind] ?? n.kind}
                      <span className="text-muted block truncate text-xs">{n.subject}</span>
                    </td>
                    <td className="px-4 py-2 break-all">{n.email}</td>
                    <td className="px-4 py-2">
                      {n.status === "SENT" ? (
                        <Badge tone="green">Enviado</Badge>
                      ) : n.status === "SKIPPED" ? (
                        <Badge tone="gray">Não enviado (preferência)</Badge>
                      ) : (
                        <Badge tone="red" title={n.error ?? undefined}>
                          Falhou
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
