import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura dos webhooks: HMAC-SHA256 de "<timestamp>.<corpo bruto>" com o segredo compartilhado.
 * O carimbo de tempo limita a reutilização de uma mensagem capturada (janela de 5 minutos);
 * o id do evento garante que cada evento seja processado uma única vez.
 */
export const SIGNATURE_HEADER = "x-caixinha-signature";
export const TIMESTAMP_HEADER = "x-caixinha-timestamp";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

export function verifyWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  now: Date;
}): SignatureCheck {
  if (!input.signature || !input.timestamp) return { ok: false, reason: "Assinatura ausente." };
  if (!/^\d{1,12}$/.test(input.timestamp)) return { ok: false, reason: "Carimbo de tempo inválido." };
  const ts = Number(input.timestamp);
  if (Math.abs(input.now.getTime() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Assinatura fora da janela de tempo permitida." };
  }
  const expected = Buffer.from(signWebhook(input.secret, ts, input.rawBody));
  const given = Buffer.from(input.signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "Assinatura não confere." };
  }
  return { ok: true };
}
