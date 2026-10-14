import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { toISODate } from "@/domain/dates";
import { centsToInput } from "@/domain/money";
import { defaultRulesText } from "@/domain/rules";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/modules/auth/session";
import { updateCycleAction } from "@/modules/cycles/actions";
import { CycleFields } from "../../cycle-fields";

export const metadata = { title: "Editar ciclo" };

export default async function EditCyclePage({ params }: PageProps<"/admin/ciclos/[id]/editar">) {
  await requirePagePermission("cycles.manage");
  const { id } = await params;
  const cycle = await db.cycle.findUnique({
    where: { id },
    include: { rules: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!cycle) notFound();
  const rules = cycle.rules[0];
  if (cycle.status !== "DRAFT" || rules?.frozenAt) redirect(`/admin/ciclos/${id}`);

  // Texto padrão não editado: deixa em branco para ser regerado com os novos dados.
  const autoText =
    rules &&
    rules.rulesText ===
      defaultRulesText({
        startDate: toISODate(cycle.startDate),
        contributionEndDate: toISODate(cycle.contributionEndDate),
        settlementDate: toISODate(cycle.settlementDate),
        dueDay: cycle.dueDay,
        adminFeeBps: rules.adminFeeBps,
        quotaValuesCents: rules.quotaValuesCents,
      });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={`Editar ${cycle.name}`} back={{ href: `/admin/ciclos/${id}`, label: "Voltar ao ciclo" }} />
      <Card>
        <CardContent>
          <ActionForm action={updateCycleAction} submitLabel="Salvar">
            <input type="hidden" name="id" value={cycle.id} />
            <CycleFields
              defaults={{
                name: cycle.name,
                startDate: toISODate(cycle.startDate),
                contributionEndDate: toISODate(cycle.contributionEndDate),
                settlementDate: toISODate(cycle.settlementDate),
                dueDay: cycle.dueDay,
                adminFeePercent: rules ? String(rules.adminFeeBps / 100).replace(".", ",") : "10",
                quotaValues: rules ? rules.quotaValuesCents.map(centsToInput).join("; ") : "50; 100",
                rulesText: autoText ? "" : (rules?.rulesText ?? ""),
              }}
            />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
