import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import { PAYMENT_METHOD_LABEL, PaymentStatusBadge } from "@/components/finance/status-badges";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { MoneyValue } from "@/components/ui/money-value";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate } from "@/domain/dates";
import { db } from "@/lib/db";
import { cn } from "@/lib/cn";
import { requirePagePermission } from "@/modules/auth/session";
import { listPayments } from "@/modules/payments/service";

export const metadata = { title: "Pagamentos" };

const TABS = [
  { value: "UNDER_REVIEW", label: "Em análise" },
  { value: "CONFIRMED", label: "Confirmados" },
  { value: "REVERSED", label: "Estornados" },
  { value: "CANCELLED", label: "Recusados" },
  { value: "all", label: "Todos" },
];

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/pagamentos">) {
  const user = await requirePagePermission("payments.register");
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "UNDER_REVIEW";
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const [payments, underReview] = await Promise.all([
    listPayments({ status: status === "all" ? undefined : status, q, caixinhaId: user.caixinhaId }),
    db.payment.count({
      where: { status: "UNDER_REVIEW", membership: { cycle: { caixinhaId: user.caixinhaId } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagamentos"
        description="Nenhum pagamento é confirmado automaticamente: cada um passa pela conferência da administração."
        actions={
          <LinkButton href="/admin/pagamentos/novo">
            <Plus className="size-4" aria-hidden /> Registrar pagamento
          </LinkButton>
        }
      />

      <nav className="flex gap-1 overflow-x-auto" aria-label="Filtrar por situação">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/pagamentos?status=${t.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-current={status === t.value ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap",
              status === t.value
                ? "bg-brand-600 text-white"
                : "border-line bg-surface text-ink-soft hover:bg-canvas border",
            )}
          >
            {t.label}
            {t.value === "UNDER_REVIEW" && underReview > 0 && (
              <span className="ml-1.5 rounded-full bg-white/25 px-1.5 text-xs">{underReview}</span>
            )}
          </Link>
        ))}
      </nav>

      <form role="search" className="flex gap-2">
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por participante ou referência"
          aria-label="Buscar pagamentos"
          className="border-line bg-surface focus:border-brand-500 focus:ring-brand-100 h-11 flex-1 rounded-xl border px-3.5 focus:ring-4 focus:outline-none"
        />
        <button type="submit" className="bg-ink h-11 rounded-xl px-4 font-semibold text-white">
          Buscar
        </button>
      </form>

      <Card className="overflow-hidden">
        {payments.length === 0 ? (
          <EmptyState icon={<HandCoins className="size-7" />} title="Nenhum pagamento aqui">
            {status === "UNDER_REVIEW" ? "Não há pagamentos aguardando conferência." : "Ajuste o filtro ou a busca."}
          </EmptyState>
        ) : (
          <ul className="divide-line divide-y">
            {payments.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/pagamentos/${p.id}`}
                  className="hover:bg-canvas grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.membership.participant.fullName}</p>
                    <p className="text-muted truncate text-xs">{p.membership.cycle.name}</p>
                  </div>
                  <p className="text-muted hidden truncate text-sm sm:block">
                    {PAYMENT_METHOD_LABEL[p.method]} · {p.receivedAt ? formatDateBR(toISODate(p.receivedAt)) : "—"}
                    {p.transactionRef ? ` · ${p.transactionRef}` : ""}
                  </p>
                  <MoneyValue
                    cents={p.amountCents}
                    kind={p.status === "CONFIRMED" ? "received" : "neutral"}
                    className="text-right"
                  />
                  <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                    <PaymentStatusBadge status={p.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
