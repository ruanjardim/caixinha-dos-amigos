import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateBR, toISODate, todayInBrazil } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/session";
import { reverseEntryAction } from "@/modules/ledger/actions";
import { CATEGORY_LABEL } from "@/components/finance/ledger-labels";

export const metadata = { title: "Lançamento" };

const ACCOUNT_LABEL: Record<string, string> = {
  CASH: "Caixa",
  PARTICIPANT_PRINCIPAL: "Principal dos participantes",
  ADDITIONAL_REVENUE: "Receitas adicionais",
  EXPENSE: "Despesas",
  TAX: "Tributos e deduções",
  ADMIN_FEE: "Remuneração administrativa",
  RESULT_TO_DISTRIBUTE: "Resultado a distribuir",
};

export default async function LedgerEntryPage({ params }: PageProps<"/admin/livro-caixa/[id]">) {
  const user = await requirePagePermission("ledger.read");
  const { id } = await params;
  const e = await db.ledgerTransaction.findFirst({
    where: { id, ...(user.caixinhaId ? { cycle: { caixinhaId: user.caixinhaId } } : {}) },
    include: {
      lines: true,
      createdBy: { select: { name: true } },
      reverses: { select: { id: true, description: true } },
      reversedBy: { select: { id: true, description: true } },
      cycle: { select: { id: true, name: true, status: true } },
    },
  });
  if (!e) notFound();

  const canReverse = !e.paymentId && !e.reversesId && !e.reversedBy && e.cycle.status !== "CLOSED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={e.description}
        eyebrow={CATEGORY_LABEL[e.category] ?? e.category}
        back={{ href: `/admin/livro-caixa?ciclo=${e.cycle.id}`, label: "Livro-caixa" }}
        description={`${formatDateBR(toISODate(e.occurredOn))} · lançado por ${e.createdBy.name} em ${formatDateTime(e.createdAt)}`}
      />

      {e.reverses && (
        <Alert tone="info">
          Este lançamento estorna{" "}
          <Link href={`/admin/livro-caixa/${e.reverses.id}`} className="font-semibold underline">
            {e.reverses.description}
          </Link>
          .
        </Alert>
      )}
      {e.reversedBy && (
        <Alert tone="warning">
          Estornado por{" "}
          <Link href={`/admin/livro-caixa/${e.reversedBy.id}`} className="font-semibold underline">
            {e.reversedBy.description}
          </Link>
          .
        </Alert>
      )}
      {e.paymentId && (
        <Alert tone="info">
          Lançamento automático de um{" "}
          <Link href={`/admin/pagamentos/${e.paymentId}`} className="font-semibold underline">
            pagamento confirmado
          </Link>
          . Para corrigir, estorne o pagamento.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Partidas (débito + / crédito −)</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          <table className="w-full text-sm">
            <tbody className="divide-line divide-y">
              {e.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-2.5">{ACCOUNT_LABEL[l.account] ?? l.account}</td>
                  <td className="tabular px-5 py-2.5 text-right font-semibold">
                    {l.amountCents > 0 ? "+" : "−"}
                    {formatBRL(Math.abs(l.amountCents))}
                  </td>
                </tr>
              ))}
              <tr className="bg-canvas">
                <td className="px-5 py-2.5 font-semibold">Soma (sempre zero)</td>
                <td className="tabular px-5 py-2.5 text-right font-semibold">
                  {formatBRL(e.lines.reduce((s, l) => s + l.amountCents, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canReverse && (
        <Card>
          <CardHeader>
            <CardTitle>Estornar lançamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={reverseEntryAction}
              submitLabel="Estornar"
              submitVariant="danger"
              confirm="Estornar este lançamento? O original será mantido e um lançamento inverso será criado."
            >
              <input type="hidden" name="transactionId" value={e.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Data do estorno"
                  name="occurredOn"
                  type="date"
                  max={todayInBrazil()}
                  defaultValue={todayInBrazil()}
                  required
                />
                <Field label="Motivo" name="reason" required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
