import { PartyPopper, ShieldAlert } from "lucide-react";
import { ACTIVITY_TYPE_LABEL, ActivityStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyValue } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate } from "@/domain/dates";
import { formatRaffleNumber } from "@/domain/fundraising";
import { requirePagePermission } from "@/modules/auth/session";
import { listActivitiesForParticipant } from "@/modules/fundraising/queries";

export const metadata = { title: "Atividades" };

export default async function ParticipantActivitiesPage() {
  const user = await requirePagePermission("reports.collective");
  const activities = await listActivitiesForParticipant(user.participantId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Atividades do grupo"
        description="Eventos e ações de arrecadação dos seus ciclos, com o resultado de cada uma."
      />
      {activities.length === 0 ? (
        <Card>
          <EmptyState icon={<PartyPopper className="size-7" />} title="Nenhuma atividade por enquanto" />
        </Card>
      ) : (
        <ul className="space-y-4">
          {activities.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold">{a.title}</h2>
                    <Badge tone="gray">{ACTIVITY_TYPE_LABEL[a.type]}</Badge>
                    <ActivityStatusBadge status={a.status} />
                  </div>
                  <p className="text-muted text-xs">
                    {a.cycle.name}
                    {a.startsOn && ` · ${formatDateBR(toISODate(a.startsOn))}`}
                    {a.endsOn && ` a ${formatDateBR(toISODate(a.endsOn))}`}
                  </p>
                  {a.type === "RAFFLE" && a.simulationOnly && (
                    <Alert tone="info">
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldAlert className="size-4" aria-hidden /> Simulação: não há venda de números nem sorteio
                        oficial.
                      </span>
                    </Alert>
                  )}
                  {a.description && <p className="text-ink-soft text-sm whitespace-pre-line">{a.description}</p>}
                  {a.images.length > 0 && (
                    <ul className="grid grid-cols-3 gap-2">
                      {a.images.map((img) => (
                        <li key={img.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- arquivo protegido servido pela API */}
                          <img
                            src={`/api/arquivos/${img.fileId}?inline=1`}
                            alt={img.caption ?? a.title}
                            className="border-line aspect-square w-full rounded-xl border object-cover"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {a.prizes.length > 0 && (
                    <p className="text-sm">
                      <strong>Prêmios:</strong> {a.prizes.map((p) => `${p.position}º ${p.name}`).join(" · ")}
                    </p>
                  )}
                  {a.numbers.length > 0 && (
                    <p className="text-sm">
                      <strong>Seus números:</strong>{" "}
                      {a.numbers
                        .map(
                          (n) =>
                            `${formatRaffleNumber(n.number, a.numberRangeEnd ?? n.number)}${n.status === "RESERVED" ? " (reservado)" : ""}`,
                        )
                        .join(", ")}
                    </p>
                  )}
                  {a.drawResult && (
                    <Alert tone="success" title="Resultado oficial">
                      {a.drawResult} · {a.drawSource}
                    </Alert>
                  )}
                  {(a.financials.revenueCents > 0 || a.financials.costCents > 0) && (
                    <p className="text-sm">
                      Resultado da atividade:{" "}
                      <MoneyValue cents={a.financials.revenueCents - a.financials.costCents} kind="received" />
                      <span className="text-muted">
                        {" "}
                        (receitas <MoneyValue cents={a.financials.revenueCents} className="font-normal" /> − custos{" "}
                        <MoneyValue cents={a.financials.costCents} className="font-normal" />)
                      </span>
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
