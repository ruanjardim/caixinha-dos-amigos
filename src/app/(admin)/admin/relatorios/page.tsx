import Link from "next/link";
import { FileText } from "lucide-react";
import { DownloadLink } from "@/components/ui/download-link";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { requirePagePermission } from "@/modules/auth/session";
import { REPORT_TITLES, type ReportType } from "@/modules/reports/types";

export const metadata = { title: "Relatórios" };

const REPORTS: { type: ReportType; description: string }[] = [
  { type: "contribuicoes", description: "Cotas, previsto, recebido, atraso e antecipação de cada participante." },
  { type: "pendencias", description: "Parcelas vencidas em aberto e pagamentos aguardando conferência." },
  { type: "movimentacoes", description: "Livro-caixa completo, com responsável por lançamento." },
  { type: "receitas-despesas", description: "Receitas adicionais, despesas e tributos (sem contribuições)." },
  { type: "resultado", description: "Resultado líquido parcial ou apurado." },
  { type: "remuneracao", description: "Cálculo e situação da remuneração administrativa." },
  { type: "distribuicao", description: "Peso, participação e valor de cada participante." },
  { type: "encerramento", description: "Resumo anual: totais, apuração, distribuições e correções." },
  {
    type: "prestacao-de-contas",
    description: "Versão coletiva, sem dados individuais (os participantes também emitem).",
  },
  {
    type: "atividades",
    description: "Receitas, custos, resultado, conformidade e resultados oficiais de cada atividade.",
  },
];

export default async function ReportsPage({ searchParams }: PageProps<"/admin/relatorios">) {
  const user = await requirePagePermission("reports.consolidated");
  const params = await searchParams;
  const cycles = await db.cycle.findMany({
    where: { status: { not: "DRAFT" }, ...(user.caixinhaId ? { caixinhaId: user.caixinhaId } : {}) },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true },
  });
  const requested = typeof params.ciclo === "string" ? params.ciclo : undefined;
  const cycleId = cycles.find((c) => c.id === requested)?.id ?? cycles[0]?.id;

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" description="Todos em PDF (para leitura e arquivo) e Excel (para conferência)." />

      {!cycleId ? (
        <Card>
          <EmptyState icon={<FileText className="size-7" />} title="Nenhum ciclo aberto ainda" />
        </Card>
      ) : (
        <>
          {cycles.length > 1 && (
            <nav className="flex gap-1 overflow-x-auto" aria-label="Ciclo">
              {cycles.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/relatorios?ciclo=${c.id}`}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap",
                    c.id === cycleId ? "bg-brand-600 text-white" : "border-line bg-surface border",
                  )}
                >
                  {c.name}
                </Link>
              ))}
            </nav>
          )}
          <Card className="overflow-hidden">
            <ul className="divide-line divide-y">
              {REPORTS.map((r, i) => (
                <li key={r.type} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {i + 1}. {REPORT_TITLES[r.type]}
                    </p>
                    <p className="text-muted text-sm">{r.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <DownloadLink href={`/api/relatorios/${r.type}?ciclo=${cycleId}&formato=pdf`} icon="pdf" />
                    <DownloadLink href={`/api/relatorios/${r.type}?ciclo=${cycleId}&formato=xlsx`} icon="xlsx" />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-muted text-xs">
            Cada emissão fica registrada na auditoria. Os relatórios consolidados contêm dados pessoais: compartilhe
            somente com quem precisa.
          </p>
        </>
      )}
    </div>
  );
}
