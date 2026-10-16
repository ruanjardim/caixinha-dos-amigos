import "server-only";
import { createHmac } from "node:crypto";
import { toISODate } from "@/domain/dates";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Código de verificação do recibo: HMAC dos dados essenciais com o segredo do
 * servidor. Qualquer alteração no valor, data ou confirmação muda o código, e
 * ninguém sem o segredo consegue gerar um código válido.
 */
export function receiptCode(p: { id: string; amountCents: number; receivedAt: string; confirmedAt: Date }): string {
  const digest = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`recibo|${p.id}|${p.amountCents}|${p.receivedAt}|${p.confirmedAt.toISOString()}`)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
  return digest.match(/.{4}/g)!.join("-");
}

export function receiptNumber(p: { id: string; confirmedAt: Date }): string {
  return `${p.confirmedAt.getUTCFullYear()}-${p.id.slice(-8).toUpperCase()}`;
}

export async function loadReceiptPayment(paymentId: string) {
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      membership: {
        include: {
          participant: { select: { id: true, fullName: true } },
          cycle: { select: { name: true, caixinhaId: true } },
        },
      },
      confirmedBy: { select: { name: true } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    status: p.status,
    participantId: p.membership.participant.id,
    participantName: p.membership.participant.fullName,
    cycleName: p.membership.cycle.name,
    caixinhaId: p.membership.cycle.caixinhaId,
    amountCents: p.amountCents,
    receivedAt: p.receivedAt ? toISODate(p.receivedAt) : null,
    method: p.method,
    transactionRef: p.transactionRef,
    confirmedAt: p.confirmedAt,
    confirmedByName: p.confirmedBy?.name ?? null,
  };
}

export type ReceiptPayment = NonNullable<Awaited<ReturnType<typeof loadReceiptPayment>>>;
