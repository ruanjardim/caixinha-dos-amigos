import Link from "next/link";
import { CheckCircle2, Circle, Lock, Scale, Wallet } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { SummaryCard } from "@/components/finance/contributions";
import { CycleStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { MoneyLegend, MoneyValue } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate, todayInBrazil } from "@/domain/dates";
import { POLICY_VERSION } from "@/domain/distribution";
import { formatBRL } from "@/domain/money";
import { formatPercentBps } from "@/domain/rules";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import {
  approveResultsAction,
  calculateResultsAction,
  closeCycleAction,
  registerAdminFeeAction,
  registerDistributionAction,
} from "@/modules/results/actions";
import { getResultsOverview } from "@/modules/results/queries";

export const metadata = { title: "Resultados" };

export default async function ResultsPage({ searchParams }: PageProps<"/admin/resultados">) {
  await requirePagePermission("results.calculate");
  const params = await searchParams;
  const cycles = await db.cycle.findMany({
    where: { status: { in: ["OPEN", "CONTRIBUTIONS_CLOSED", "SETTLING", "CLOSED"] } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, status: true },
  });
  const requested = typeof params.ciclo === "string" ? params.ciclo : undefined;
  const cycleId =
    cycles.find((c) => c.id === requested)?.id ??
    cycles.find((c) => c.status === "CONTRIBUTIONS_CLOSED" || c.status === "SETTLING")?.id ??
    cycles[0]?.id;
  const r = cycleId ? await getResultsOverview(cycleId) : null;
  const today = todayInBrazil();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apuração e distribuição"
        description="Saldo diário proporcional, remuneração administrativa, pagamentos e encerramento do ciclo."
      />

      {cycles.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto" aria-label="Ciclo">
          {cycles.map((c) => (
            <Link
              key={c.id}
              href={`/admin/resultados?ciclo=${c.id}`}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap",
                c.id === cycleId ? "bg-brand-600 text-white" : "border-line border bg-white",
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      {!r ? (
        <Card>
          <EmptyState icon={<Scale className="size-7" />} title="Nenhum ciclo aberto ainda" />
        </Card>
      ) : (
        <Content r={r} today={today} />
      )}
    </div>
  );
}

type Overview = NonNullable<Awaited<ReturnType<typeof getResultsOverview>>>;

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="text-status-good mt-0.5 size-4 shrink-0" aria-label="Feito" />
      ) : (
        <Circle className="text-muted mt-0.5 size-4 shrink-0" aria-label="Pendente" />
      )}
      <span className={done ? "" : "text-ink-soft"}>{children}</span>
    </li>
  );
}

function Content({ r, today }: { r: Overview; today: string }) {
  const { cycle, calc } = r;
  const status = cycle.status;
  const approved = calc?.status === "APPROVED";
  const shares = calc?.shares ?? [];
  const paid = shares.filter((s) => s.distribution).length;
  const reconciled = r.lastReconciliation?.differenceCents === 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{cycle.name}</CardTitle>
          <CycleStatusBadge status={status} />
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 sm:grid-cols-2">
            <Step done={status !== "OPEN"}>
              Contribuições encerradas{" "}
              {status === "OPEN" && (
                <>
                  — após {formatDateBR(toISODate(cycle.contributionEndDate))}, na{" "}
                  <Link href={`/admin/ciclos/${cycle.id}`} className="text-brand-700 font-semibold underline">
                    tela do ciclo
                  </Link>
                </>
              )}
            </Step>
            <Step done={r.pendingPayments === 0}>
              Nenhum pagamento em análise{" "}
              {r.pendingPayments > 0 && (
                <Link href="/admin/pagamentos?status=UNDER_REVIEW" className="text-brand-700 font-semibold underline">
                  ({r.pendingPayments} a conferir)
                </Link>
              )}
            </Step>
            <Step done={r.leaversWithPrincipal.length === 0}>
              Principal devolvido a quem saiu
              {r.leaversWithPrincipal.length > 0 &&
                ` (${r.leaversWithPrincipal.map((l) => l.participant.fullName).join(", ")})`}
            </Step>
            <Step done={reconciled}>
              Caixa conciliado com o extrato{" "}
              <Link
                href={`/admin/livro-caixa?ciclo=${cycle.id}#conciliacao`}
                className="text-brand-700 font-semibold underline"
              >
                {r.lastReconciliation
                  ? `(última: ${formatDateBR(toISODate(r.lastReconciliation.referenceDate))}${reconciled ? "" : ", com diferença"})`
                  : "(conciliar)"}
              </Link>
            </Step>
            <Step done={approved}>Apuração calculada e aprovada</Step>
            <Step done={approved && paid === shares.length && shares.length > 0}>
              Pagamentos registrados {approved && `(${paid} de ${shares.length})`}
            </Step>
            <Step done={status === "CLOSED"}>Ciclo encerrado</Step>
          </ol>
        </CardContent>
      </Card>

      {status === "CONTRIBUTIONS_CLOSED" && (
        <Card>
          <CardContent className="space-y-3">
            <p className="font-semibold">{calc ? "Recalcular apuração" : "Calcular apuração"}</p>
            <p className="text-muted text-sm">
              O cálculo usa o livro-caixa atual e as regras congeladas do ciclo (política {POLICY_VERSION}). Ele fica em
              rascunho até ser aprovado; recalcular substitui o rascunho anterior.
            </p>
            {!reconciled && (
              <Alert tone="warning">Recomendado: conciliar o caixa com o extrato antes de calcular.</Alert>
            )}
            <ActionForm
              action={calculateResultsAction}
              submitLabel={calc ? "Recalcular" : "Calcular apuração"}
              submitVariant={calc ? "secondary" : "primary"}
            >
              <input type="hidden" name="cycleId" value={cycle.id} />
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {calc && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Receitas adicionais" cents={calc.revenueCents} />
            <Figure label="Despesas + tributos" cents={calc.expenseCents + calc.taxCents} />
            <Figure
              label="Resultado líquido"
              cents={calc.netResultCents}
              kind={approved ? "calculated" : "projection"}
              strong
            />
            <Figure
              label={`Remuneração adm. (${r.rules ? formatPercentBps(r.rules.adminFeeBps) : "—"})`}
              cents={calc.adminFeeCents}
              kind={approved ? "calculated" : "projection"}
            />
          </div>
          <MoneyLegend />

          {!approved && (
            <Alert tone="warning" title="Rascunho — ainda não aprovado">
              Confira a tabela. Ao aprovar, a apuração fica imutável (código {calc.contentHash.slice(0, 16)}…) e o ciclo
              passa para a distribuição.
            </Alert>
          )}
          {calc.netResultCents < 0 && (
            <Alert tone="info">
              Resultado negativo: sem remuneração administrativa; o prejuízo é rateado pelo principal de cada
              participante (regra 6.1).
            </Alert>
          )}

          <SummaryCard title="Participação de cada um">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-muted border-line border-b text-left text-xs">
                    <th className="px-4 py-2.5 font-semibold">Participante</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Principal</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Peso (R$·dia)</th>
                    <th className="px-3 py-2.5 text-right font-semibold">%</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Resultado</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Total a receber</th>
                    <th className="px-4 py-2.5 font-semibold">Pagamento</th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {shares.map((s) => {
                    const pct =
                      r.totalWeight > 0n ? Math.round((Number(s.weight) * 10_000) / Number(r.totalWeight)) / 100 : 0;
                    return (
                      <tr key={s.id} className="align-top">
                        <td className="px-4 py-3 font-semibold">
                          {s.membership.participant.fullName}
                          {s.membership.status === "LEFT" && <span className="text-muted font-normal"> (saiu)</span>}
                        </td>
                        <td className="tabular px-3 py-3 text-right">{formatBRL(s.principalCents)}</td>
                        <td className="tabular px-3 py-3 text-right">{(s.weight / 100n).toLocaleString("pt-BR")}</td>
                        <td className="tabular px-3 py-3 text-right">
                          {pct.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <MoneyValue cents={s.shareCents} kind={approved ? "calculated" : "projection"} />
                        </td>
                        <td className="tabular px-3 py-3 text-right font-bold">
                          {formatBRL(s.principalCents + s.shareCents)}
                        </td>
                        <td className="px-4 py-3">
                          {s.distribution ? (
                            <Badge tone="green">Pago em {formatDateBR(toISODate(s.distribution.paidOn))}</Badge>
                          ) : approved && status === "SETTLING" ? (
                            <ActionForm
                              action={registerDistributionAction}
                              submitLabel="Registrar"
                              submitVariant="secondary"
                              className="flex flex-wrap items-end gap-2 space-y-0 [&_button]:h-9 [&_button]:text-sm"
                              confirm={`Registrar pagamento de ${formatBRL(s.principalCents + s.shareCents)} a ${s.membership.participant.fullName}?`}
                            >
                              <input type="hidden" name="shareId" value={s.id} />
                              <input
                                type="date"
                                name="paidOn"
                                defaultValue={today}
                                max={today}
                                aria-label="Data do pagamento"
                                className="border-line h-9 rounded-lg border px-2 text-sm"
                              />
                              <input
                                name="transactionRef"
                                placeholder="Ref. (opcional)"
                                aria-label="Referência"
                                className="border-line h-9 w-32 rounded-lg border px-2 text-sm"
                              />
                            </ActionForm>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-muted border-line border-t px-5 py-3 text-xs">
              Peso = Σ valor recebido × dias até {formatDateBR(toISODate(calc.cutoffDate))}. Pagamentos antes do ciclo
              contam a partir do início; estornos e devoluções deixam de contar na sua data. Arredondamento pelo maior
              resto.
            </p>
          </SummaryCard>

          {!approved && status === "CONTRIBUTIONS_CLOSED" && (
            <Card>
              <CardContent className="space-y-3">
                <p className="flex items-center gap-2 font-semibold">
                  <Lock className="size-4" aria-hidden /> Aprovar apuração
                </p>
                <p className="text-muted text-sm">
                  Depois de aprovada, a apuração não pode mais ser alterada e os pagamentos ao grupo ficam liberados.
                </p>
                <ActionForm
                  action={approveResultsAction}
                  submitLabel="Aprovar apuração"
                  confirm="Aprovar a apuração? Ela ficará imutável e o ciclo passará para a distribuição."
                >
                  <input type="hidden" name="calculationId" value={calc.id} />
                </ActionForm>
              </CardContent>
            </Card>
          )}

          {approved && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Remuneração administrativa</CardTitle>
                  <Wallet className="text-muted size-4" aria-hidden />
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>
                    Apurada: <MoneyValue cents={calc.adminFeeCents} kind="calculated" />
                  </p>
                  {r.adminFeePaidOn ? (
                    <Badge tone="green">Paga em {formatDateBR(toISODate(r.adminFeePaidOn))}</Badge>
                  ) : calc.adminFeeCents === 0 ? (
                    <p className="text-muted">Não há remuneração neste ciclo.</p>
                  ) : !r.adminPayoutEnabled ? (
                    <Alert tone="warning" title="Pagamento bloqueado">
                      Depende de validação jurídica e tributária (recurso desligado). O valor fica retido no caixa.
                    </Alert>
                  ) : (
                    <ActionForm
                      action={registerAdminFeeAction}
                      submitLabel="Registrar pagamento"
                      confirm="Registrar o pagamento da remuneração?"
                    >
                      <input type="hidden" name="calculationId" value={calc.id} />
                      <Field label="Data" name="paidOn" type="date" defaultValue={today} max={today} required />
                      <Field label="Referência" name="transactionRef" />
                    </ActionForm>
                  )}
                </CardContent>
              </Card>

              {status === "SETTLING" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Encerrar ciclo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-muted">
                      Possível quando todos os pagamentos estiverem registrados ({paid} de {shares.length}). Depois de
                      encerrado, correções só pelo procedimento pós-encerramento, com justificativa.
                    </p>
                    <ActionForm
                      action={closeCycleAction}
                      submitLabel="Encerrar ciclo"
                      submitVariant={paid === shares.length ? "primary" : "secondary"}
                      confirm="Encerrar o ciclo? Os lançamentos ficarão travados."
                    >
                      <input type="hidden" name="cycleId" value={cycle.id} />
                    </ActionForm>
                  </CardContent>
                </Card>
              )}
              {status === "CLOSED" && cycle.closedAt && (
                <Alert tone="success" title="Ciclo encerrado">
                  Em {formatDateTime(cycle.closedAt)}. Saldo remanescente em caixa: {formatBRL(r.overview.cashCents)}.
                </Alert>
              )}
            </div>
          )}

          <p className="text-muted text-xs break-all">
            Código de integridade da apuração: {calc.contentHash}
            {calc.approvedAt ? ` · aprovada em ${formatDateTime(calc.approvedAt)}` : ""}
          </p>
        </>
      )}

      <Link
        href={`/admin/relatorios?ciclo=${cycle.id}`}
        className="text-brand-700 text-sm font-semibold hover:underline"
      >
        Relatórios deste ciclo (PDF e Excel) →
      </Link>
    </>
  );
}

function Figure({
  label,
  cents,
  kind = "neutral",
  strong,
}: {
  label: string;
  cents: number;
  kind?: "neutral" | "calculated" | "projection";
  strong?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-muted text-xs font-semibold">{label}</p>
      <MoneyValue cents={cents} kind={kind} className={cn("mt-1 block", strong ? "text-2xl" : "text-lg")} />
    </Card>
  );
}
