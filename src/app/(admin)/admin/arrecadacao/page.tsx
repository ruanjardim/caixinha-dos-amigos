import Link from "next/link";
import { ChevronRight, PartyPopper, ShieldAlert } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { ACTIVITY_TYPE_LABEL, ActivityStatusBadge, ComplianceBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyValue } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/modules/auth/session";
import { createActivityAction } from "@/modules/fundraising/actions";
import { listActivities } from "@/modules/fundraising/queries";
import { ActivityFields } from "./activity-fields";

export const metadata = { title: "Arrecadação" };

export default async function FundraisingPage() {
  const user = await requirePagePermission("fundraising.manage");
  const [activities, cycles, flag] = await Promise.all([
    listActivities({ caixinhaId: user.caixinhaId }),
    db.cycle.findMany({
      where: { status: { not: "CLOSED" }, ...(user.caixinhaId ? { caixinhaId: user.caixinhaId } : {}) },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
    }),
    db.featureFlag.findUnique({ where: { key: "RAFFLE_SALES_ENABLED" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atividades de arrecadação"
        description="Eventos, vendas, doações e sorteios: cadastro, custos, receitas, participantes e resultados."
      />

      <Alert tone={flag?.enabled ? "warning" : "info"} title="Sorteios pagos: desativados por padrão">
        Venda de números, cobrança vinculada a sorteio e execução de sorteios só existem para atividades com parecer de
        conformidade favorável e o recurso ligado em{" "}
        <Link href="/admin/conformidade" className="font-semibold underline">
          Conformidade
        </Link>
        . Ser um grupo privado não é autorização. Até lá: cadastro, simulação e controle.
      </Alert>

      <Card className="overflow-hidden">
        {activities.length === 0 ? (
          <EmptyState icon={<PartyPopper className="size-7" />} title="Nenhuma atividade ainda" />
        ) : (
          <ul className="divide-line divide-y">
            {activities.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/arrecadacao/${a.id}`}
                  className="hover:bg-canvas flex items-center gap-3 px-4 py-3.5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-semibold">{a.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge tone="gray">{ACTIVITY_TYPE_LABEL[a.type]}</Badge>
                      <ActivityStatusBadge status={a.status} />
                      {a.type === "RAFFLE" && <ComplianceBadge status={a.complianceStatus} />}
                      {a.type === "RAFFLE" && a.simulationOnly && (
                        <Badge tone="amber">
                          <ShieldAlert className="size-3" aria-hidden /> Simulação
                        </Badge>
                      )}
                      <span className="text-muted">{a.cycle.name}</span>
                    </div>
                  </div>
                  <div className="hidden text-right text-sm sm:block">
                    <p className="text-muted text-xs">Resultado</p>
                    <MoneyValue cents={a.financials.revenueCents - a.financials.costCents} />
                  </div>
                  <ChevronRight className="text-muted size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nova atividade</CardTitle>
        </CardHeader>
        <CardContent>
          {cycles.length === 0 ? (
            <p className="text-muted text-sm">Crie um ciclo antes de cadastrar atividades.</p>
          ) : (
            <ActionForm action={createActivityAction} submitLabel="Cadastrar atividade">
              <ActivityFields
                cycles={cycles}
                defaults={{
                  type: "EVENT",
                  title: "",
                  description: "",
                  startsOn: "",
                  endsOn: "",
                  numberRangeStart: "",
                  numberRangeEnd: "",
                  unitPrice: "",
                  promotionRules: "",
                }}
              />
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
