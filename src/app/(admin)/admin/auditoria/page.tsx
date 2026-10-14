import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/modules/auth/session";

export const metadata = { title: "Auditoria" };

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Entrou no sistema",
  "auth.logout": "Saiu do sistema",
  "auth.password_reset": "Redefiniu a senha",
  "seed.demo": "Dados de demonstração criados",
  "admin.create": "Administrador criado",
  "participant.create": "Participante cadastrado",
  "participant.update": "Cadastro de participante alterado",
  "participant.status": "Situação do participante alterada",
  "participant.grant_access": "Acesso liberado (convite enviado)",
  "participant.suspend_access": "Acesso suspenso",
  "participant.self_update": "Participante atualizou o próprio telefone",
  "cycle.create": "Ciclo criado",
  "cycle.update": "Ciclo alterado",
  "cycle.publish_rules": "Regras publicadas e congeladas",
  "cycle.open": "Ciclo aberto",
  "cycle.close_contributions": "Contribuições encerradas",
  "membership.create": "Participante incluído no ciclo",
  "membership.update": "Participação ajustada",
  "membership.remove": "Participação removida (ciclo em preparação)",
  "membership.change_quotas": "Cotas alteradas",
  "membership.leave": "Saída do ciclo registrada",
  "rules.accept": "Regras aceitas pelo participante",
  "payment.register": "Pagamento registrado",
  "payment.inform": "Pagamento informado pelo participante",
  "payment.confirm": "Pagamento confirmado",
  "payment.reject": "Pagamento recusado",
  "payment.reverse": "Pagamento estornado",
  "payment.edit": "Pagamento corrigido",
  "ledger.entry": "Lançamento no livro-caixa",
  "ledger.reverse": "Lançamento estornado",
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });

export default async function AuditPage() {
  await requirePagePermission("audit.read");
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Auditoria</h1>
        <p className="text-muted">
          Registro permanente das ações no sistema. Estes registros não podem ser alterados nem apagados.
        </p>
      </header>

      <Card className="overflow-hidden">
        {logs.length === 0 ? (
          <p className="text-muted p-6 text-center">Nenhum registro ainda.</p>
        ) : (
          <ul className="divide-line divide-y">
            {logs.map((log) => (
              <li
                key={log.id}
                className="grid grid-cols-[minmax(0,1fr)] gap-1 px-4 py-3 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
              >
                <time className="tabular text-muted text-xs" dateTime={log.createdAt.toISOString()}>
                  {dateFmt.format(log.createdAt)}
                </time>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{ACTION_LABELS[log.action] ?? log.action}</p>
                  <p className="text-muted truncate text-xs">
                    {log.actor?.name ?? "Sistema"} · {log.entityType}
                    {log.entityId ? ` · ${log.entityId}` : ""}
                  </p>
                </div>
                <span className="text-muted text-xs">{log.ipAddress ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
