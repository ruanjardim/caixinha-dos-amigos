import { renderToBuffer } from "@react-pdf/renderer";
import { PAYMENT_METHOD_LABEL } from "@/components/finance/status-badges";
import { formatDateBR, todayInBrazil } from "@/domain/dates";
import { brlToWords } from "@/domain/extenso";
import { formatBRL } from "@/domain/money";
import { formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/modules/auth/session";
import { checkReceiptAccess } from "@/modules/receipts/policy";
import { ReceiptDocument } from "@/modules/receipts/receipt-document";
import { loadReceiptPayment, receiptCode, receiptNumber } from "@/modules/receipts/service";

export const runtime = "nodejs";

/** Recibo em PDF de um pagamento CONFIRMADO — administrador ou o próprio participante. */
export async function GET(_request: Request, { params }: RouteContext<"/api/recibos/[id]">) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return new Response("Não autorizado", { status: 401 });

  const { id } = await params;
  const p = await loadReceiptPayment(id);
  const access = checkReceiptAccess(user, p);
  if (!access.allowed || !p) {
    return !access.allowed && access.reason === "NOT_CONFIRMED"
      ? new Response("Recibo disponível somente para pagamentos confirmados.", { status: 409 })
      : new Response("Recibo não encontrado", { status: 404 });
  }
  if (!p.receivedAt || !p.confirmedAt) return new Response("Recibo não encontrado", { status: 404 });

  const number = receiptNumber({ id: p.id, confirmedAt: p.confirmedAt });
  const pdf = await renderToBuffer(
    <ReceiptDocument
      r={{
        number,
        code: receiptCode({
          id: p.id,
          amountCents: p.amountCents,
          receivedAt: p.receivedAt,
          confirmedAt: p.confirmedAt,
        }),
        participantName: p.participantName,
        cycleName: p.cycleName,
        amount: formatBRL(p.amountCents),
        amountInWords: brlToWords(p.amountCents),
        receivedAt: formatDateBR(p.receivedAt),
        method: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
        transactionRef: p.transactionRef,
        confirmedBy: p.confirmedByName ?? "administração",
        confirmedAt: formatDateTime(p.confirmedAt),
        issuedAt: formatDateBR(todayInBrazil()),
      }}
    />,
  );

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recibo-${number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
