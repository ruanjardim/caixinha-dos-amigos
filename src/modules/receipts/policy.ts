/**
 * Quem pode baixar o recibo de um pagamento (regra pura, testável).
 * Recibo só existe para pagamento CONFIRMADO (estornado não tem recibo válido).
 */
import { canViewParticipant, type Actor } from "@/modules/auth/permissions";

export type ReceiptCheck = { allowed: true } | { allowed: false; reason: "NOT_FOUND" | "NOT_CONFIRMED" };

export function checkReceiptAccess(
  actor: Actor | null,
  payment: { status: string; participantId: string } | null,
): ReceiptCheck {
  // Sem permissão ou inexistente: mesma resposta (não revela a existência).
  if (!payment || !canViewParticipant(actor, payment.participantId)) return { allowed: false, reason: "NOT_FOUND" };
  if (payment.status !== "CONFIRMED") return { allowed: false, reason: "NOT_CONFIRMED" };
  return { allowed: true };
}
