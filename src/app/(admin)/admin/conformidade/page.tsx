import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { ComplianceBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, TextareaField } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import { setFlagAction } from "@/modules/fundraising/actions";

export const metadata = { title: "Conformidade" };

const FLAGS: Record<string, { title: string; what: string; requires: string; note?: string }> = {
  RAFFLE_SALES_ENABLED: {
    title: "Venda de números de sorteio",
    what: "Permite que atividades com parecer favorável saiam da simulação e registrem pagamentos reais de números.",
    requires:
      "Modalidade legal identificada e autorização, quando exigida (Lei 5.768/1971). Grupo privado não é autorização.",
  },
  PIX_LIVE_ENABLED: {
    title: "Cobrança Pix real",
    what: "Habilitaria cobranças por um prestador de pagamentos autorizado.",
    requires: "Estrutura jurídica (ex.: CNPJ) e conta de recebimento da caixinha — nunca conta pessoal.",
    note: "Nenhum prestador real está integrado nesta versão: mesmo ligado, só os modos manual e simulação funcionam.",
  },
  ADMIN_PAYOUT_ENABLED: {
    title: "Pagamento da remuneração administrativa",
    what: "Libera o registro do pagamento da remuneração apurada ao administrador.",
    requires: "Validação jurídica e tributária.",
  },
};

export default async function CompliancePage() {
  const user = await requirePagePermission("compliance.decide");
  const [flags, pending, history] = await Promise.all([
    db.featureFlag.findMany({ orderBy: { key: "asc" } }),
    db.fundraisingActivity.findMany({
      where: {
        type: "RAFFLE",
        complianceStatus: "PENDING_REVIEW",
        status: { notIn: ["FINISHED", "CANCELLED"] },
        ...(user.caixinhaId ? { cycle: { caixinhaId: user.caixinhaId } } : {}),
      },
      select: { id: true, title: true, cycle: { select: { name: true } } },
    }),
    db.auditLog.findMany({
      where: {
        action: {
          in: ["compliance.flag_on", "compliance.flag_off", "compliance.decide", "fundraising.authorized_mode"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conformidade"
        description="Recursos sensíveis ficam desligados por padrão. Ligar exige justificativa e fica registrado para sempre."
      />
      <Alert tone="warning" title="Antes de ligar qualquer recurso">
        Obtenha parecer de advogado e, quando aplicável, de contador. O sistema registra a decisão, mas não substitui a
        análise jurídica.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        {flags.map((flag) => {
          const info = FLAGS[flag.key];
          if (!info) return null;
          return (
            <Card key={flag.key}>
              <CardHeader>
                <CardTitle>{info.title}</CardTitle>
                <Badge tone={flag.enabled ? "amber" : "gray"}>{flag.enabled ? "Ligado" : "Desligado"}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{info.what}</p>
                <p className="text-muted">
                  <strong>Exige:</strong> {info.requires}
                </p>
                {info.note && <Alert tone="info">{info.note}</Alert>}
                {flag.justification && (
                  <p className="text-muted text-xs">
                    Última justificativa: “{flag.justification}” · {formatDateTime(flag.updatedAt)}
                  </p>
                )}
                <ActionForm
                  action={setFlagAction}
                  submitLabel={flag.enabled ? "Desligar" : "Ligar recurso"}
                  submitVariant={flag.enabled ? "secondary" : "danger"}
                  resetOnSuccess
                >
                  <input type="hidden" name="key" value={flag.key} />
                  {!flag.enabled && <input type="hidden" name="enable" value="on" />}
                  <TextareaField
                    label={flag.enabled ? "Motivo da desativação" : "Justificativa (base legal, parecer)"}
                    name="justification"
                    rows={3}
                  />
                  {!flag.enabled && (
                    <Field label='Digite "ATIVAR" para confirmar' name="confirmation" autoComplete="off" />
                  )}
                </ActionForm>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sorteios aguardando parecer</CardTitle>
          <ShieldAlert className="text-warning size-4" aria-hidden />
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-muted text-sm">Nenhum.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {pending.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <ComplianceBadge status="PENDING_REVIEW" />
                  <Link href={`/admin/arrecadacao/${a.id}`} className="font-semibold hover:underline">
                    {a.title}
                  </Link>
                  <span className="text-muted">· {a.cycle.name}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de decisões</CardTitle>
          <ShieldCheck className="text-muted size-4" aria-hidden />
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted text-sm">Nenhuma decisão registrada.</p>
          ) : (
            <ul className="divide-line divide-y text-sm">
              {history.map((h) => (
                <li key={h.id} className="py-2">
                  <p className="font-semibold">
                    {h.action === "compliance.flag_on"
                      ? `Ligou ${FLAGS[h.entityId ?? ""]?.title ?? h.entityId}`
                      : h.action === "compliance.flag_off"
                        ? `Desligou ${FLAGS[h.entityId ?? ""]?.title ?? h.entityId}`
                        : h.action === "fundraising.authorized_mode"
                          ? "Ativou modo autorizado de um sorteio"
                          : "Registrou parecer de conformidade"}
                  </p>
                  <p className="text-muted">
                    {h.actor?.name ?? "—"} · {formatDateTime(h.createdAt)}
                    {h.reason ? ` · “${h.reason.slice(0, 160)}”` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
