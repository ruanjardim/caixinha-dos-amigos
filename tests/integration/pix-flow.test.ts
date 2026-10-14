/**
 * Pix (manual e simulação), webhook assinado e conciliação, contra o banco de TESTES.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { parsePixPayload, PixError } from "@/domain/pix";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/modules/auth/session";
import { addMembership, createCycle, openCycle, publishRules } from "@/modules/cycles/service";
import { confirmPayment } from "@/modules/payments/service";
import { manualProvider, simulatedProvider } from "@/modules/pix/providers";
import { openChargesForParticipant } from "@/modules/pix/queries";
import { cancelCharge, createCharge, expireCharges, processWebhook, simulatePixEvent } from "@/modules/pix/service";
import { signWebhook } from "@/modules/pix/signature";

const enabled = Boolean(process.env.DATABASE_URL);
const SECRET = "segredo-de-teste-do-webhook-com-32+caracteres";
const NOW = new Date("2026-12-05T15:00:00Z");

function send(body: object | string, opts: { now?: Date; secret?: string; ts?: number } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const now = opts.now ?? NOW;
  const ts = opts.ts ?? Math.floor(now.getTime() / 1000);
  return processWebhook({
    provider: "simulated",
    rawBody: raw,
    signature: signWebhook(opts.secret ?? SECRET, ts, raw),
    timestamp: String(ts),
    now,
    secret: SECRET,
  });
}

function paidEvent(txid: string, over: Record<string, unknown> = {}) {
  return {
    id: `evt-${randomUUID()}`,
    type: "pix.paid",
    txid,
    amountCents: 10_000,
    endToEndId: `E${randomUUID().replace(/-/g, "").slice(0, 31)}`,
    paidAt: NOW.toISOString(),
    ...over,
  };
}

describe.skipIf(!enabled)("Pix e webhook (integração)", () => {
  let admin: CurrentUser;
  let membershipId: string;
  let participantId: string;
  let otherParticipantId: string;

  const charge = (amountCents = 10_000) =>
    createCharge(
      admin,
      { membershipId, amountCents, description: "Contribuicao 12/2026", expiresInDays: 5 },
      simulatedProvider,
      NOW,
    );

  beforeAll(async () => {
    const id = randomUUID();
    await db.user.create({ data: { id, name: "Admin Pix", email: `${id.slice(0, 8)}@pix.local`, role: "ADMIN" } });
    admin = { userId: id, name: "Admin Pix", email: "", role: "ADMIN", status: "ACTIVE", participantId: null };
    const cycleId = (
      await createCycle(admin, {
        name: "Pix 2026/27",
        startDate: "2026-12-01",
        contributionEndDate: "2027-11-30",
        settlementDate: "2027-12-15",
        dueDay: 10,
        adminFeePercent: 1000,
        quotaValues: [10_000],
        rulesText: "",
      })
    ).id;
    const mk = async (name: string) =>
      (
        await db.participant.create({
          data: {
            fullName: name,
            email: `${randomUUID().slice(0, 8)}@pix.local`,
            joinedAt: new Date("2026-12-01T00:00:00Z"),
          },
        })
      ).id;
    participantId = await mk("Pagadora Pix");
    otherParticipantId = await mk("Outro Participante");
    membershipId = (
      await addMembership(admin, cycleId, {
        participantId,
        quotaCount: 1,
        quotaValueCents: 10_000,
        joinedAt: "2026-12-01",
      })
    ).id;
    await addMembership(admin, cycleId, {
      participantId: otherParticipantId,
      quotaCount: 1,
      quotaValueCents: 10_000,
      joinedAt: "2026-12-01",
    });
    await publishRules(admin, cycleId);
    await openCycle(admin, cycleId);
  });

  describe("cobranças", () => {
    it("simulação: BR Code válido, chave fictícia e marcado como simulação", async () => {
      const c = await charge();
      expect(c.status).toBe("ACTIVE");
      expect(c.isSimulation).toBe(true);
      expect(c.externalId).toMatch(/^CX[A-Z0-9]{23}$/);
      const { fields, crcValid } = parsePixPayload(c.copyPaste!);
      expect(crcValid).toBe(true);
      expect(fields["26"]).toContain("SIMULACAO-SEM-VALOR-REAL");
      expect(fields["54"]).toBe("100.00");
      expect(c.expiresAt!.getTime() - NOW.getTime()).toBe(5 * 86_400_000);
    });

    it("manual: exige a chave da caixinha e recusa CPF (conta pessoal)", async () => {
      expect(() => manualProvider({ key: "", receiverName: "", city: "" })).toThrow(PixError);
      expect(() => manualProvider({ key: "123.456.789-01", receiverName: "Caixinha", city: "Sao Paulo" })).toThrow(
        /pessoa física/,
      );
      const provider = manualProvider({
        key: "12.345.678/0001-90",
        receiverName: "Associacao Caixinha",
        city: "Sao Paulo",
      });
      const c = await createCharge(
        admin,
        { membershipId, amountCents: 5_000, description: null, expiresInDays: 1 },
        provider,
        NOW,
      );
      expect(c.isSimulation).toBe(false);
      expect(c.provider).toBe("manual");
      expect(parsePixPayload(c.copyPaste!).fields["26"]).toContain("12.345.678/0001-90");
      // Manual não recebe eventos simulados.
      await expect(
        simulatePixEvent(admin, { chargeId: c.id, kind: "paid", amountCents: null }, NOW, SECRET),
      ).rejects.toThrow(DomainError);
      await cancelCharge(admin, { chargeId: c.id, reason: "Teste" });
    });

    it("participante só vê as PRÓPRIAS cobranças em aberto", async () => {
      const mine = await openChargesForParticipant(participantId, NOW);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((c) => c.membershipId === membershipId)).toBe(true);
      expect(mine[0].qr).toMatch(/^data:image\/png;base64,/);
      expect(await openChargesForParticipant(otherParticipantId, NOW)).toHaveLength(0);
      // Expirada não aparece.
      expect(await openChargesForParticipant(participantId, new Date(NOW.getTime() + 6 * 86_400_000))).toHaveLength(0);
    });
  });

  describe("webhook", () => {
    it("pagamento recebido vira pagamento EM ANÁLISE — nunca confirmado automaticamente", async () => {
      const c = await charge();
      const event = paidEvent(c.externalId);
      const r = await send(event);
      expect(r).toMatchObject({ httpStatus: 200, outcome: "PAGO", notifyAdmins: true });

      const updated = await db.pixCharge.findUniqueOrThrow({ where: { id: c.id }, include: { payment: true } });
      expect(updated.status).toBe("PAID");
      expect(updated.endToEndId).toBe(event.endToEndId);
      expect(updated.payment).toMatchObject({
        status: "UNDER_REVIEW",
        method: "PIX_SIMULATED",
        amountCents: 10_000,
        transactionRef: event.endToEndId,
        registeredById: null,
      });
      expect(updated.payment!.notes).toMatch(/SIMULAÇÃO/);
      expect(await db.ledgerTransaction.count({ where: { paymentId: updated.paymentId! } })).toBe(0);

      // Mesmo evento de novo (o provedor reenvia): ignorado.
      expect(await send(event)).toMatchObject({ httpStatus: 200, outcome: "REPETIDO" });
      // Outro Pix para a mesma cobrança: duplicidade sinalizada, sem segundo pagamento.
      const dup = await send(paidEvent(c.externalId));
      expect(dup.outcome).toBe("PAGAMENTO_DUPLICADO");
      expect(await db.payment.count({ where: { pixCharge: { id: c.id } } })).toBe(1);
      expect(await db.webhookEvent.count({ where: { chargeId: c.id } })).toBe(2);
    });

    it("assinatura inválida ou antiga: rejeitada, registrada e sem efeito", async () => {
      const c = await charge();
      const bad = await send(paidEvent(c.externalId), { secret: "x".repeat(40) });
      expect(bad).toMatchObject({ httpStatus: 401, outcome: "ASSINATURA_INVALIDA" });
      const old = await send(paidEvent(c.externalId), { ts: Math.floor(NOW.getTime() / 1000) - 600 });
      expect(old.httpStatus).toBe(401);
      const logged = await db.webhookEvent.findUniqueOrThrow({ where: { id: bad.eventRowId! } });
      expect(logged.signatureValid).toBe(false);
      expect(logged.externalId).toMatch(/^rejeitado:/);
      expect((await db.pixCharge.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ACTIVE");
    });

    it("conteúdo inválido, cobrança desconhecida e tipo não tratado ficam registrados", async () => {
      expect(await send("isto não é json")).toMatchObject({ httpStatus: 400, outcome: "CONTEUDO_INVALIDO" });
      expect(await send(paidEvent("TXIDQUENAOEXISTE"))).toMatchObject({
        httpStatus: 200,
        outcome: "COBRANCA_DESCONHECIDA",
      });
      expect(await send({ id: `evt-${randomUUID()}`, type: "pix.outra-coisa" })).toMatchObject({ outcome: "IGNORADO" });
      const c = await charge();
      expect(await send(paidEvent(c.externalId, { amountCents: -5 }))).toMatchObject({
        httpStatus: 400,
        outcome: "CONTEUDO_INVALIDO",
      });
    });

    it("valor diferente do cobrado: registra o valor realmente recebido e pede atenção", async () => {
      const c = await charge();
      const r = await send(paidEvent(c.externalId, { amountCents: 8_000 }));
      expect(r.outcome).toBe("PAGO_VALOR_DIVERGENTE");
      const p = await db.payment.findFirstOrThrow({ where: { pixCharge: { id: c.id } } });
      expect(p.amountCents).toBe(8_000);
      expect(p.notes).toMatch(/Valor cobrado R\$\s?100,00, valor pago R\$\s?80,00/);
    });

    it("devolução antes da conferência cancela o pagamento em análise", async () => {
      const c = await charge();
      await send(paidEvent(c.externalId));
      const r = await send({
        id: `evt-${randomUUID()}`,
        type: "pix.refunded",
        txid: c.externalId,
        amountCents: 10_000,
        refundId: "D123",
        refundedAt: NOW.toISOString(),
      });
      expect(r.outcome).toBe("DEVOLVIDO");
      const after = await db.pixCharge.findUniqueOrThrow({ where: { id: c.id }, include: { payment: true } });
      expect(after.status).toBe("REFUNDED");
      expect(after.payment?.status).toBe("CANCELLED");
    });

    it("devolução de pagamento já confirmado: não mexe no livro-caixa, pede estorno humano", async () => {
      const c = await charge();
      await send(paidEvent(c.externalId));
      const paid = await db.pixCharge.findUniqueOrThrow({ where: { id: c.id } });
      await confirmPayment(
        admin,
        { paymentId: paid.paymentId!, receivedAt: "2026-12-05", confirmationNote: null },
        "2026-12-20",
      );
      const partial = await send({
        id: `evt-${randomUUID()}`,
        type: "pix.refunded",
        txid: c.externalId,
        amountCents: 4_000,
        refundId: "D456",
        refundedAt: NOW.toISOString(),
      });
      expect(partial.outcome).toBe("DEVOLUCAO_PARCIAL");
      const r = await send({
        id: `evt-${randomUUID()}`,
        type: "pix.refunded",
        txid: c.externalId,
        amountCents: 10_000,
        refundId: "D789",
        refundedAt: NOW.toISOString(),
      });
      expect(r.outcome).toBe("DEVOLUCAO_PAGAMENTO_CONFIRMADO");
      const p = await db.payment.findUniqueOrThrow({ where: { id: paid.paymentId! } });
      expect(p.status).toBe("CONFIRMED");
      const entry = await db.ledgerTransaction.findUniqueOrThrow({ where: { paymentId: p.id } });
      expect(await db.ledgerTransaction.count({ where: { reversesId: entry.id } })).toBe(0);
    });

    it("expiração pelo provedor e pela tarefa diária; pagamento tardio é sinalizado", async () => {
      const c = await charge();
      expect((await send({ id: `evt-${randomUUID()}`, type: "pix.expired", txid: c.externalId })).outcome).toBe(
        "EXPIRADA",
      );
      expect((await send(paidEvent(c.externalId))).outcome).toBe("PAGO_APOS_EXPIRACAO");

      const c2 = await charge();
      const expired = await expireCharges(new Date(NOW.getTime() + 6 * 86_400_000));
      expect(expired).toBeGreaterThan(0);
      expect((await db.pixCharge.findUniqueOrThrow({ where: { id: c2.id } })).status).toBe("EXPIRED");
    });

    it("eventos recebidos são imutáveis e não podem ser apagados", async () => {
      const event = await db.webhookEvent.findFirstOrThrow({ where: { signatureValid: true } });
      await expect(
        db.webhookEvent.update({ where: { id: event.id }, data: { payload: { adulterado: true } } }),
      ).rejects.toThrow(/não pode ser alterado/);
      await expect(db.webhookEvent.delete({ where: { id: event.id } })).rejects.toThrow(/não podem ser apagados/);
    });
  });

  describe("ambiente de simulação (sandbox)", () => {
    it("usa o mesmo caminho do webhook: pagar, reenviar, assinatura inválida", async () => {
      const c = await charge();
      const paid = await simulatePixEvent(admin, { chargeId: c.id, kind: "paid", amountCents: null }, NOW, SECRET);
      expect(paid.outcome).toBe("PAGO");
      const resent = await simulatePixEvent(admin, { chargeId: c.id, kind: "resend", amountCents: null }, NOW, SECRET);
      expect(resent.outcome).toBe("REPETIDO");
      const second = await simulatePixEvent(
        admin,
        { chargeId: c.id, kind: "second_payment", amountCents: null },
        NOW,
        SECRET,
      );
      expect(second.outcome).toBe("PAGAMENTO_DUPLICADO");
      const forged = await simulatePixEvent(
        admin,
        { chargeId: c.id, kind: "bad_signature", amountCents: null },
        NOW,
        SECRET,
      );
      expect(forged).toMatchObject({ httpStatus: 401, outcome: "ASSINATURA_INVALIDA" });
      const audit = await db.auditLog.count({ where: { action: "pix.simulation", entityId: c.id } });
      expect(audit).toBe(4);
    });
  });
});
