/**
 * Avisos por e-mail: envio único, preferência do usuário, falhas registradas e destinatários corretos.
 * O envio real é substituído por uma função de teste (nada sai da máquina).
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { MailMessage } from "@/lib/mailer";
import type { CurrentUser } from "@/modules/auth/session";
import { addMembership, createCycle, openCycle, publishRules } from "@/modules/cycles/service";
import {
  deliver,
  notifyAnnouncementPublished,
  notifyPaymentDecision,
  notifyPaymentInformed,
  sendDueReminders,
} from "@/modules/notifications/service";
import { informPayment } from "@/modules/payments/service";

const enabled = Boolean(process.env.DATABASE_URL);

function outbox() {
  const sent: MailMessage[] = [];
  const send = async (m: MailMessage) => {
    sent.push(m);
  };
  return { sent, send };
}

describe.skipIf(!enabled)("notificações (integração)", () => {
  let admin: CurrentUser;
  let ana: CurrentUser;
  let bia: CurrentUser;
  let cycleId: string;
  let anaMembership: string;

  async function participantUser(name: string): Promise<CurrentUser> {
    const id = randomUUID();
    const email = `${name.toLowerCase()}.${id.slice(0, 6)}@aviso.local`;
    await db.user.create({ data: { id, name, email, role: "PARTICIPANT" } });
    const p = await db.participant.create({
      data: { fullName: name, email, joinedAt: new Date("2026-12-01T00:00:00Z"), userId: id },
    });
    return { userId: id, name, email, role: "PARTICIPANT", status: "ACTIVE", participantId: p.id };
  }

  beforeAll(async () => {
    const id = randomUUID();
    const email = `admin.${id.slice(0, 6)}@aviso.local`;
    await db.user.create({ data: { id, name: "Admin Avisos", email, role: "ADMIN" } });
    admin = { userId: id, name: "Admin Avisos", email, role: "ADMIN", status: "ACTIVE", participantId: null };
    ana = await participantUser("Ana");
    bia = await participantUser("Bia");
    cycleId = (
      await createCycle(admin, {
        name: "Avisos 2026/27",
        startDate: "2026-12-01",
        contributionEndDate: "2027-11-30",
        settlementDate: "2027-12-15",
        dueDay: 10,
        adminFeePercent: 1000,
        quotaValues: [10_000],
        rulesText: "",
      })
    ).id;
    anaMembership = (
      await addMembership(admin, cycleId, {
        participantId: ana.participantId!,
        quotaCount: 1,
        quotaValueCents: 10_000,
        joinedAt: "2026-12-01",
      })
    ).id;
    await publishRules(admin, cycleId);
    await openCycle(admin, cycleId);
  });

  it("cada aviso é enviado uma única vez", async () => {
    const { sent, send } = outbox();
    const input = {
      userId: ana.userId,
      email: ana.email,
      kind: "teste",
      dedupeKey: `teste:${randomUUID()}`,
      subject: "Olá",
      text: "Mensagem",
    };
    expect(await deliver(input, send)).toBe("SENT");
    expect(await deliver(input, send)).toBe("DUPLICATE");
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("[Caixinha] Olá");
    expect(sent[0].text).toMatch(/nunca pede senhas/);
    const row = await db.notification.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey } });
    expect(row.status).toBe("SENT");
  });

  it("respeita a preferência do usuário e registra falhas sem lançar erro", async () => {
    const { sent, send } = outbox();
    await db.user.update({ where: { id: bia.userId }, data: { emailNotifications: false } });
    const skipped = await deliver(
      { userId: bia.userId, email: bia.email, kind: "teste", dedupeKey: `t:${randomUUID()}`, subject: "x", text: "x" },
      send,
    );
    expect(skipped).toBe("SKIPPED");
    expect(sent).toHaveLength(0);
    await db.user.update({ where: { id: bia.userId }, data: { emailNotifications: true } });

    const key = `t:${randomUUID()}`;
    const failed = await deliver(
      { userId: bia.userId, email: bia.email, kind: "teste", dedupeKey: key, subject: "x", text: "x" },
      async () => {
        throw new Error("SMTP fora do ar");
      },
    );
    expect(failed).toBe("FAILED");
    expect(await db.notification.findUniqueOrThrow({ where: { dedupeKey: key } })).toMatchObject({
      status: "FAILED",
      error: "SMTP fora do ar",
    });
  });

  it("pagamento informado avisa a administração; decisão avisa SOMENTE o próprio participante", async () => {
    const payment = await informPayment(
      ana,
      {
        membershipId: anaMembership,
        amountCents: 10_000,
        receivedAt: "2026-12-05",
        method: "PIX_MANUAL",
        transactionRef: null,
        notes: null,
        idempotencyKey: randomUUID(),
        acknowledgeDuplicate: false,
      },
      "2026-12-20",
    );
    const informed = outbox();
    await notifyPaymentInformed(payment.id, informed.send);
    expect(informed.sent.map((m) => m.to)).toContain(admin.email);
    expect(informed.sent.map((m) => m.to)).not.toContain(ana.email);

    const decided = outbox();
    await notifyPaymentDecision(payment.id, "confirmed", decided.send);
    expect(decided.sent.map((m) => m.to)).toEqual([ana.email]);
    expect(decided.sent[0].text).toMatch(/R\$\s?100,00/);
  });

  it("comunicado de um ciclo vai só para quem participa dele", async () => {
    const a = await db.announcement.create({
      data: { cycleId, title: "Reunião", body: "Sábado às 10h.", publishedAt: new Date(), createdById: admin.userId },
    });
    const { sent, send } = outbox();
    await notifyAnnouncementPublished(a.id, send);
    const to = sent.map((m) => m.to);
    expect(to).toContain(ana.email);
    expect(to).not.toContain(bia.email); // Bia não está no ciclo
    // Rascunho não gera aviso.
    const draft = await db.announcement.create({
      data: { cycleId, title: "Rascunho", body: "x", createdById: admin.userId },
    });
    const none = outbox();
    await notifyAnnouncementPublished(draft.id, none.send);
    expect(none.sent).toHaveLength(0);
  });

  it("lembretes: antes do vencimento e em atraso, uma vez por parcela; pagamento em análise suspende", async () => {
    const mine = (sent: MailMessage[]) => sent.filter((m) => m.to === ana.email);

    // Ana já informou R$ 100 (em análise) no teste anterior → dezembro coberto, nenhum lembrete.
    const covered = outbox();
    await sendDueReminders("2026-12-08", covered.send);
    expect(mine(covered.sent)).toHaveLength(0);

    // Janeiro vence em 10/01: lembrete em 08/01, e só uma vez.
    const before = outbox();
    await sendDueReminders("2027-01-08", before.send);
    expect(mine(before.sent)).toHaveLength(1);
    expect(mine(before.sent)[0].subject).toMatch(/vence em 10\/01\/2027/);
    const again = outbox();
    await sendDueReminders("2027-01-09", again.send);
    expect(mine(again.sent)).toHaveLength(0);

    // Atrasado: aviso único de atraso.
    const late = outbox();
    await sendDueReminders("2027-01-12", late.send);
    expect(mine(late.sent)).toHaveLength(1);
    expect(mine(late.sent)[0].subject).toMatch(/em aberto desde 10\/01\/2027/);
  });
});
