import Link from "next/link";
import { AlertTriangle, Clock, QrCode, ScanSearch } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { PixChargeStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, MoneyField, SelectField } from "@/components/ui/field";
import { MoneyValue } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import { listPayableMemberships } from "@/modules/cycles/queries";
import { createChargeAction } from "@/modules/pix/actions";
import { ATTENTION_OUTCOMES, outcomeLabel } from "@/modules/pix/outcomes";
import { getPixOverview, pixMode } from "@/modules/pix/queries";

export const metadata = { title: "Pix e conciliação" };

export default async function PixPage() {
  await requirePagePermission("payments.register");
  const mode = pixMode();
  const [overview, memberships] = await Promise.all([getPixOverview(), listPayableMemberships()]);
  const activeMemberships = memberships.filter((m) => m.status === "ACTIVE");
  const waiting = overview.charges.filter((c) => c.effectiveStatus === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pix e conciliação"
        description="Cobranças Pix, eventos recebidos do provedor e o que precisa de conferência."
      />

      {mode.simulation ? (
        <Alert tone="warning" title="Modo simulação">
          Cobranças e pagamentos aqui são fictícios: nenhum dinheiro real é movimentado. Use para testar o fluxo
          completo (cobrança → webhook → conferência). Pagamentos simulados entram como “em análise” e só vão para o
          livro-caixa se alguém confirmar — não confirme simulações em ciclos reais.
        </Alert>
      ) : (
        <Alert tone="info" title="Modo manual">
          O código Pix aponta para a conta da caixinha
          {mode.manualKey ? ` (${mode.manualKey.receiverName})` : ""}. O recebimento é conferido no extrato bancário e
          confirmado pela administração — não há confirmação automática.
          {!mode.manualConfigured &&
            " A chave da caixinha ainda não está configurada (PIX_MANUAL_KEY): não é possível gerar cobranças."}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Aguardando pagamento" icon={Clock} value={waiting} />
        <StatCard
          label="Pagamentos Pix em análise"
          icon={ScanSearch}
          value={overview.toReview}
          hint="Recebidos pelo webhook, aguardando conferência."
        />
        <StatCard
          label="Eventos que pedem atenção"
          icon={AlertTriangle}
          value={overview.attentionCount}
          hint="Últimos 30 dias."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Nova cobrança Pix</CardTitle>
          </CardHeader>
          <CardContent>
            {activeMemberships.length === 0 ? (
              <p className="text-muted text-sm">Não há participações ativas em ciclos abertos.</p>
            ) : (
              <ActionForm action={createChargeAction} submitLabel="Gerar cobrança" fullWidthSubmit>
                <SelectField
                  label="Participante"
                  name="membershipId"
                  placeholder="Selecione…"
                  options={activeMemberships.map((m) => ({
                    value: m.id,
                    label: `${m.participant.fullName} — ${m.cycle.name}`,
                  }))}
                  required
                />
                <MoneyField label="Valor (R$)" name="amountCents" required />
                <Field
                  label="Descrição (opcional)"
                  name="description"
                  maxLength={40}
                  placeholder="Ex.: Contribuição 11/2026"
                  hint="Aparece no app do banco. Sem acentos; até 40 caracteres."
                />
                <Field
                  label="Validade (dias)"
                  name="expiresInDays"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={5}
                  required
                />
              </ActionForm>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Cobranças</CardTitle>
          </CardHeader>
          {overview.charges.length === 0 ? (
            <EmptyState icon={<QrCode className="size-7" />} title="Nenhuma cobrança gerada" />
          ) : (
            <ul className="divide-line divide-y">
              {overview.charges.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/pix/${c.id}`}
                    className="hover:bg-canvas grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {c.membership?.participant.fullName ?? "—"}
                        {c.isSimulation && (
                          <Badge tone="amber" className="ml-2 align-middle">
                            Simulação
                          </Badge>
                        )}
                      </p>
                      <p className="text-muted truncate font-mono text-xs">{c.externalId}</p>
                    </div>
                    <MoneyValue cents={c.amountCents} className="text-right" />
                    <p className="text-muted truncate text-xs">
                      {c.membership?.cycle.name} · {formatDateTime(c.createdAt)}
                    </p>
                    <span className="justify-self-end">
                      <PixChargeStatusBadge status={c.effectiveStatus} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-col gap-1">
          <CardTitle>Eventos recebidos (webhook)</CardTitle>
          <p className="text-muted text-sm">
            Registro bruto e imutável de tudo o que chegou do provedor — inclusive tentativas com assinatura inválida.
          </p>
        </CardHeader>
        {overview.events.length === 0 ? (
          <EmptyState title="Nenhum evento recebido ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-muted bg-canvas text-left text-xs">
                <tr>
                  <th className="px-4 py-2 font-semibold">Recebido em</th>
                  <th className="px-4 py-2 font-semibold">Tipo</th>
                  <th className="px-4 py-2 font-semibold">Cobrança</th>
                  <th className="px-4 py-2 font-semibold">Assinatura</th>
                  <th className="px-4 py-2 font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {overview.events.map((e) => {
                  const attention = e.outcome ? ATTENTION_OUTCOMES.has(e.outcome) : false;
                  return (
                    <tr key={e.id} className={attention ? "bg-warning-bg/50" : undefined}>
                      <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(e.receivedAt)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{e.eventType ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {e.charge ? (
                          <Link href={`/admin/pix/${e.charge.id}`} className="text-brand-700 underline">
                            {e.charge.externalId}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {e.signatureValid ? <Badge tone="green">Válida</Badge> : <Badge tone="red">Inválida</Badge>}
                      </td>
                      <td className="px-4 py-2">
                        <span className={attention ? "text-warning font-semibold" : undefined}>
                          {attention && <AlertTriangle className="mr-1 inline size-3.5" aria-label="Atenção" />}
                          {outcomeLabel(e.outcome)}
                        </span>
                        {e.error && <span className="text-muted block text-xs">{e.error}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
