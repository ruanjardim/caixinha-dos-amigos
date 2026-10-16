import "server-only";
import { summarizeContributions, type PaymentStatusLike } from "@/domain/contributions";
import { formatCompetence, formatDateBR, toISODate, todayInBrazil, type ISODate } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { selectDueReminders } from "@/domain/reminders";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isUniqueViolation } from "@/lib/errors";
import { sendMail, type MailMessage } from "@/lib/mailer";
import { outcomeLabel } from "@/modules/pix/outcomes";

export type Send = (message: MailMessage) => Promise<void>;
export type DeliveryResult = "SENT" | "SKIPPED" | "FAILED" | "DUPLICATE";

export type NotificationInput = {
  userId: string | null;
  email: string;
  kind: string;
  /** Chave única: o mesmo aviso nunca é enviado duas vezes. */
  dedupeKey: string;
  subject: string;
  text: string;
};

const FOOTER = () =>
  `\n\n—\nCaixinha dos Amigos · ${env.BETTER_AUTH_URL}\n` +
  "Você recebe este aviso porque tem acesso à Caixinha dos Amigos. " +
  "Para deixar de receber avisos por e-mail, desative a opção em “Meus dados”.\n" +
  "A caixinha nunca pede senhas bancárias por e-mail.";

/**
 * Entrega um aviso respeitando a preferência do usuário e registrando o resultado.
 * O registro é criado ANTES do envio (chave única) — dois processos simultâneos não enviam em dobro.
 * Falhas de envio ficam registradas e nunca interrompem a operação que gerou o aviso.
 */
export async function deliver(input: NotificationInput, send: Send = sendMail): Promise<DeliveryResult> {
  let allowed = true;
  if (input.userId) {
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { status: true, emailNotifications: true },
    });
    allowed = Boolean(user && user.status === "ACTIVE" && user.emailNotifications);
  }

  let rowId: string;
  try {
    const row = await db.notification.create({
      data: {
        userId: input.userId,
        email: input.email,
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        subject: input.subject,
        status: allowed ? "FAILED" : "SKIPPED",
        error: allowed ? "Envio não concluído." : "Usuário optou por não receber avisos por e-mail.",
      },
    });
    rowId = row.id;
  } catch (e) {
    if (isUniqueViolation(e)) return "DUPLICATE";
    throw e;
  }
  if (!allowed) return "SKIPPED";

  try {
    await send({ to: input.email, subject: `[Caixinha] ${input.subject}`, text: input.text + FOOTER() });
    await db.notification.update({ where: { id: rowId }, data: { status: "SENT", error: null } });
    return "SENT";
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido.";
    await db.notification.update({ where: { id: rowId }, data: { status: "FAILED", error: message.slice(0, 300) } });
    console.error("[notificacao] falha no envio", input.kind, message);
    return "FAILED";
  }
}

async function activeAdmins(caixinhaId?: string | null) {
  return db.user.findMany({
    where: {
      role: "ADMIN",
      status: "ACTIVE",
      ...(caixinhaId
        ? { caixinhas: { some: { caixinhaId, role: { in: ["OWNER", "ADMIN"] } } } }
        : {}),
    },
    select: { id: true, email: true },
  });
}

function link(path: string) {
  return `${env.BETTER_AUTH_URL.replace(/\/$/, "")}${path}`;
}

// ---------------------------------------------------------------------------
// Pagamentos
// ---------------------------------------------------------------------------

async function loadPayment(paymentId: string) {
  return db.payment.findUnique({
    where: { id: paymentId },
    include: {
      membership: {
        include: {
          cycle: { select: { name: true, caixinhaId: true } },
          participant: { select: { fullName: true, user: { select: { id: true, email: true } } } },
        },
      },
    },
  });
}

/** Participante informou um pagamento → administração confere. */
export async function notifyPaymentInformed(paymentId: string, send?: Send) {
  const payment = await loadPayment(paymentId);
  if (!payment) return;
  const who = payment.membership.participant.fullName;
  for (const admin of await activeAdmins(payment.membership.cycle.caixinhaId)) {
    await deliver(
      {
        userId: admin.id,
        email: admin.email,
        kind: "payment.informed",
        dedupeKey: `payment.informed:${payment.id}:${admin.id}`,
        subject: "Pagamento informado para conferência",
        text:
          `${who} informou um pagamento de ${formatBRL(payment.amountCents)}` +
          `${payment.receivedAt ? ` em ${formatDateBR(toISODate(payment.receivedAt))}` : ""} ` +
          `(${payment.membership.cycle.name}).\n\nConfira no extrato bancário antes de confirmar:\n${link(`/admin/pagamentos/${payment.id}`)}`,
      },
      send,
    );
  }
}

const DECISION = {
  confirmed: {
    subject: "Pagamento confirmado",
    text: (amount: string) => `Seu pagamento de ${amount} foi conferido e confirmado pela administração.`,
  },
  rejected: {
    subject: "Pagamento não confirmado",
    text: (amount: string) =>
      `Seu pagamento informado de ${amount} não foi confirmado pela administração. Veja o motivo no seu extrato e, se necessário, fale com a administração.`,
  },
  reversed: {
    subject: "Pagamento estornado",
    text: (amount: string) =>
      `Seu pagamento de ${amount} foi estornado pela administração. O motivo está registrado no seu extrato.`,
  },
} as const;

/** Decisão sobre o pagamento → o PRÓPRIO participante (somente ele). */
export async function notifyPaymentDecision(paymentId: string, decision: keyof typeof DECISION, send?: Send) {
  const payment = await loadPayment(paymentId);
  const user = payment?.membership.participant.user;
  if (!payment || !user) return;
  const d = DECISION[decision];
  await deliver(
    {
      userId: user.id,
      email: user.email,
      kind: `payment.${decision}`,
      dedupeKey: `payment.${decision}:${payment.id}`,
      subject: d.subject,
      text: `${d.text(formatBRL(payment.amountCents))}\n\nSeu extrato: ${link("/minha-caixinha/extrato")}`,
    },
    send,
  );
}

// ---------------------------------------------------------------------------
// Comunicados e resultados
// ---------------------------------------------------------------------------

async function cycleParticipantUsers(cycleId: string | null, caixinhaId?: string | null) {
  const participants = await db.participant.findMany({
    where: {
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      ...(caixinhaId ? { caixinhaId } : {}),
      ...(cycleId ? { memberships: { some: { cycleId } } } : {}),
    },
    select: { user: { select: { id: true, email: true } } },
  });
  return participants.flatMap((p) => (p.user ? [p.user] : []));
}

export async function notifyAnnouncementPublished(announcementId: string, send?: Send) {
  const a = await db.announcement.findUnique({ where: { id: announcementId } });
  if (!a?.publishedAt) return;
  for (const user of await cycleParticipantUsers(a.cycleId, a.caixinhaId)) {
    await deliver(
      {
        userId: user.id,
        email: user.email,
        kind: "announcement.published",
        dedupeKey: `announcement.published:${a.id}:${user.id}`,
        subject: `Comunicado: ${a.title}`.slice(0, 150),
        text: `${a.title}\n\n${a.body}\n\nVer no aplicativo: ${link("/minha-caixinha/comunicados")}`,
      },
      send,
    );
  }
}

export async function notifyResultsApproved(calculationId: string, send?: Send) {
  const calc = await db.resultCalculation.findUnique({
    where: { id: calculationId },
    include: { cycle: { select: { id: true, name: true, caixinhaId: true } } },
  });
  if (!calc || calc.status !== "APPROVED") return;
  for (const user of await cycleParticipantUsers(calc.cycle.id, calc.cycle.caixinhaId)) {
    await deliver(
      {
        userId: user.id,
        email: user.email,
        kind: "results.approved",
        dedupeKey: `results.approved:${calc.id}:${user.id}`,
        subject: `Resultado do ${calc.cycle.name} aprovado`,
        text:
          `A apuração do ${calc.cycle.name} foi aprovada. O valor que cabe a você e a prestação de contas ` +
          `estão disponíveis no aplicativo:\n${link("/minha-caixinha/extrato")}\n\n` +
          "Resultados dependem do desempenho do ciclo e não são rendimento garantido.",
      },
      send,
    );
  }
}

// ---------------------------------------------------------------------------
// Pix
// ---------------------------------------------------------------------------

/** Recebimento ou situação de atenção no webhook Pix → administração. */
export async function notifyPixEvent(webhookEventId: string, send?: Send) {
  const event = await db.webhookEvent.findUnique({
    where: { id: webhookEventId },
    include: { charge: { select: { id: true, externalId: true, isSimulation: true } } },
  });
  if (!event?.outcome) return;
  // Assinaturas inválidas e falhas podem se repetir muito: no máximo um aviso por dia.
  const daily = event.outcome === "ASSINATURA_INVALIDA" || event.outcome === "FALHA";
  const scope = daily ? `${event.outcome}:${toISODate(event.receivedAt)}` : event.id;
  for (const admin of await activeAdmins()) {
    await deliver(
      {
        userId: admin.id,
        email: admin.email,
        kind: "pix.event",
        dedupeKey: `pix.event:${scope}:${admin.id}`,
        subject: `Pix: ${outcomeLabel(event.outcome)}`.slice(0, 150),
        text:
          `${outcomeLabel(event.outcome)}${event.charge ? ` — cobrança ${event.charge.externalId}` : ""}` +
          `${event.charge?.isSimulation ? " (SIMULAÇÃO, sem dinheiro real)" : ""}.\n` +
          `${event.error ? `Detalhe: ${event.error}\n` : ""}\nConciliação: ${link(event.charge ? `/admin/pix/${event.charge.id}` : "/admin/pix")}`,
      },
      send,
    );
  }
}

// ---------------------------------------------------------------------------
// Lembretes de vencimento (tarefa diária)
// ---------------------------------------------------------------------------

export async function sendDueReminders(today: ISODate = todayInBrazil(), send?: Send) {
  const memberships = await db.membership.findMany({
    where: {
      status: "ACTIVE",
      cycle: { status: "OPEN" },
      participant: { status: "ACTIVE", user: { status: "ACTIVE" } },
    },
    include: {
      cycle: { select: { name: true } },
      participant: { select: { user: { select: { id: true, email: true } } } },
      installments: true,
      payments: { select: { id: true, amountCents: true, status: true } },
    },
  });

  const counts = { SENT: 0, SKIPPED: 0, FAILED: 0, DUPLICATE: 0 } satisfies Record<DeliveryResult, number>;
  for (const m of memberships) {
    const user = m.participant.user;
    if (!user) continue;
    // Pagamento informado e ainda em análise conta como "em dia" para fins de lembrete.
    const summary = summarizeContributions({
      installments: m.installments.map((i) => ({
        id: i.id,
        competence: i.competence,
        dueDate: toISODate(i.dueDate),
        expectedCents: i.expectedCents,
        cancelled: Boolean(i.cancelledAt),
      })),
      payments: m.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        status: (p.status === "UNDER_REVIEW" || p.status === "PENDING" ? "CONFIRMED" : p.status) as PaymentStatusLike,
      })),
      today,
    });
    for (const r of selectDueReminders(summary.installments, today)) {
      const when = formatDateBR(r.dueDate);
      const result = await deliver(
        {
          userId: user.id,
          email: user.email,
          kind: `due.${r.kind}`,
          dedupeKey: `due.${r.kind}:${r.installmentId}`,
          subject: r.kind === "before" ? `Contribuição vence em ${when}` : `Contribuição em aberto desde ${when}`,
          text:
            `${m.cycle.name} — parcela de ${formatCompetence(r.competence)}: ${formatBRL(r.remainingCents)} ` +
            (r.kind === "before" ? `vence em ${when}.` : `venceu em ${when} e ainda não consta como paga.`) +
            `\n\nSe você já pagou, informe o pagamento no aplicativo para conferência:\n${link("/minha-caixinha/informar-pagamento")}`,
        },
        send,
      );
      counts[result]++;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Registro (administração)
// ---------------------------------------------------------------------------

export const NOTIFICATION_KIND_LABEL: Record<string, string> = {
  "payment.informed": "Pagamento informado",
  "payment.confirmed": "Pagamento confirmado",
  "payment.rejected": "Pagamento recusado",
  "payment.reversed": "Pagamento estornado",
  "announcement.published": "Comunicado",
  "results.approved": "Resultado aprovado",
  "pix.event": "Evento Pix",
  "due.before": "Lembrete de vencimento",
  "due.late": "Aviso de atraso",
};

export function listNotificationLog(limit = 40) {
  return db.notification.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
