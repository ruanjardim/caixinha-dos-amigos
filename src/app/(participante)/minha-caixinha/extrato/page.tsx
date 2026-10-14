import { Download, FileText, Receipt } from "lucide-react";
import { SummaryCard } from "@/components/finance/contributions";
import { PAYMENT_METHOD_LABEL, PaymentStatusBadge } from "@/components/finance/status-badges";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { MoneyValue } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { buildStatement } from "@/domain/statement";
import { requirePagePermission } from "@/modules/auth/session";
import { getOwnMemberships } from "@/modules/cycles/queries";

export const metadata = { title: "Extrato" };

export default async function StatementPage() {
  const user = await requirePagePermission("self.statement");
  const memberships = user.participantId ? await getOwnMemberships(user.participantId) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Extrato"
        description="Somente dinheiro efetivamente recebido e conferido. Pagamentos em análise aparecem à parte."
      />

      {memberships.length === 0 && (
        <Card>
          <EmptyState icon={<FileText className="size-7" />} title="Sem movimentações">
            Você ainda não participa de nenhum ciclo.
          </EmptyState>
        </Card>
      )}

      {memberships.map((m) => {
        const statement = buildStatement(
          m.payments.map((p) => ({
            id: p.id,
            amountCents: p.amountCents,
            status: p.status,
            receivedAt: p.receivedAt ? toISODate(p.receivedAt) : null,
            reversedAt: p.reversedAt ? toISODate(p.reversedAt) : null,
            method: p.method,
          })),
        );
        const pending = m.payments.filter((p) => p.status === "UNDER_REVIEW" || p.status === "PENDING");
        const confirmedIds = new Set(m.payments.filter((p) => p.status === "CONFIRMED").map((p) => p.id));
        const balance = statement.at(-1)?.balanceCents ?? 0;

        return (
          <section key={m.id} className="space-y-4" aria-label={m.cycle.name}>
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-lg font-bold">{m.cycle.name}</h2>
              <p className="text-sm">
                <span className="text-muted">Total recebido: </span>
                <MoneyValue cents={balance} kind="received" />
              </p>
            </div>

            <SummaryCard>
              {statement.length === 0 ? (
                <p className="text-muted p-5 text-sm">Nenhum pagamento confirmado ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="text-muted border-line border-b text-left text-xs">
                        <th className="px-4 py-2.5 font-semibold">Data</th>
                        <th className="px-4 py-2.5 font-semibold">Movimento</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Valor</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                        <th className="px-4 py-2.5 font-semibold">
                          <span className="sr-only">Recibo</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-line divide-y">
                      {statement.map((e) => (
                        <tr key={`${e.paymentId}-${e.kind}`}>
                          <td className="tabular px-4 py-2.5">{formatDateBR(e.date)}</td>
                          <td className="px-4 py-2.5">
                            {e.kind === "CONTRIBUTION" ? "Contribuição" : "Estorno de contribuição"}
                            <span className="text-muted"> · {PAYMENT_METHOD_LABEL[e.method] ?? e.method}</span>
                          </td>
                          <td
                            className={`tabular px-4 py-2.5 text-right font-semibold ${e.amountCents < 0 ? "text-danger" : "text-received"}`}
                          >
                            {e.amountCents < 0 ? "−" : "+"}
                            {formatBRL(Math.abs(e.amountCents))}
                          </td>
                          <td className="tabular px-4 py-2.5 text-right">{formatBRL(e.balanceCents)}</td>
                          <td className="px-4 py-2.5 text-right">
                            {e.kind === "CONTRIBUTION" && confirmedIds.has(e.paymentId) && (
                              <a
                                href={`/api/recibos/${e.paymentId}`}
                                className="text-brand-700 inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap hover:underline"
                              >
                                <Download className="size-3.5" aria-hidden /> Recibo
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SummaryCard>

            {pending.length > 0 && (
              <Alert tone="info" title="Em análise (ainda não é dinheiro recebido)">
                <ul className="mt-1 space-y-1">
                  {pending.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <span>
                        {formatBRL(p.amountCents)} · {p.receivedAt ? formatDateBR(toISODate(p.receivedAt)) : "sem data"}
                      </span>
                      <PaymentStatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
          </section>
        );
      })}

      <p className="text-muted flex gap-2 text-xs">
        <Receipt className="size-4 shrink-0" aria-hidden />
        Os recibos comprovam o recebimento da contribuição (principal) e trazem um código de verificação. Não
        representam rendimento ou promessa de resultado.
      </p>
    </div>
  );
}
