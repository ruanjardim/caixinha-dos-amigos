import Link from "next/link";
import { BookOpenCheck, Landmark, MinusCircle, PiggyBank, PlusCircle, Receipt, Scale } from "lucide-react";
import { ActionForm } from "@/components/forms/action-form";
import { SummaryCard } from "@/components/finance/contributions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, MoneyField, SelectField } from "@/components/ui/field";
import { MoneyValue } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateBR, toISODate, todayInBrazil } from "@/domain/dates";
import { cashEffect, type LedgerAccount } from "@/domain/ledger";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { requirePagePermission } from "@/modules/auth/session";
import { CATEGORY_LABEL } from "@/components/finance/ledger-labels";
import { manualEntryAction } from "@/modules/ledger/actions";
import { postClosingAdjustmentAction, reconcileCashAction } from "@/modules/results/actions";
import { TextareaField } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import { formatBRL } from "@/domain/money";
import { getLedgerOverview, listEntries } from "@/modules/ledger/service";

export const metadata = { title: "Livro-caixa" };

export default async function LedgerPage({ searchParams }: PageProps<"/admin/livro-caixa">) {
  await requirePagePermission("ledger.read");
  const params = await searchParams;
  const cycles = await db.cycle.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, status: true },
  });
  const cycleId = typeof params.ciclo === "string" ? params.ciclo : cycles[0]?.id;
  const cycle = cycles.find((c) => c.id === cycleId);

  if (!cycle) {
    return (
      <div className="space-y-6">
        <PageHeader title="Livro-caixa" />
        <Card>
          <EmptyState icon={<BookOpenCheck className="size-7" />} title="Nenhum ciclo aberto">
            O livro-caixa começa quando o primeiro ciclo é aberto.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const [overview, entries, reconciliations] = await Promise.all([
    getLedgerOverview(cycle.id),
    listEntries(cycle.id),
    db.cashReconciliation.findMany({
      where: { cycleId: cycle.id },
      orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
  ]);
  // Lançamentos manuais: só com o ciclo aberto ou aguardando apuração.
  const acceptsEntries = cycle.status === "OPEN" || cycle.status === "CONTRIBUTIONS_CLOSED";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Livro-caixa"
        description="Toda movimentação tem data, valor, categoria, descrição e responsável. Nada é apagado: correções são feitas por estorno."
      />

      {cycles.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto" aria-label="Ciclo">
          {cycles.map((c) => (
            <Link
              key={c.id}
              href={`/admin/livro-caixa?ciclo=${c.id}`}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap",
                c.id === cycle.id ? "bg-brand-600 text-white" : "border-line border bg-white",
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Saldos">
        <StatCard
          label="Saldo em caixa"
          icon={Landmark}
          cents={overview.cashCents}
          kind="received"
          hint="Contábil — conciliar com o extrato"
        />
        <StatCard
          label="Contribuições (principal)"
          icon={PiggyBank}
          cents={overview.principalOwedCents}
          hint="Pertence aos participantes"
        />
        <StatCard label="Receitas adicionais" icon={PlusCircle} cents={overview.revenueCents} />
        <StatCard label="Despesas" icon={MinusCircle} cents={overview.expenseCents} />
        <StatCard label="Tributos e deduções" icon={Receipt} cents={overview.taxCents} />
        <StatCard
          label="Resultado parcial"
          icon={Scale}
          cents={overview.partialResultCents}
          kind="projection"
          hint="Ainda NÃO apurado — pode mudar"
        />
      </section>

      {acceptsEntries && (
        <Card>
          <CardHeader>
            <CardTitle>Novo lançamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={manualEntryAction} submitLabel="Lançar" resetOnSuccess>
              <input type="hidden" name="cycleId" value={cycle.id} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  label="Tipo"
                  name="kind"
                  options={[
                    { value: "REVENUE", label: "Receita adicional" },
                    { value: "EXPENSE", label: "Despesa" },
                    { value: "TAX", label: "Tributo/dedução" },
                  ]}
                />
                <MoneyField label="Valor (R$)" name="amountCents" required />
                <Field
                  label="Data"
                  name="occurredOn"
                  type="date"
                  max={todayInBrazil()}
                  defaultValue={todayInBrazil()}
                  required
                />
                <Field
                  label="Descrição"
                  name="description"
                  required
                  placeholder="Ex.: tarifa bancária"
                  hint="Visível na prestação de contas: não inclua dados pessoais."
                />
              </div>
              <p className="text-muted text-xs">
                Contribuições entram automaticamente quando um pagamento é confirmado. Despesas não podem exceder o
                saldo em caixa.
              </p>
            </ActionForm>
          </CardContent>
        </Card>
      )}
      {cycle.status === "SETTLING" && (
        <Alert tone="info">Apuração aprovada: os únicos lançamentos agora são os pagamentos da distribuição.</Alert>
      )}
      {cycle.status === "CLOSED" && (
        <Card>
          <CardHeader>
            <CardTitle>Correção pós-encerramento</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={postClosingAdjustmentAction}
              submitLabel="Registrar correção"
              confirm="Registrar uma correção em ciclo encerrado? Ela ficará marcada e auditada."
              resetOnSuccess
            >
              <input type="hidden" name="cycleId" value={cycle.id} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  label="Tipo"
                  name="kind"
                  options={[
                    { value: "EXPENSE", label: "Despesa" },
                    { value: "REVENUE", label: "Receita" },
                  ]}
                />
                <MoneyField label="Valor (R$)" name="amountCents" required />
                <Field
                  label="Data"
                  name="occurredOn"
                  type="date"
                  max={todayInBrazil()}
                  defaultValue={todayInBrazil()}
                  required
                />
                <Field label="Descrição" name="description" required />
              </div>
              <TextareaField
                label="Justificativa (obrigatória)"
                name="justification"
                rows={2}
                hint="Por que a correção é necessária depois do encerramento. Não altera a apuração aprovada."
              />
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card id="conciliacao">
        <CardHeader>
          <CardTitle>Conciliação com o extrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionForm action={reconcileCashAction} submitLabel="Conciliar" resetOnSuccess>
            <input type="hidden" name="cycleId" value={cycle.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Data do extrato"
                name="referenceDate"
                type="date"
                max={todayInBrazil()}
                defaultValue={todayInBrazil()}
                required
              />
              <MoneyField label="Saldo no extrato (R$)" name="statementBalanceCents" required />
              <Field label="Observação" name="notes" />
            </div>
            <p className="text-muted text-xs">
              O sistema compara com o saldo do livro-caixa na mesma data. Diferenças devem ser investigadas antes da
              apuração.
            </p>
          </ActionForm>
          {reconciliations.length > 0 && (
            <ul className="divide-line border-line divide-y rounded-xl border text-sm">
              {reconciliations.map((rec) => (
                <li key={rec.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                  <span>
                    <strong>{formatDateBR(toISODate(rec.referenceDate))}</strong>
                    <span className="text-muted">
                      {" "}
                      · extrato {formatBRL(rec.statementBalanceCents)} · livro {formatBRL(rec.bookBalanceCents)} ·
                      registrado em {formatDateTime(rec.createdAt)}
                    </span>
                  </span>
                  {rec.differenceCents === 0 ? (
                    <Badge tone="green">Conciliado</Badge>
                  ) : (
                    <Badge tone="red">Diferença {formatBRL(rec.differenceCents)}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SummaryCard title="Lançamentos">
        {entries.length === 0 ? (
          <p className="text-muted p-5 text-sm">Nenhum lançamento ainda.</p>
        ) : (
          <ul className="divide-line divide-y">
            {entries.map((e) => {
              const effect = cashEffect(
                e.lines.map((l) => ({ account: l.account as LedgerAccount, amountCents: l.amountCents })),
              );
              return (
                <li key={e.id}>
                  <Link
                    href={`/admin/livro-caixa/${e.id}`}
                    className="hover:bg-canvas grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{e.description}</p>
                      <p className="text-muted truncate text-xs">
                        {formatDateBR(toISODate(e.occurredOn))} · {CATEGORY_LABEL[e.category] ?? e.category} ·{" "}
                        {e.createdBy.name}
                        {e.reversedBy ? " · " : ""}
                        {e.reversedBy && <Badge tone="gray">estornado</Badge>}
                      </p>
                    </div>
                    <MoneyValue
                      cents={effect}
                      className={cn(effect < 0 ? "text-danger" : effect > 0 ? "text-received" : "text-muted")}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SummaryCard>
    </div>
  );
}
