import { CheckCircle2, Lock } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { formatPercentBps } from "@/domain/rules";
import { formatBRL } from "@/domain/money";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import { acceptRulesAction } from "@/modules/cycles/actions";
import { getOwnMemberships } from "@/modules/cycles/queries";

export const metadata = { title: "Regras do ciclo" };

export default async function RulesPage() {
  const user = await requirePagePermission("self.rules.accept");
  const memberships = user.participantId ? await getOwnMemberships(user.participantId) : [];
  const withRules = memberships.filter((m) => m.cycle.rules[0]?.frozenAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Regras do ciclo"
        description="As regras ficam congeladas quando publicadas e valem para todo o ciclo."
      />
      {withRules.length === 0 && <Alert tone="info">Ainda não há regras publicadas para os seus ciclos.</Alert>}
      {withRules.map((m) => {
        const rules = m.cycle.rules[0];
        const accepted = rules.acceptances[0];
        return (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle>
                {m.cycle.name} — versão {rules.version}
              </CardTitle>
              <Lock className="text-muted size-4" aria-label="Regras congeladas" />
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="bg-canvas grid gap-3 rounded-xl p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted text-xs font-semibold">Valores de cota</dt>
                  <dd className="font-semibold">{rules.quotaValuesCents.map((v) => formatBRL(v)).join(" ou ")}</dd>
                </div>
                <div>
                  <dt className="text-muted text-xs font-semibold">Remuneração administrativa</dt>
                  <dd className="font-semibold">{formatPercentBps(rules.adminFeeBps)} do resultado líquido positivo</dd>
                </div>
              </dl>
              <div className="text-ink-soft max-h-[50vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-line">
                {rules.rulesText}
              </div>
              <p className="text-muted text-xs break-all">Código de verificação (SHA-256): {rules.contentHash}</p>
              {accepted ? (
                <Alert tone="success">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" aria-hidden /> Você aceitou estas regras em{" "}
                    {formatDateTime(accepted.acceptedAt)}.
                  </span>
                </Alert>
              ) : (
                <ActionForm action={acceptRulesAction} submitLabel="Registrar meu aceite" fullWidthSubmit>
                  <input type="hidden" name="cycleId" value={m.cycleId} />
                  <CheckboxField name="agree" label="Li e concordo com as regras deste ciclo." />
                </ActionForm>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
