import "server-only";
import QRCode from "qrcode";
import type { PixChargeStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ATTENTION_OUTCOMES } from "./outcomes";
import { manualKeyInfo } from "./providers";

/** QR Code (imagem PNG em data URL) do texto copia e cola. Gerado no servidor, sem serviço externo. */
export function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 260 });
}

/** Situação efetiva: cobrança ativa com prazo vencido aparece como expirada mesmo antes da tarefa diária. */
export function effectiveStatus(
  charge: { status: PixChargeStatus; expiresAt: Date | null },
  now: Date,
): PixChargeStatus {
  if ((charge.status === "ACTIVE" || charge.status === "CREATED") && charge.expiresAt && charge.expiresAt < now) {
    return "EXPIRED";
  }
  return charge.status;
}

export function pixMode() {
  const manual = manualKeyInfo();
  return {
    provider: env.PIX_PROVIDER,
    simulation: env.PIX_PROVIDER === "simulated",
    manualConfigured: Boolean(manual),
    manualKey: manual ? { key: manual.key, receiverName: manual.receiverName, city: manual.city } : null,
  };
}

export async function getPixOverview(now: Date = new Date(), caixinhaId?: string | null) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [charges, events] = await Promise.all([
    db.pixCharge.findMany({
      where: caixinhaId ? { membership: { cycle: { caixinhaId } } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        membership: { include: { participant: { select: { fullName: true } }, cycle: { select: { name: true } } } },
        payment: { select: { id: true, status: true } },
      },
    }),
    db.webhookEvent.findMany({
      where: caixinhaId ? { charge: { membership: { cycle: { caixinhaId } } } } : undefined,
      orderBy: { receivedAt: "desc" },
      take: 60,
      include: { charge: { select: { id: true, externalId: true } } },
    }),
  ]);
  const attentionCount = events.filter(
    (e) => e.receivedAt >= since && e.outcome && ATTENTION_OUTCOMES.has(e.outcome),
  ).length;
  const toReview = charges.filter((c) => c.payment && c.payment.status === "UNDER_REVIEW").length;
  return {
    charges: charges.map((c) => ({ ...c, effectiveStatus: effectiveStatus(c, now) })),
    events,
    attentionCount,
    toReview,
  };
}

export async function getChargeDetail(id: string, now: Date = new Date(), caixinhaId?: string | null) {
  const charge = await db.pixCharge.findFirst({
    where: { id, ...(caixinhaId ? { membership: { cycle: { caixinhaId } } } : {}) },
    include: {
      membership: {
        include: { participant: { select: { id: true, fullName: true } }, cycle: { select: { name: true } } },
      },
      payment: { select: { id: true, status: true, amountCents: true, receivedAt: true } },
      events: { orderBy: { receivedAt: "desc" } },
    },
  });
  if (!charge) return null;
  return { ...charge, effectiveStatus: effectiveStatus(charge, now) };
}

/** Cobranças em aberto do PRÓPRIO participante (nunca de outros). */
export async function openChargesForParticipant(participantId: string, now: Date = new Date()) {
  const charges = await db.pixCharge.findMany({
    where: {
      membership: { participantId },
      status: { in: ["CREATED", "ACTIVE"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { membership: { include: { cycle: { select: { name: true } } } } },
  });
  return Promise.all(charges.map(async (c) => ({ ...c, qr: c.copyPaste ? await qrDataUrl(c.copyPaste) : null })));
}
