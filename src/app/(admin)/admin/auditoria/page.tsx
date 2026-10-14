import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { auditActionLabel } from "@/modules/audit/labels";
import { requirePagePermission } from "@/modules/auth/session";

export const metadata = { title: "Auditoria" };

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
                  <p className="text-sm font-semibold">{auditActionLabel(log.action)}</p>
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
