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

export const metadata = { title: "Comunicados" };

export default async function AdminAnnouncementsPage() {
  await requirePagePermission("announcements.manage");
  const [items, cycles] = await Promise.all([
    listAnnouncementsForAdmin(),
    db.cycle.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
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
                    className="border-line hover:bg-canvas inline-flex h-9 items-center gap-1.5 rounded-xl border bg-white px-3 text-sm font-semibold"
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
    </div>
  );
}
