import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { todayInBrazil, fromISODate } from "@/domain/dates";
import { formatBRL, type Cents } from "@/domain/money";
import type { Prisma } from "@/generated/prisma/client";
import { db, type DbTransaction } from "@/lib/db";
import { env } from "@/lib/env";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { ATTENTION_OUTCOMES, type WebhookOutcome } from "./outcomes";
import { getPixProvider, simulatedProvider, type PixProvider } from "./providers";
import {
  expiredEventSchema,
  paidEventSchema,
  refundedEventSchema,
  webhookEventBaseSchema,
  type SimulationKind,
} from "./schemas";
import { SIGNATURE_HEADER, signWebhook, TIMESTAMP_HEADER, verifyWebhookSignature } from "./signature";

const PAYABLE_CYCLE_STATUS = ["OPEN", "CONTRIBUTIONS_CLOSED"];
export const MAX_WEBHOOK_BYTES = 64 * 1024;
const DAY_MS = 86_400_000;

/** Identificador da cobrança (txid): 25 caracteres alfanuméricos, imprevisível. */
export function generateTxid(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 símbolos: sem viés no sorteio
  const bytes = randomBytes(23);
  let id = "CX";
  for (const b of bytes) id += alphabet[b % 32];
  return id;
}

// ---------------------------------------------------------------------------
// Cobranças
// ---------------------------------------------------------------------------

export async function createCharge(
  actor: CurrentUser,
  input: { membershipId: string; amountCents: Cents; description: string | null; expiresInDays: number },
  provider: PixProvider = getPixProvider(),
  now: Date = new Date(),
) {
  return db.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({
      where: { id: input.membershipId },
      include: { cycle: { select: { status: true, name: true } } },
    });
    if (!membership) throw new DomainError("Participação não encontrada.");
    if (membership.status !== "ACTIVE") throw new DomainError("Esta participação está encerrada.");
    if (!PAYABLE_CYCLE_STATUS.includes(membership.cycle.status)) {
      throw new DomainError("Este ciclo não está recebendo pagamentos.");
    }
    const txid = generateTxid();
    const copyPaste = provider.buildCopyPaste({ txid, amountCents: input.amountCents, description: input.description });
    const charge = await tx.pixCharge.create({
      data: {
        provider: provider.id,
        externalId: txid,
        amountCents: input.amountCents,
        copyPaste,
        qrCodeData: copyPaste,
        status: "ACTIVE",
        expiresAt: new Date(now.getTime() + input.expiresInDays * DAY_MS),
        isSimulation: provider.isSimulation,
        membershipId: membership.id,
        description: input.description,
        createdById: actor.userId,
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "pix.charge.create",
        entityType: "PixCharge",
        entityId: charge.id,
        after: {
          provider: provider.id,
          txid,
          amountCents: input.amountCents,
          membershipId: membership.id,
          simulation: provider.isSimulation,
        },
      },
      tx,
    );
    return charge;
  });
}

export async function cancelCharge(actor: CurrentUser, input: { chargeId: string; reason: string }) {
  await db.$transaction(async (tx) => {
    const changed = await tx.pixCharge.updateMany({
      where: { id: input.chargeId, status: { in: ["CREATED", "ACTIVE"] } },
      data: { status: "CANCELLED" },
    });
    if (changed.count !== 1) throw new DomainError("Somente cobranças ativas podem ser canceladas.");
    await recordAudit(
      {
        actorId: actor.userId,
        action: "pix.charge.cancel",
        entityType: "PixCharge",
        entityId: input.chargeId,
        after: { status: "CANCELLED" },
        reason: input.reason,
      },
      tx,
    );
  });
}

/** Marca como expiradas as cobranças ativas cujo prazo passou (tarefa diária). */
export async function expireCharges(now: Date = new Date()): Promise<number> {
  const result = await db.pixCharge.updateMany({
    where: { status: { in: ["CREATED", "ACTIVE"] }, expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export type WebhookResult = {
  httpStatus: number;
  outcome: WebhookOutcome | "REPETIDO" | "NAO_ENCONTRADO" | "GRANDE_DEMAIS";
  /** Registro gravado em webhook_event (para avisos e conciliação). */
  eventRowId?: string;
  /** Deve avisar a administração (recebimento a conferir ou situação que exige ação). */
  notifyAdmins: boolean;
};

type HandlerResult = { outcome: WebhookOutcome; chargeId: string | null; detail?: string };

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function logRejected(
  provider: string,
  prefix: string,
  payload: Prisma.InputJsonValue,
  outcome: WebhookOutcome,
  error: string,
  signatureValid: boolean,
) {
  const row = await db.webhookEvent.create({
    data: {
      provider,
      externalId: `${prefix}:${randomUUID()}`,
      signatureValid,
      payload,
      processedAt: new Date(),
      outcome,
      error: error.slice(0, 500),
    },
  });
  return row.id;
}

/**
 * Processa um webhook do provedor Pix. Nunca confirma pagamento sozinho:
 * o recebimento vira um pagamento "Em análise" vinculado à cobrança, e a administração
 * confere e confirma (só então o dinheiro entra no livro-caixa).
 *
 * Garantias: assinatura HMAC com janela de tempo; cada evento processado uma única vez
 * (id do evento único por provedor); todo evento — válido ou não — fica registrado.
 */
export async function processWebhook(input: {
  provider: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  now?: Date;
  secret?: string;
}): Promise<WebhookResult> {
  const now = input.now ?? new Date();
  const provider = input.provider === "simulated" ? simulatedProvider : null;
  if (!provider || !provider.receivesWebhooks)
    return { httpStatus: 404, outcome: "NAO_ENCONTRADO", notifyAdmins: false };
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return { httpStatus: 413, outcome: "GRANDE_DEMAIS", notifyAdmins: false };
  }

  const check = verifyWebhookSignature({
    secret: input.secret ?? env.PIX_WEBHOOK_SECRET,
    rawBody: input.rawBody,
    signature: input.signature,
    timestamp: input.timestamp,
    now,
  });
  if (!check.ok) {
    const eventRowId = await logRejected(
      provider.id,
      "rejeitado",
      { amostra: input.rawBody.slice(0, 2000) },
      "ASSINATURA_INVALIDA",
      check.reason,
      false,
    );
    return { httpStatus: 401, outcome: "ASSINATURA_INVALIDA", eventRowId, notifyAdmins: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    parsed = null;
  }
  const base = webhookEventBaseSchema.safeParse(parsed);
  if (!base.success) {
    const eventRowId = await logRejected(
      provider.id,
      "invalido",
      { amostra: input.rawBody.slice(0, 2000) },
      "CONTEUDO_INVALIDO",
      "Evento sem id/tipo válidos.",
      true,
    );
    return { httpStatus: 400, outcome: "CONTEUDO_INVALIDO", eventRowId, notifyAdmins: false };
  }
  const eventId = base.data.id;

  const already = await db.webhookEvent.findUnique({
    where: { provider_externalId: { provider: provider.id, externalId: eventId } },
    select: { id: true },
  });
  if (already) return { httpStatus: 200, outcome: "REPETIDO", eventRowId: already.id, notifyAdmins: false };

  try {
    const { rowId, result } = await db.$transaction(async (tx) => {
      const row = await tx.webhookEvent.create({
        data: {
          provider: provider.id,
          externalId: eventId,
          signatureValid: true,
          payload: asJson(parsed),
          eventType: base.data.type,
        },
      });
      const result = await handleEvent(tx, provider, parsed, now);
      await tx.webhookEvent.update({
        where: { id: row.id },
        data: { processedAt: now, outcome: result.outcome, chargeId: result.chargeId, error: result.detail ?? null },
      });
      return { rowId: row.id, result };
    });
    return {
      httpStatus: result.outcome === "CONTEUDO_INVALIDO" ? 400 : 200,
      outcome: result.outcome,
      eventRowId: rowId,
      notifyAdmins: ATTENTION_OUTCOMES.has(result.outcome) || result.outcome === "PAGO",
    };
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Mesmo evento chegando em paralelo: o outro processamento já cuidou dele.
      return { httpStatus: 200, outcome: "REPETIDO", notifyAdmins: false };
    }
    console.error("[pix-webhook] falha ao processar evento", e);
    const eventRowId = await logRejected(
      provider.id,
      `falha:${eventId.slice(0, 60)}`,
      asJson(parsed),
      "FALHA",
      e instanceof Error ? e.message : "Erro desconhecido.",
      true,
    );
    // 500 → o provedor reenvia; o id original continua livre para o reprocessamento.
    return { httpStatus: 500, outcome: "FALHA", eventRowId, notifyAdmins: true };
  }
}

async function handleEvent(
  tx: DbTransaction,
  provider: PixProvider,
  payload: unknown,
  now: Date,
): Promise<HandlerResult> {
  const type = (payload as { type?: string }).type;
  if (type === "pix.paid") {
    const event = paidEventSchema.safeParse(payload);
    if (!event.success)
      return { outcome: "CONTEUDO_INVALIDO", chargeId: null, detail: "Campos do pagamento inválidos." };
    return handlePaid(tx, provider, event.data, now);
  }
  if (type === "pix.refunded") {
    const event = refundedEventSchema.safeParse(payload);
    if (!event.success)
      return { outcome: "CONTEUDO_INVALIDO", chargeId: null, detail: "Campos da devolução inválidos." };
    return handleRefund(tx, provider, event.data);
  }
  if (type === "pix.expired") {
    const event = expiredEventSchema.safeParse(payload);
    if (!event.success) return { outcome: "CONTEUDO_INVALIDO", chargeId: null, detail: "Campos inválidos." };
    const charge = await findCharge(tx, provider, event.data.txid);
    if (!charge) return { outcome: "COBRANCA_DESCONHECIDA", chargeId: null };
    const changed = await tx.pixCharge.updateMany({
      where: { id: charge.id, status: { in: ["CREATED", "ACTIVE"] } },
      data: { status: "EXPIRED" },
    });
    return { outcome: changed.count === 1 ? "EXPIRADA" : "IGNORADO", chargeId: charge.id };
  }
  return { outcome: "IGNORADO", chargeId: null, detail: `Tipo de evento não tratado: ${String(type).slice(0, 50)}` };
}

function findCharge(tx: DbTransaction, provider: PixProvider, txid: string) {
  return tx.pixCharge.findUnique({
    where: { provider_externalId: { provider: provider.id, externalId: txid } },
    include: {
      membership: { include: { cycle: { select: { id: true, status: true } } } },
      payment: { select: { id: true, status: true, amountCents: true } },
    },
  });
}

async function handlePaid(
  tx: DbTransaction,
  provider: PixProvider,
  event: { id: string; txid: string; amountCents: number; endToEndId: string; paidAt: string },
  now: Date,
): Promise<HandlerResult> {
  const charge = await findCharge(tx, provider, event.txid);
  if (!charge) return { outcome: "COBRANCA_DESCONHECIDA", chargeId: null, detail: `txid ${event.txid.slice(0, 35)}` };

  // Pagamento já registrado para esta cobrança (outro evento, mesmo txid) → dinheiro em dobro.
  const wasClosed = charge.status === "EXPIRED" || charge.status === "CANCELLED";
  const changed = await tx.pixCharge.updateMany({
    where: { id: charge.id, status: { in: ["CREATED", "ACTIVE", "EXPIRED", "CANCELLED"] } },
    data: { status: "PAID", paidAt: new Date(event.paidAt), endToEndId: event.endToEndId },
  });
  if (changed.count !== 1) {
    return {
      outcome: "PAGAMENTO_DUPLICADO",
      chargeId: charge.id,
      detail: `Novo pagamento de ${formatBRL(event.amountCents)} (E2E ${event.endToEndId.slice(0, 40)}).`,
    };
  }

  const membership = charge.membership;
  if (!membership || !PAYABLE_CYCLE_STATUS.includes(membership.cycle.status)) {
    return { outcome: "CICLO_SEM_RECEBIMENTO", chargeId: charge.id };
  }

  const sameRef = await tx.payment.findFirst({
    where: { method: provider.paymentMethod, transactionRef: event.endToEndId },
    select: { id: true },
  });
  if (sameRef) return { outcome: "PAGAMENTO_DUPLICADO", chargeId: charge.id, detail: "E2E já registrado." };

  // Data do crédito no fuso de Brasília; relógio adiantado do provedor nunca gera data futura.
  const today = todayInBrazil(now);
  const paidOn = todayInBrazil(new Date(event.paidAt));
  const receivedAt = paidOn > today ? today : paidOn;
  const mismatch = event.amountCents !== charge.amountCents;
  const notes = [
    `Recebido via Pix${provider.isSimulation ? " (SIMULAÇÃO — sem dinheiro real)" : ""}, cobrança ${charge.externalId}.`,
    mismatch ? `Valor cobrado ${formatBRL(charge.amountCents)}, valor pago ${formatBRL(event.amountCents)}.` : null,
    wasClosed ? "Pago após a cobrança expirar ou ser cancelada." : null,
  ]
    .filter(Boolean)
    .join(" ");

  const payment = await tx.payment.create({
    data: {
      membershipId: membership.id,
      amountCents: event.amountCents,
      receivedAt: fromISODate(receivedAt),
      method: provider.paymentMethod,
      transactionRef: event.endToEndId,
      notes,
      idempotencyKey: `pix:${provider.id}:${event.id}`,
      status: "UNDER_REVIEW",
    },
  });
  await tx.pixCharge.update({ where: { id: charge.id }, data: { paymentId: payment.id } });
  await recordAudit(
    {
      actorId: null,
      action: "pix.webhook.paid",
      entityType: "Payment",
      entityId: payment.id,
      after: {
        chargeId: charge.id,
        txid: charge.externalId,
        amountCents: event.amountCents,
        status: "UNDER_REVIEW",
        simulation: provider.isSimulation,
      },
    },
    tx,
  );
  return {
    outcome: mismatch ? "PAGO_VALOR_DIVERGENTE" : wasClosed ? "PAGO_APOS_EXPIRACAO" : "PAGO",
    chargeId: charge.id,
  };
}

async function handleRefund(
  tx: DbTransaction,
  provider: PixProvider,
  event: { id: string; txid: string; amountCents: number; refundId: string },
): Promise<HandlerResult> {
  const charge = await findCharge(tx, provider, event.txid);
  if (!charge) return { outcome: "COBRANCA_DESCONHECIDA", chargeId: null, detail: `txid ${event.txid.slice(0, 35)}` };
  if (charge.status !== "PAID") return { outcome: "DEVOLUCAO_SEM_PAGAMENTO", chargeId: charge.id };

  const received = charge.payment?.amountCents ?? charge.amountCents;
  if (event.amountCents < received) {
    return {
      outcome: "DEVOLUCAO_PARCIAL",
      chargeId: charge.id,
      detail: `Devolvidos ${formatBRL(event.amountCents)} de ${formatBRL(received)}.`,
    };
  }

  await tx.pixCharge.update({ where: { id: charge.id }, data: { status: "REFUNDED" } });
  const payment = charge.payment;
  if (payment && (payment.status === "UNDER_REVIEW" || payment.status === "PENDING")) {
    await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ["PENDING", "UNDER_REVIEW"] } },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: `Pix devolvido ao pagador pelo provedor (devolução ${event.refundId.slice(0, 40)}).`,
      },
    });
    await recordAudit(
      {
        actorId: null,
        action: "pix.webhook.refund",
        entityType: "Payment",
        entityId: payment.id,
        before: { status: payment.status },
        after: { status: "CANCELLED" },
      },
      tx,
    );
  }
  if (payment?.status === "CONFIRMED") {
    // Dinheiro já está no livro-caixa: o estorno é decisão humana (lançamento inverso auditado).
    return { outcome: "DEVOLUCAO_PAGAMENTO_CONFIRMADO", chargeId: charge.id };
  }
  return { outcome: "DEVOLVIDO", chargeId: charge.id };
}

// ---------------------------------------------------------------------------
// Ambiente de simulação (sandbox): gera eventos assinados e usa o MESMO caminho do webhook real.
// ---------------------------------------------------------------------------

function simulatedEndToEnd(now: Date): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 12); // AAAAMMDDHHMM
  return `E00000000${stamp}${randomBytes(6).toString("hex").slice(0, 11).toUpperCase()}`;
}

export async function simulatePixEvent(
  actor: CurrentUser,
  input: { chargeId: string; kind: SimulationKind; amountCents: Cents | null },
  now: Date = new Date(),
  secret: string = env.PIX_WEBHOOK_SECRET,
): Promise<WebhookResult> {
  const charge = await db.pixCharge.findUnique({
    where: { id: input.chargeId },
    include: { payment: { select: { amountCents: true } } },
  });
  if (!charge) throw new DomainError("Cobrança não encontrada.");
  if (charge.provider !== simulatedProvider.id || !charge.isSimulation) {
    throw new DomainError("Somente cobranças de simulação podem receber eventos simulados.");
  }

  let body: string;
  if (input.kind === "resend") {
    const last = await db.webhookEvent.findFirst({
      where: { chargeId: charge.id, signatureValid: true },
      orderBy: { receivedAt: "desc" },
    });
    if (!last) throw new DomainError("Ainda não há evento desta cobrança para reenviar.");
    body = JSON.stringify(last.payload);
  } else if (input.kind === "refund") {
    body = JSON.stringify({
      id: `sim-${randomUUID()}`,
      type: "pix.refunded",
      txid: charge.externalId,
      amountCents: charge.payment?.amountCents ?? charge.amountCents,
      refundId: `D${simulatedEndToEnd(now).slice(1)}`,
      refundedAt: now.toISOString(),
    });
  } else if (input.kind === "expire") {
    body = JSON.stringify({ id: `sim-${randomUUID()}`, type: "pix.expired", txid: charge.externalId });
  } else {
    body = JSON.stringify({
      id: `sim-${randomUUID()}`,
      type: "pix.paid",
      txid: charge.externalId,
      amountCents: input.kind === "paid_other_amount" && input.amountCents ? input.amountCents : charge.amountCents,
      endToEndId: simulatedEndToEnd(now),
      paidAt: now.toISOString(),
    });
  }

  const timestamp = Math.floor(now.getTime() / 1000);
  const signature =
    input.kind === "bad_signature"
      ? signWebhook("segredo-errado-da-simulacao", timestamp, body)
      : signWebhook(secret, timestamp, body);

  await recordAudit({
    actorId: actor.userId,
    action: "pix.simulation",
    entityType: "PixCharge",
    entityId: charge.id,
    after: { kind: input.kind },
  });
  return processWebhook({
    provider: simulatedProvider.id,
    rawBody: body,
    signature,
    timestamp: String(timestamp),
    now,
    secret,
  });
}

/** Cabeçalhos usados pelo provedor (exportados para a rota e para a documentação). */
export const WEBHOOK_HEADERS = { signature: SIGNATURE_HEADER, timestamp: TIMESTAMP_HEADER };
