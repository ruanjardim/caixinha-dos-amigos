import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { CheckboxField, Field, SelectField, TextareaField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { updateAnnouncementAction } from "@/modules/announcements/actions";
import { requirePagePermission } from "@/modules/auth/session";

export const metadata = { title: "Editar comunicado" };

export default async function EditAnnouncementPage({ params }: PageProps<"/admin/comunicados/[id]">) {
  await requirePagePermission("announcements.manage");
  const { id } = await params;
  const [a, cycles] = await Promise.all([
    db.announcement.findUnique({ where: { id } }),
    db.cycle.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);
  if (!a) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Editar comunicado" back={{ href: "/admin/comunicados", label: "Comunicados" }} />
      <Card>
        <CardContent>
          <ActionForm action={updateAnnouncementAction} submitLabel="Salvar alterações">
            <input type="hidden" name="id" value={a.id} />
            <Field label="Título" name="title" required maxLength={120} defaultValue={a.title} />
            <SelectField
              label="Para quem"
              name="cycleId"
              defaultValue={a.cycleId ?? ""}
              options={[{ value: "", label: "Todo o grupo" }, ...cycles.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <TextareaField label="Texto" name="body" rows={8} maxLength={5000} defaultValue={a.body} />
            {!a.publishedAt && <CheckboxField name="publishNow" label="Publicar agora" />}
            <p className="text-muted text-xs">Alterações ficam registradas na auditoria (antes e depois).</p>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
