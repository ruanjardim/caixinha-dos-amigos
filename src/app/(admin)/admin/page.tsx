import { CalendarRange, CheckCircle2, Circle, Lock, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyLegend } from "@/components/ui/money-value";
import { StatCard } from "@/components/ui/stat-card";
import { db } from "@/lib/db";
import { requirePagePermission } from "@/modules/auth/session";

export const metadata = { title: "Painel do administrador" };

const FLAG_LABELS: Record<string, { title: string; why: string }> = {
  RAFFLE_SALES_ENABLED: {
    title: "Venda de números de sorteio",
    why: "Exige modalidade legalmente autorizada e aprovação de conformidade.",
  },
  PIX_LIVE_ENABLED: {
    title: "Cobrança Pix real",
    why: "Exige estrutura jurídica e conta de recebimento adequada (não pessoal).",
  },
  ADMIN_PAYOUT_ENABLED: {
    title: "Pagamento da remuneração administrativa",
    why: "Exige validação jurídica e tributária.",
  },
};

const PHASES = [
  { n: 1, title: "Fundação", done: true },
  { n: 2, title: "Gestão financeira", done: false },
  { n: 3, title: "Painéis", done: false },
  { n: 4, title: "Resultados", done: false },
  { n: 5, title: "Atividades de arrecadação", done: false },
  { n: 6, title: "Integrações", done: false },
  { n: 7, title: "Qualidade", done: false },
];

export default async function AdminDashboard() {
  const user = await requirePagePermission("dashboard.admin");
  const [participants, users, cycles, auditCount, flags] = await Promise.all([
    db.participant.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.cycle.count(),
    db.auditLog.count(),
    db.featureFlag.findMany({ orderBy: { key: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-brand-700 text-sm font-semibold">Painel do administrador</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Olá, {user.name.split(" ")[0]}!</h1>
        <p className="text-muted">
          Fundação do sistema concluída. Os indicadores financeiros completos chegam na Fase 3.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores">
        <StatCard label="Participantes ativos" icon={Users} value={participants} />
        <StatCard label="Usuários com acesso" icon={ShieldCheck} value={users} />
        <StatCard label="Ciclos" icon={CalendarRange} value={cycles} />
        <StatCard label="Registros de auditoria" icon={Lock} value={auditCount} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recursos sensíveis</CardTitle>
            <Badge tone="gray">desativados por padrão</Badge>
          </CardHeader>
          <CardContent>
            <ul className="divide-line divide-y">
              {flags.map((flag) => {
                const info = FLAG_LABELS[flag.key] ?? { title: flag.key, why: "" };
                return (
                  <li key={flag.key} className="flex items-start justify-between gap-4 py-3">
                    <div>
                      <p className="font-semibold">{info.title}</p>
                      <p className="text-muted text-sm">{info.why}</p>
                    </div>
                    <Badge tone={flag.enabled ? "amber" : "gray"}>{flag.enabled ? "Ativo" : "Desligado"}</Badge>
                  </li>
                );
              })}
            </ul>
            <p className="text-muted mt-3 text-xs">
              A ativação passará por uma etapa de validação de conformidade, registrada na auditoria.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plano de desenvolvimento</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2.5">
              {PHASES.map((p) => (
                <li key={p.n} className="flex items-center gap-3 text-sm">
                  {p.done ? (
                    <CheckCircle2 className="text-brand-600 size-5" aria-label="Concluída" />
                  ) : (
                    <Circle className="text-line size-5" aria-label="Pendente" />
                  )}
                  <span className={p.done ? "font-semibold" : "text-muted"}>
                    Fase {p.n} — {p.title}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-2">
          <p className="text-sm font-semibold">Como os valores serão exibidos</p>
          <MoneyLegend />
        </CardContent>
      </Card>
    </div>
  );
}
