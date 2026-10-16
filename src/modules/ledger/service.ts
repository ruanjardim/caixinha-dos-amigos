import "server-only";
import { fromISODate, type ISODate } from "@/domain/dates";
import {
  assertBalanced,
  balancesFrom,
  cashEffect,
  expenseLines,
  ledgerOverview,
  reversalLines,
  revenueLines,
  taxLines,
  type LedgerAccount,
  type LedgerLineInput,
} from "@/domain/ledger";
import { formatBRL, type Cents } from "@/domain/money";
import type { LedgerCategory } from "@/generated/prisma/client";
import { db, lockCycle, type DbTransaction } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import type { CurrentUser } from "@/modules/auth/session";

/** Saldo atual da conta CASH de um ciclo. */
export async function cashBalance(tx: DbTransaction, cycleId: string): Promise<Cents> {
  const r = await tx.ledgerLine.aggregate({
    where: { account: "CASH", transaction: { cycleId } },
    _sum: { amountCents: true },
  });
  return r._sum.amountCents ?? 0;
}

export type PostEntryInput = {
  cycleId: string;
  occurredOn: ISODate;
  category: LedgerCategory;
  description: string;
  lines: LedgerLineInput[];
  createdById: string;
  paymentId?: string | null;
  reversesId?: string | null;
  /** Correção registrada após o encerramento do ciclo (procedimento auditável). */
  postClosing?: boolean;
  /** Atividade de arrecadação relacionada (receitas e custos da atividade). */
  activityId?: string | null;
};

/**
 * Grava um lançamento balanceado. DEVE ser chamado dentro de uma transação.
 * - Serializa lançamentos do mesmo ciclo (trava por ciclo).
 * - Impede que o caixa fique negativo (não se gasta dinheiro que não existe).
 */
export async function postEntry(tx: DbTransaction, input: PostEntryInput) {
  assertBalanced(input.lines);
  await lockCycle(tx, input.cycleId);

  const effect = cashEffect(input.lines);
  if (effect < 0) {
    const available = await cashBalance(tx, input.cycleId);
    if (available + effect < 0) {
      throw new DomainError(
        `Saldo em caixa insuficiente: disponível ${formatBRL(available)}, necessário ${formatBRL(-effect)}.`,
      );
    }
  }

  const entry = await tx.ledgerTransaction.create({
    data: {
      cycleId: input.cycleId,
      occurredOn: fromISODate(input.occurredOn),
      category: input.category,
      description: input.description,
      createdById: input.createdById,
      paymentId: input.paymentId ?? null,
      reversesId: input.reversesId ?? null,
      postClosing: input.postClosing ?? false,
      activityId: input.activityId ?? null,
    },
  });
  // Todas as linhas em UM comando: o banco confere a soma zero ao fim do INSERT.
  await tx.ledgerLine.createMany({
    data: input.lines.map((l) => ({
      transactionId: entry.id,
      account: l.account,
      amountCents: l.amountCents,
      membershipId: l.membershipId ?? null,
    })),
  });
  return entry;
}

export type ManualEntryKind = "REVENUE" | "EXPENSE" | "TAX";

const MANUAL: Record<ManualEntryKind, { category: LedgerCategory; lines: (c: Cents) => LedgerLineInput[] }> = {
  REVENUE: { category: "ADDITIONAL_REVENUE", lines: revenueLines },
  EXPENSE: { category: "ADMIN_EXPENSE", lines: expenseLines },
  TAX: { category: "TAX", lines: taxLines },
};

async function assertCycleAcceptsEntries(tx: DbTransaction, cycleId: string, caixinhaId?: string | null) {
  const cycle = await tx.cycle.findFirst({
    where: { id: cycleId, ...(caixinhaId ? { caixinhaId } : {}) },
    select: { status: true },
  });
  if (!cycle) throw new DomainError("Ciclo não encontrado.");
  if (cycle.status === "DRAFT") throw new DomainError("Ciclo em preparação ainda não aceita lançamentos.");
  if (cycle.status === "SETTLING") {
    throw new DomainError(
      "Apuração aprovada: novos lançamentos só depois do encerramento, como correção pós-encerramento.",
    );
  }
  if (cycle.status === "CLOSED") {
    throw new DomainError("Ciclo encerrado: use a correção pós-encerramento (com justificativa).");
  }
}

/** Receita adicional, despesa ou tributo lançados pela administração. */
export async function recordManualEntry(
  actor: CurrentUser,
  input: { cycleId: string; kind: ManualEntryKind; amountCents: Cents; occurredOn: ISODate; description: string },
) {
  const spec = MANUAL[input.kind];
  return db.$transaction(async (tx) => {
    await assertCycleAcceptsEntries(tx, input.cycleId, actor.caixinhaId);
    const entry = await postEntry(tx, {
      cycleId: input.cycleId,
      occurredOn: input.occurredOn,
      category: spec.category,
      description: input.description,
      lines: spec.lines(input.amountCents),
      createdById: actor.userId,
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "ledger.entry",
        entityType: "LedgerTransaction",
        entityId: entry.id,
        after: {
          kind: input.kind,
          amountCents: input.amountCents,
          occurredOn: input.occurredOn,
          description: input.description,
        },
      },
      tx,
    );
    return entry;
  });
}

/**
 * Estorna um lançamento manual com um lançamento inverso (o original é mantido).
 * Lançamentos de pagamento são estornados pelo módulo de pagamentos.
 */
export async function reverseEntry(
  actor: CurrentUser,
  input: { transactionId: string; occurredOn: ISODate; reason: string },
) {
  return db.$transaction(async (tx) => {
    const original = await tx.ledgerTransaction.findFirst({
      where: {
        id: input.transactionId,
        ...(actor.caixinhaId ? { cycle: { caixinhaId: actor.caixinhaId } } : {}),
      },
      include: { lines: true, reversedBy: { select: { id: true } } },
    });
    if (!original) throw new DomainError("Lançamento não encontrado.");
    if (original.paymentId) throw new DomainError("Lançamentos de pagamento são estornados pela tela do pagamento.");
    if (original.reversesId) throw new DomainError("Este lançamento já é um estorno.");
    if (original.reversedBy) throw new DomainError("Este lançamento já foi estornado.");
    await assertCycleAcceptsEntries(tx, original.cycleId, actor.caixinhaId);

    const entry = await postEntry(tx, {
      cycleId: original.cycleId,
      occurredOn: input.occurredOn,
      category: "REVERSAL",
      description: `Estorno: ${original.description} — ${input.reason}`,
      lines: reversalLines(original.lines.map((l) => ({ ...l, account: l.account as LedgerAccount }))),
      createdById: actor.userId,
      reversesId: original.id,
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "ledger.reverse",
        entityType: "LedgerTransaction",
        entityId: original.id,
        after: { reversalId: entry.id },
        reason: input.reason,
      },
      tx,
    );
    return entry;
  });
}

export async function getLedgerOverview(cycleId: string) {
  const sums = await db.ledgerLine.groupBy({
    by: ["account"],
    where: { transaction: { cycleId } },
    _sum: { amountCents: true },
  });
  return ledgerOverview(
    balancesFrom(sums.map((s) => ({ account: s.account as LedgerAccount, amountCents: s._sum.amountCents ?? 0 }))),
  );
}

export async function listEntries(cycleId: string, options: { category?: LedgerCategory; take?: number } = {}) {
  return db.ledgerTransaction.findMany({
    where: { cycleId, ...(options.category ? { category: options.category } : {}) },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: options.take ?? 200,
    include: {
      lines: true,
      createdBy: { select: { name: true } },
      reversedBy: { select: { id: true } },
    },
  });
}
