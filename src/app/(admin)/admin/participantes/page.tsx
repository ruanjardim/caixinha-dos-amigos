import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { ParticipantStatusBadge } from "@/components/finance/status-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatPhone } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import { listParticipants } from "@/modules/participants/service";

export const metadata = { title: "Participantes" };

const STATUS_FILTERS = [
  { value: "", label: "Todos" },
  { value: "ACTIVE", label: "Ativos" },
  { value: "INACTIVE", label: "Inativos" },
];

export default async function ParticipantsPage({ searchParams }: PageProps<"/admin/participantes">) {
  await requirePagePermission("participants.manage");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const status = typeof params.status === "string" ? params.status : "";
  const participants = await listParticipants({ q, status });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Participantes"
        description="Cadastro mínimo, busca e acesso dos participantes."
        actions={
          <LinkButton href="/admin/participantes/novo">
            <UserPlus className="size-4" aria-hidden /> Novo participante
          </LinkButton>
        }
      />

      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome, e-mail ou telefone"
            className="border-line bg-surface focus:border-brand-500 focus:ring-brand-100 h-11 w-full rounded-xl border pr-3 pl-9 focus:ring-4 focus:outline-none"
          />
        </label>
        <select
          name="status"
          defaultValue={status}
          aria-label="Situação"
          className="border-line bg-surface h-11 rounded-xl border px-3"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button type="submit" className="bg-ink h-11 rounded-xl px-4 font-semibold text-white">
          Filtrar
        </button>
      </form>

      <Card className="overflow-hidden">
        {participants.length === 0 ? (
          <EmptyState
            icon={<Users className="size-7" />}
            title={q || status ? "Nenhum resultado" : "Nenhum participante ainda"}
          >
            {q || status ? "Ajuste a busca ou os filtros." : "Cadastre o primeiro participante do grupo."}
          </EmptyState>
        ) : (
          <ul className="divide-line divide-y">
            {participants.map((p) => {
              const quotas = p.memberships.reduce((s, m) => s + m.quotaCount, 0);
              return (
                <li key={p.id}>
                  <Link
                    href={`/admin/participantes/${p.id}`}
                    className="hover:bg-canvas grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.fullName}</p>
                      <p className="text-muted truncate text-sm">{p.email}</p>
                    </div>
                    <p className="text-muted hidden text-sm sm:block">
                      {p.phone ? formatPhone(p.phone) : "—"}
                      <br />
                      {quotas > 0 ? `${quotas} cota(s) no ciclo atual` : "Sem ciclo ativo"}
                    </p>
                    <span className="hidden sm:inline">
                      {p.user ? (
                        <Badge tone={p.user.status === "ACTIVE" ? "blue" : "gray"}>
                          {p.user.status === "ACTIVE" ? "Com acesso" : "Acesso suspenso"}
                        </Badge>
                      ) : (
                        <Badge tone="gray">Sem acesso</Badge>
                      )}
                    </span>
                    <ParticipantStatusBadge status={p.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-muted text-xs">{participants.length} participante(s)</p>
    </div>
  );
}
