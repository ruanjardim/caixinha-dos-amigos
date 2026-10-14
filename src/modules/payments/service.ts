import "server-only";
import { formatDateBR, fromISODate, toISODate, todayInBrazil, type ISODate } from "@/domain/dates";
import { contributionLines, reversalLines, type LedgerAccount } from "@/domain/ledger";
import { formatBRL, type Cents } from "@/domain/money";
import type { Payment, PaymentMethod } from "@/generated/prisma/client";
import { db, lockCycle, type DbTransaction } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import { ForbiddenError, type CurrentUser } from "@/modules/auth/session";
import { postEntry } from "@/modules/ledger/service";

const PAYABLE_CYCLE_STATUS = ["OPEN", "CONTRIBUTIONS_CLOSED"] as const;

export type NewPaymentInput = {
  membershipId: string;
  amountCents: Cents;
  receivedAt: ISODate;
  method: PaymentMethod;
  transactionRef: string | null;
  notes: string | null;
  idempotencyKey: string;
  acknowledgeDuplicate: boolean;
  proofFileId?: string | null;
};

function paymentSnapshot(p: Payment) {
  return {
    membershipId: p.membershipId,
    amountCents: p.amountCents,
    receivedAt: p.receivedAt ? toISODate(p.receivedAt) : null,
    method: p.method,
    transactionRef: p.transactionRef,
    status: p.status,
  };
}

async function loadMembershipForPayment(tx: DbTransaction, membershipId: string) {
  const membership = await tx.membership.findUnique({
    where: { id: membershipId },
    include: { cycle: { select: { id: true, status: true, name: true } } },
  });
  if (!membership) throw new DomainError("Participação não encontrada.");
  if (!(PAYABLE_CYCLE_STATUS as readonly string[]).includes(membership.cycle.status)) {
    throw new DomainError("Este ciclo não está recebendo pagamentos.");
  }
  return membership;
}

/**
 * Regras anti-duplicidade:
 * 1. Mesma chave de idempotência (envio repetido do mesmo formulário) → devolve o já registrado.
 * 2. Mesma referência de transação no mesmo meio → bloqueado (também garantido no banco).
 * 3. Mesmo participante, valor e data → exige confirmação explícita ("não é duplicado").
 */
async function checkDuplicates(tx: DbTransaction, input: NewPaymentInput): Promise<Payment | null> {
  const sameKey = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (sameKey) return sameKey;

  if (input.transactionRef) {
    const sameRef = await tx.payment.findFirst({
      where: { method: input.method, transactionRef: input.transactionRef },
      select: { id: true, status: true },
    });
    if (sameRef) {
      throw new DomainError(
        "Esta referência de transação já foi registrada em outro pagamento.",
        "DUPLICATE_REFERENCE",
      );
    }
  }

  if (!input.acknowledgeDuplicate) {
    const similar = await tx.payment.findFirst({
      where: {
        membershipId: input.membershipId,
        amountCents: input.amountCents,
        receivedAt: fromISODate(input.receivedAt),
        status: { notIn: ["CANCELLED"] },
      },
    });
    if (similar) {
      throw new DomainError(
        `Já existe um pagamento de ${formatBRL(input.amountCents)} em ${formatDateBR(input.receivedAt)} para este participante. Se não for duplicado, marque a confirmação e envie novamente.`,
        "DUPLICATE_SUSPECTED",
      );
    }
  }
  return null;
}

function assertNotFuture(date: ISODate, today: ISODate) {
  if (date > today) throw new DomainError("A data do pagamento não pode estar no futuro.");
}

/**
 * Administrador confirmando o PRÓPRIO pagamento (quando também participa):
 * - havendo outro administrador ativo, ele é quem deve confirmar;
 * - sendo o único administrador, exige justificativa registrada na auditoria.
 */
async function checkSelfConfirmation(
  tx: DbTransaction,
  actor: CurrentUser,
  participantId: string,
  note: string | null,
): Promise<boolean> {
  if (!actor.participantId || actor.participantId !== participantId) return false;
  const otherAdmins = await tx.user.count({
    where: { role: "ADMIN", status: "ACTIVE", id: { not: actor.userId } },
  });
  if (otherAdmins > 0) {
    throw new ForbiddenError("Outro administrador deve confirmar o seu próprio pagamento.");
  }
  if (!note || note.length < 10) {
    throw new DomainError("Você é o único administrador: justifique a confirmação do seu próprio pagamento.");
  }
  return true;
}

/** Confirma dentro de uma transação já aberta (usado pelo registro e pela conferência). */
async function confirmInTx(
  tx: DbTransaction,
  actor: CurrentUser,
  paymentId: string,
  input: { receivedAt: ISODate; confirmationNote: string | null },
  today: ISODate,
) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { membership: { include: { cycle: { select: { id: true, status: true } } } } },
  });
  if (!payment) throw new DomainError("Pagamento não encontrado.");
  await lockCycle(tx, payment.membership.cycleId);
  if (!(PAYABLE_CYCLE_STATUS as readonly string[]).includes(payment.membership.cycle.status)) {
    throw new DomainError("Este ciclo não está recebendo pagamentos.");
  }
  assertNotFuture(input.receivedAt, today);
  const selfConfirmed = await checkSelfConfirmation(
    tx,
    actor,
    payment.membership.participantId,
    input.confirmationNote,
  );

  // Troca atômica de status: duas confirmações simultâneas → só uma vence.
  const changed = await tx.payment.updateMany({
    where: { id: paymentId, status: { in: ["PENDING", "UNDER_REVIEW"] } },
    data: {
      status: "CONFIRMED",
      receivedAt: fromISODate(input.receivedAt),
      confirmedById: actor.userId,
      confirmedAt: new Date(),
      confirmationNote: input.confirmationNote,
    },
  });
  if (changed.count !== 1) throw new DomainError("Este pagamento já foi conferido por outra pessoa.");

  await postEntry(tx, {
    cycleId: payment.membership.cycleId,
    occurredOn: input.receivedAt,
    category: "CONTRIBUTION",
    description: `Contribuição confirmada (${formatBRL(payment.amountCents)})`,
    lines: contributionLines(payment.amountCents, payment.membershipId),
    createdById: actor.userId,
    paymentId,
  });

  await recordAudit(
    {
      actorId: actor.userId,
      action: "payment.confirm",
      entityType: "Payment",
      entityId: paymentId,
      before: { status: payment.status },
      after: { status: "CONFIRMED", receivedAt: input.receivedAt, amountCents: payment.amountCents, selfConfirmed },
      reason: input.confirmationNote,
    },
    tx,
  );
}

/** Pagamento registrado pela administração (opcionalmente já confirmado). */
export async function registerPayment(
  actor: CurrentUser,
  input: NewPaymentInput & { confirmNow: boolean; confirmationNote: string | null },
  today: ISODate = todayInBrazil(),
) {
  assertNotFuture(input.receivedAt, today);
  try {
    return await db.$transaction(async (tx) => {
      const existing = await checkDuplicates(tx, input);
      if (existing) return existing;
      await loadMembershipForPayment(tx, input.membershipId);

      const payment = await tx.payment.create({
        data: {
          membershipId: input.membershipId,
          amountCents: input.amountCents,
          receivedAt: fromISODate(input.receivedAt),
          method: input.method,
          transactionRef: input.transactionRef,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          proofFileId: input.proofFileId ?? null,
          status: "UNDER_REVIEW",
          registeredById: actor.userId,
        },
      });
      await recordAudit(
        {
          actorId: actor.userId,
          action: "payment.register",
          entityType: "Payment",
          entityId: payment.id,
          after: paymentSnapshot(payment),
        },
        tx,
      );
      if (input.confirmNow) {
        await confirmInTx(
          tx,
          actor,
          payment.id,
          { receivedAt: input.receivedAt, confirmationNote: input.confirmationNote },
          today,
        );
      }
      return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    });
  } catch (e) {
    if (isUniqueViolation(e, "transactionRef")) {
      throw new DomainError("Esta referência de transação já foi registrada em outro pagamento.");
    }
    if (isUniqueViolation(e, "idempotencyKey")) {
      return db.payment.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    }
    throw e;
  }
}

/** Pagamento informado pelo PRÓPRIO participante — nunca é confirmado automaticamente. */
export async function informPayment(actor: CurrentUser, input: NewPaymentInput, today: ISODate = todayInBrazil()) {
  if (!actor.participantId) throw new DomainError("Seu acesso não está vinculado a um cadastro de participante.");
  assertNotFuture(input.receivedAt, today);
  try {
    return await db.$transaction(async (tx) => {
      const membership = await loadMembershipForPayment(tx, input.membershipId);
      // Escopo obrigatório: só a própria participação.
      if (membership.participantId !== actor.participantId) throw new ForbiddenError();
      const existing = await checkDuplicates(tx, input);
      if (existing) return existing;

      const payment = await tx.payment.create({
        data: {
          membershipId: input.membershipId,
          amountCents: input.amountCents,
          receivedAt: fromISODate(input.receivedAt),
          method: input.method,
          transactionRef: input.transactionRef,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          proofFileId: input.proofFileId ?? null,
          status: "UNDER_REVIEW",
          registeredById: actor.userId,
        },
      });
      await recordAudit(
        {
          actorId: actor.userId,
          action: "payment.inform",
          entityType: "Payment",
          entityId: payment.id,
          after: paymentSnapshot(payment),
        },
        tx,
      );
      return payment;
    });
  } catch (e) {
    if (isUniqueViolation(e, "transactionRef")) {
      throw new DomainError("Esta referência de transação já foi registrada.");
    }
    if (isUniqueViolation(e, "idempotencyKey")) {
      return db.payment.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    }
    throw e;
  }
}

export async function confirmPayment(
  actor: CurrentUser,
  input: { paymentId: string; receivedAt: ISODate; confirmationNote: string | null },
  today: ISODate = todayInBrazil(),
) {
  await db.$transaction((tx) => confirmInTx(tx, actor, input.paymentId, input, today));
}

/** Recusa um pagamento ainda não confirmado (ex.: comprovante inválido, duplicado). */
export async function rejectPayment(actor: CurrentUser, input: { paymentId: string; reason: string }) {
  await db.$transaction(async (tx) => {
    const changed = await tx.payment.updateMany({
      where: { id: input.paymentId, status: { in: ["PENDING", "UNDER_REVIEW"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason },
    });
    if (changed.count !== 1) throw new DomainError("Somente pagamentos pendentes ou em análise podem ser recusados.");
    await recordAudit(
      {
        actorId: actor.userId,
        action: "payment.reject",
        entityType: "Payment",
        entityId: input.paymentId,
        after: { status: "CANCELLED" },
        reason: input.reason,
      },
      tx,
    );
  });
}

/**
 * Estorno de pagamento confirmado: o pagamento vira ESTORNADO e o livro-caixa
 * recebe um lançamento inverso. Nada é apagado.
 */
export async function reversePayment(
  actor: CurrentUser,
  input: { paymentId: string; reversedAt: ISODate; reason: string },
  today: ISODate = todayInBrazil(),
) {
  assertNotFuture(input.reversedAt, today);
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: input.paymentId },
      include: { membership: { select: { cycleId: true } } },
    });
    if (!payment) throw new DomainError("Pagamento não encontrado.");
    await lockCycle(tx, payment.membership.cycleId);
    if (payment.status !== "CONFIRMED") throw new DomainError("Somente pagamentos confirmados podem ser estornados.");
    if (payment.receivedAt && input.reversedAt < toISODate(payment.receivedAt)) {
      throw new DomainError("A data do estorno não pode ser anterior ao recebimento.");
    }
    const original = await tx.ledgerTransaction.findUnique({
      where: { paymentId: payment.id },
      include: { lines: true },
    });
    if (!original) throw new DomainError("Lançamento do pagamento não encontrado no livro-caixa.");

    const changed = await tx.payment.updateMany({
      where: { id: payment.id, status: "CONFIRMED" },
      data: { status: "REVERSED", reversedAt: fromISODate(input.reversedAt), reversalReason: input.reason },
    });
    if (changed.count !== 1) throw new DomainError("Este pagamento já foi estornado.");

    await postEntry(tx, {
      cycleId: payment.membership.cycleId,
      occurredOn: input.reversedAt,
      category: "CONTRIBUTION_REVERSAL",
      description: `Estorno de contribuição (${formatBRL(payment.amountCents)}) — ${input.reason}`,
      lines: reversalLines(original.lines.map((l) => ({ ...l, account: l.account as LedgerAccount }))),
      createdById: actor.userId,
      reversesId: original.id,
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "payment.reverse",
        entityType: "Payment",
        entityId: payment.id,
        before: { status: "CONFIRMED" },
        after: { status: "REVERSED", reversedAt: input.reversedAt },
        reason: input.reason,
      },
      tx,
    );
  });
}

/** Correção de dados ANTES da confirmação (depois, só por estorno). */
export async function editPendingPayment(
  actor: CurrentUser,
  input: {
    paymentId: string;
    amountCents: Cents;
    receivedAt: ISODate;
    method: PaymentMethod;
    transactionRef: string | null;
    notes: string | null;
  },
  today: ISODate = todayInBrazil(),
) {
  assertNotFuture(input.receivedAt, today);
  try {
    await db.$transaction(async (tx) => {
      const before = await tx.payment.findUnique({ where: { id: input.paymentId } });
      if (!before) throw new DomainError("Pagamento não encontrado.");
      if (before.status !== "PENDING" && before.status !== "UNDER_REVIEW") {
        throw new DomainError("Somente pagamentos não confirmados podem ser corrigidos.");
      }
      const after = await tx.payment.update({
        where: { id: input.paymentId },
        data: {
          amountCents: input.amountCents,
          receivedAt: fromISODate(input.receivedAt),
          method: input.method,
          transactionRef: input.transactionRef,
          notes: input.notes,
        },
      });
      await recordAudit(
        {
          actorId: actor.userId,
          action: "payment.edit",
          entityType: "Payment",
          entityId: input.paymentId,
          before: paymentSnapshot(before),
          after: paymentSnapshot(after),
        },
        tx,
      );
    });
  } catch (e) {
    if (isUniqueViolation(e, "transactionRef")) {
      throw new DomainError("Esta referência de transação já foi registrada em outro pagamento.");
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export async function listPayments(filter: { status?: string; cycleId?: string; q?: string }) {
  const statuses = ["PENDING", "UNDER_REVIEW", "CONFIRMED", "CANCELLED", "REVERSED"] as const;
  const status = statuses.find((s) => s === filter.status);
  return db.payment.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(filter.cycleId ? { membership: { cycleId: filter.cycleId } } : {}),
      ...(filter.q
        ? {
            OR: [
              { membership: { participant: { fullName: { contains: filter.q, mode: "insensitive" } } } },
              { transactionRef: { contains: filter.q.replace(/\s+/g, "").toUpperCase() } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    include: {
      membership: {
        select: { id: true, participant: { select: { fullName: true } }, cycle: { select: { name: true } } },
      },
    },
  });
}

export async function getPayment(paymentId: string) {
  return db.payment.findUnique({
    where: { id: paymentId },
    include: {
      membership: {
        include: {
          participant: { select: { id: true, fullName: true, email: true, userId: true } },
          cycle: { select: { id: true, name: true, status: true } },
        },
      },
      confirmedBy: { select: { name: true } },
      registeredBy: { select: { name: true, role: true } },
      proofFile: { select: { id: true, fileName: true, sizeBytes: true, contentType: true } },
      pixCharge: { select: { id: true, externalId: true, amountCents: true, isSimulation: true, status: true } },
    },
  });
}

export async function paymentHistory(paymentId: string) {
  return db.auditLog.findMany({
    where: { entityType: "Payment", entityId: paymentId },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { name: true } } },
  });
}
