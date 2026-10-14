import { ActionForm } from "@/components/forms/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePagePermission } from "@/modules/auth/session";
import { createCycleAction } from "@/modules/cycles/actions";
import { CycleFields } from "../cycle-fields";

export const metadata = { title: "Novo ciclo" };

export default async function NewCyclePage() {
  await requirePagePermission("cycles.manage");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Novo ciclo" back={{ href: "/admin/ciclos", label: "Ciclos" }} />
      <Alert tone="info" title="Como funciona">
        O ciclo começa em preparação: você ajusta datas, cotas e regras e inclui os participantes. Ao publicar as regras
        elas ficam congeladas; ao abrir o ciclo, as parcelas previstas são geradas.
      </Alert>
      <Card>
        <CardContent>
          <ActionForm action={createCycleAction} submitLabel="Criar ciclo">
            <CycleFields
              defaults={{
                name: "Ciclo 2026/2027",
                startDate: "2026-12-01",
                contributionEndDate: "2027-11-30",
                settlementDate: "2027-12-15",
                dueDay: 10,
                adminFeePercent: "10",
                quotaValues: "50; 100",
                rulesText: "",
              }}
            />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
