import "server-only";
import { createHash } from "node:crypto";
import {
  calculateDistribution,
  DistributionError,
  POLICY_VERSION,
  type MemberInput,
  type PrincipalMovement,
} from "@/domain/distribution";
import { fromISODate, toISODate, todayInBrazil, type ISODate } from "@/domain/dates";
import { expenseLines, revenueLines, type LedgerLineInput } from "@/domain/ledger";
import { formatBRL, type Cents } from "@/domain/money";
import { db, lockCycle, type DbTransaction } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { cashBalance, postEntry } from "@/modules/ledger/service";

// ---------------------------------------------------------------------------
// Leitura do livro-caixa
// ---------------------------------------------------------------------------

/** Movimentos de principal por participação (contribuições +, estornos/devoluções −). */
export async function principalMovements(
  tx: DbTransaction,
  cycleId: string,
): Promise<Map<string, PrincipalMovement[]>> {
  const lines = await tx.ledgerLine.findMany({
    where: { account: "PARTICIPANT_PRINCIPAL", membershipId: { not: null }, transaction: { cycleId } },
    select: { membershipId: true, amountCents: true, transaction: { select: { occurredOn: true } } },
  });
  const map = new Map<string, PrincipalMovement[]>();
  for (const l of lines) {
    const list = map.get(l.membershipId!) ?? [];
    // Crédito (negativo) na conta de principal = dinheiro recebido do participante.
    list.push({ date: toISODate(l.transaction.occurredOn), amountCents: -l.amountCents });
    map.set(l.membershipId!, list);
  }
  return map;
}

export async function outstandingPrincipal(tx: DbTransaction, membershipId: string): Promise<Cents> {
  const r = await tx.ledgerLine.aggregate({
    where: { account: "PARTICIPANT_PRINCIPAL", membershipId },
    _sum: { amountCents: true },
  });
  return -(r._sum.amountCents ?? 0) + 0;
}

async function accountSum(tx: DbTransaction, cycleId: string, account: "ADDITIONAL_REVENUE" | "EXPENSE" | "TAX") {
  const r = await tx.ledgerLine.aggregate({
    where: { account, transaction: { cycleId } },
    _sum: { amountCents: true },
  });
  return r._sum.amountCents ?? 0;
}

/** O livro-caixa é append-only: a contagem de lançamentos identifica qualquer mudança. */
async function ledgerFingerprint(tx: DbTransaction, cycleId: string) {
  const [entries, memberships] = await Promise.all([
    tx.ledgerTransaction.count({ where: { cycleId } }),
    tx.membership.count({ where: { cycleId } }),
  ]);
  return `${entries}:${memberships}`;
}

async function pendingPaymentsCount(tx: DbTransaction, cycleId: string) {
  return tx.payment.count({ where: { membership: { cycleId }, status: { in: ["PENDING", "UNDER_REVIEW"] } } });
}

function sha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Apuração
// ---------------------------------------------------------------------------

/** Calcula (rascunho) a apuração do ciclo. Rascunhos anteriores ficam como substituídos. */
export async function calculateResults(actor: CurrentUser, cycleId: string) {
  return db.$transaction(async (tx) => {
    await lockCycle(tx, cycleId);
    const cycle = await tx.cycle.findUnique({
      where: { id: cycleId },
      include: { rules: { orderBy: { version: "desc" }, take: 1 }, memberships: { select: { id: true } } },
    });
    if (!cycle) throw new DomainError("Ciclo não encontrado.");
    if (cycle.status !== "CONTRIBUTIONS_CLOSED") {
      throw new DomainError("A apuração só pode ser feita depois de encerrar o período de contribuições.");
    }
    const rules = cycle.rules[0];
    if (!rules?.frozenAt) throw new DomainError("Regras do ciclo não publicadas.");
    const pending = await pendingPaymentsCount(tx, cycleId);
    if (pending > 0) throw new DomainError(`Confira ou recuse antes os ${pending} pagamento(s) em análise.`);

    const movements = await principalMovements(tx, cycleId);
    const members: MemberInput[] = cycle.memberships.map((m) => ({
      membershipId: m.id,
      movements: movements.get(m.id) ?? [],
    }));
    const input = {
      cycleStart: toISODate(cycle.startDate),
      cutoffDate: toISODate(cycle.contributionEndDate),
      adminFeeBps: rules.adminFeeBps,
      revenueCents: -(await accountSum(tx, cycleId, "ADDITIONAL_REVENUE")) + 0,
      expenseCents: await accountSum(tx, cycleId, "EXPENSE"),
      taxCents: await accountSum(tx, cycleId, "TAX"),
      availableCashCents: await cashBalance(tx, cycleId),
      members,
    };

    let result;
    try {
      result = calculateDistribution(input);
    } catch (e) {
      if (e instanceof DistributionError) throw new DomainError(e.message);
      throw e;
    }

    const snapshot = {
      policyVersion: POLICY_VERSION,
      fingerprint: await ledgerFingerprint(tx, cycleId),
      rules: { id: rules.id, version: rules.version, contentHash: rules.contentHash, adminFeeBps: rules.adminFeeBps },
      input,
      result,
    };

    await tx.resultCalculation.updateMany({ where: { cycleId, status: "DRAFT" }, data: { status: "SUPERSEDED" } });
    const calc = await tx.resultCalculation.create({
      data: {
        cycleId,
        cycleRulesId: rules.id,
        cutoffDate: fromISODate(input.cutoffDate),
        revenueCents: input.revenueCents,
        expenseCents: input.expenseCents,
        taxCents: input.taxCents,
        netResultCents: result.netResultCents,
        adminFeeCents: result.adminFeeCents,
        // Prejuízo é guardado como 0 distribuível; o rateio fica nas participações (negativas).
        distributableCents: Math.max(0, result.distributableCents),
        availableCashCents: input.availableCashCents,
        inputSnapshot: JSON.parse(JSON.stringify(snapshot, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
        contentHash: sha256(snapshot),
        shares: {
          create: result.shares.map((s) => ({
            membershipId: s.membershipId,
            principalCents: s.principalCents,
            weight: s.weight,
            shareCents: s.shareCents,
          })),
        },
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "results.calculate",
        entityType: "ResultCalculation",
        entityId: calc.id,
        after: {
          netResultCents: result.netResultCents,
          adminFeeCents: result.adminFeeCents,
          distributableCents: result.distributableCents,
          contentHash: calc.contentHash,
        },
      },
      tx,
    );
    return calc;
  });
}

/** Aprova a apuração: torna-se imutável e o ciclo passa para distribuição. */
export async function approveResults(actor: CurrentUser, calculationId: string) {
  return db.$transaction(async (tx) => {
    const calc = await tx.resultCalculation.findUnique({ where: { id: calculationId } });
    if (!calc) throw new DomainError("Apuração não encontrada.");
    await lockCycle(tx, calc.cycleId);
    const cycle = await tx.cycle.findUniqueOrThrow({ where: { id: calc.cycleId } });
    if (calc.status !== "DRAFT") throw new DomainError("Somente uma apuração em rascunho pode ser aprovada.");
    if (cycle.status !== "CONTRIBUTIONS_CLOSED") throw new DomainError("O ciclo não está aguardando apuração.");

    const snapshot = calc.inputSnapshot as { fingerprint?: string };
    if (snapshot.fingerprint !== (await ledgerFingerprint(tx, calc.cycleId))) {
      throw new DomainError("Houve movimentações depois deste cálculo. Calcule novamente antes de aprovar.");
    }
    const pending = await pendingPaymentsCount(tx, calc.cycleId);
    if (pending > 0) throw new DomainError(`Há ${pending} pagamento(s) em análise. Resolva antes de aprovar.`);

    await tx.resultCalculation.update({
      where: { id: calculationId },
      data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() },
    });
    await tx.cycle.update({ where: { id: calc.cycleId }, data: { status: "SETTLING" } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "results.approve",
        entityType: "ResultCalculation",
        entityId: calculationId,
        after: { contentHash: calc.contentHash, netResultCents: calc.netResultCents },
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Distribuição e encerramento
// ---------------------------------------------------------------------------

/** Paga ao participante o principal + a participação (ou principal − prejuízo). */
export async function registerDistribution(
  actor: CurrentUser,
  input: { shareId: string; paidOn: ISODate; transactionRef: string | null },
  today: ISODate = todayInBrazil(),
) {
  if (input.paidOn > today) throw new DomainError("A data do pagamento não pode estar no futuro.");
  return db.$transaction(async (tx) => {
    const share = await tx.resultShare.findUnique({
      where: { id: input.shareId },
      include: { calculation: true, distribution: true },
    });
    if (!share) throw new DomainError("Participação não encontrada.");
    await lockCycle(tx, share.calculation.cycleId);
    if (share.calculation.status !== "APPROVED") throw new DomainError("A apuração ainda não foi aprovada.");
    if (share.distribution) throw new DomainError("Este participante já recebeu a distribuição.");
    const cycle = await tx.cycle.findUniqueOrThrow({ where: { id: share.calculation.cycleId } });
    if (cycle.status !== "SETTLING") throw new DomainError("O ciclo não está em distribuição.");

    const principal = await outstandingPrincipal(tx, share.membershipId);
    if (principal !== share.principalCents) {
      throw new DomainError("O principal mudou desde a apuração. Verifique o livro-caixa.");
    }
    const payout = share.principalCents + share.shareCents;
    const lines: LedgerLineInput[] = [];
    if (share.principalCents > 0) {
      lines.push({
        account: "PARTICIPANT_PRINCIPAL",
        amountCents: share.principalCents,
        membershipId: share.membershipId,
      });
    }
    if (share.shareCents !== 0) {
      // Débito (+) = resultado pago; crédito (−) = prejuízo absorvido pelo participante.
      lines.push({ account: "RESULT_TO_DISTRIBUTE", amountCents: share.shareCents, membershipId: share.membershipId });
    }
    if (payout > 0) lines.push({ account: "CASH", amountCents: -payout });

    const entry =
      lines.length >= 2
        ? await postEntry(tx, {
            cycleId: cycle.id,
            occurredOn: input.paidOn,
            category: "DISTRIBUTION",
            description: `Distribuição de encerramento (${formatBRL(payout)})`,
            lines,
            createdById: actor.userId,
          })
        : null;

    const distribution = await tx.distribution.create({
      data: {
        shareId: share.id,
        principalCents: share.principalCents,
        resultCents: share.shareCents,
        paidOn: fromISODate(input.paidOn),
        transactionRef: input.transactionRef,
        ledgerTransactionId: entry?.id ?? null,
        createdById: actor.userId,
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "results.distribute",
        entityType: "Distribution",
        entityId: distribution.id,
        after: {
          membershipId: share.membershipId,
          principalCents: share.principalCents,
          resultCents: share.shareCents,
          paidOn: input.paidOn,
        },
      },
      tx,
    );
    return distribution;
  });
}

/** Pagamento da remuneração administrativa — só com o recurso liberado após validação jurídica. */
export async function registerAdminFeePayment(
  actor: CurrentUser,
  input: { calculationId: string; paidOn: ISODate; transactionRef: string | null },
  today: ISODate = todayInBrazil(),
) {
  if (input.paidOn > today) throw new DomainError("A data do pagamento não pode estar no futuro.");
  return db.$transaction(async (tx) => {
    const flag = await tx.featureFlag.findUnique({ where: { key: "ADMIN_PAYOUT_ENABLED" } });
    if (!flag?.enabled) {
      throw new DomainError("Pagamento da remuneração administrativa desativado até validação jurídica e tributária.");
    }
    const calc = await tx.resultCalculation.findUnique({ where: { id: input.calculationId } });
    if (!calc || calc.status !== "APPROVED") throw new DomainError("Apuração aprovada não encontrada.");
    await lockCycle(tx, calc.cycleId);
    if (calc.adminFeeCents <= 0) throw new DomainError("Não há remuneração administrativa apurada neste ciclo.");
    const already = await tx.ledgerTransaction.count({ where: { cycleId: calc.cycleId, category: "ADMIN_FEE" } });
    if (already > 0) throw new DomainError("A remuneração administrativa deste ciclo já foi paga.");

    const entry = await postEntry(tx, {
      cycleId: calc.cycleId,
      occurredOn: input.paidOn,
      category: "ADMIN_FEE",
      description: `Remuneração administrativa (${formatBRL(calc.adminFeeCents)})${input.transactionRef ? ` — ${input.transactionRef}` : ""}`,
      lines: [
        { account: "ADMIN_FEE", amountCents: calc.adminFeeCents },
        { account: "CASH", amountCents: -calc.adminFeeCents },
      ],
      createdById: actor.userId,
    });
    await recordAudit(
      { actorId: actor.userId, action: "results.admin_fee_paid", entityType: "LedgerTransaction", entityId: entry.id },
      tx,
    );
    return entry;
  });
}

/** Encerra o ciclo quando todos os participantes já receberam. */
export async function closeCycle(actor: CurrentUser, cycleId: string) {
  return db.$transaction(async (tx) => {
    await lockCycle(tx, cycleId);
    const cycle = await tx.cycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new DomainError("Ciclo não encontrado.");
    if (cycle.status !== "SETTLING") throw new DomainError("Somente ciclos em distribuição podem ser encerrados.");
    const calc = await tx.resultCalculation.findFirst({
      where: { cycleId, status: "APPROVED" },
      include: { shares: { include: { distribution: { select: { id: true } } } } },
    });
    if (!calc) throw new DomainError("Apuração aprovada não encontrada.");
    const unpaid = calc.shares.filter((s) => !s.distribution).length;
    if (unpaid > 0) throw new DomainError(`Faltam ${unpaid} distribuição(ões) a registrar antes de encerrar.`);

    const remaining = await cashBalance(tx, cycleId);
    await tx.cycle.update({ where: { id: cycleId }, data: { status: "CLOSED", closedAt: new Date() } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "cycle.close",
        entityType: "Cycle",
        entityId: cycleId,
        after: { remainingCashCents: remaining },
      },
      tx,
    );
    return { remainingCashCents: remaining };
  });
}

// ---------------------------------------------------------------------------
// Saída no meio do ciclo, conciliação e correções
// ---------------------------------------------------------------------------

/** Devolve o principal a quem saiu do ciclo (regra 6.2). */
export async function returnPrincipal(
  actor: CurrentUser,
  input: { membershipId: string; paidOn: ISODate; transactionRef: string | null },
  today: ISODate = todayInBrazil(),
) {
  if (input.paidOn > today) throw new DomainError("A data da devolução não pode estar no futuro.");
  return db.$transaction(async (tx) => {
    const m = await tx.membership.findUnique({ where: { id: input.membershipId }, include: { cycle: true } });
    if (!m) throw new DomainError("Participação não encontrada.");
    await lockCycle(tx, m.cycleId);
    if (m.status !== "LEFT") throw new DomainError("Registre a saída do participante antes de devolver o principal.");
    if (m.cycle.status !== "OPEN" && m.cycle.status !== "CONTRIBUTIONS_CLOSED") {
      throw new DomainError("Após a apuração, o principal é pago na distribuição de encerramento.");
    }
    if (m.leftAt && input.paidOn < toISODate(m.leftAt))
      throw new DomainError("A devolução não pode ser anterior à saída.");
    const pending = await tx.payment.count({
      where: { membershipId: m.id, status: { in: ["PENDING", "UNDER_REVIEW"] } },
    });
    if (pending > 0)
      throw new DomainError("Há pagamentos deste participante em análise. Resolva-os antes da devolução.");
    const principal = await outstandingPrincipal(tx, m.id);
    if (principal <= 0) throw new DomainError("Não há principal a devolver.");

    const entry = await postEntry(tx, {
      cycleId: m.cycleId,
      occurredOn: input.paidOn,
      category: "PRINCIPAL_RETURN",
      description: `Devolução de principal por saída (${formatBRL(principal)})`,
      lines: [
        { account: "PARTICIPANT_PRINCIPAL", amountCents: principal, membershipId: m.id },
        { account: "CASH", amountCents: -principal },
      ],
      createdById: actor.userId,
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "membership.principal_return",
        entityType: "Membership",
        entityId: m.id,
        after: { amountCents: principal, paidOn: input.paidOn, transactionRef: input.transactionRef },
      },
      tx,
    );
    return { entry, amountCents: principal };
  });
}

/** Concilia o saldo contábil (livro-caixa) com o saldo do extrato bancário numa data. */
export async function reconcileCash(
  actor: CurrentUser,
  input: { cycleId: string; referenceDate: ISODate; statementBalanceCents: Cents; notes: string | null },
  today: ISODate = todayInBrazil(),
) {
  if (input.referenceDate > today) throw new DomainError("A data de referência não pode estar no futuro.");
  return db.$transaction(async (tx) => {
    const r = await tx.ledgerLine.aggregate({
      where: {
        account: "CASH",
        transaction: { cycleId: input.cycleId, occurredOn: { lte: fromISODate(input.referenceDate) } },
      },
      _sum: { amountCents: true },
    });
    const book = r._sum.amountCents ?? 0;
    const rec = await tx.cashReconciliation.create({
      data: {
        cycleId: input.cycleId,
        referenceDate: fromISODate(input.referenceDate),
        bookBalanceCents: book,
        statementBalanceCents: input.statementBalanceCents,
        differenceCents: input.statementBalanceCents - book,
        notes: input.notes,
        createdById: actor.userId,
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "ledger.reconcile",
        entityType: "CashReconciliation",
        entityId: rec.id,
        after: {
          referenceDate: input.referenceDate,
          book,
          statement: input.statementBalanceCents,
          difference: rec.differenceCents,
        },
      },
      tx,
    );
    return rec;
  });
}

/**
 * Correção depois do encerramento: lançamento marcado como pós-encerramento, com
 * justificativa obrigatória. NÃO altera a apuração aprovada (direitos já apurados).
 */
export async function postClosingAdjustment(
  actor: CurrentUser,
  input: {
    cycleId: string;
    kind: "REVENUE" | "EXPENSE";
    amountCents: Cents;
    occurredOn: ISODate;
    description: string;
    justification: string;
  },
) {
  if (input.justification.trim().length < 20) {
    throw new DomainError("Descreva a justificativa da correção com pelo menos 20 caracteres.");
  }
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findUnique({ where: { id: input.cycleId } });
    if (!cycle || cycle.status !== "CLOSED")
      throw new DomainError("Correções pós-encerramento são só para ciclos encerrados.");
    const entry = await postEntry(tx, {
      cycleId: input.cycleId,
      occurredOn: input.occurredOn,
      category: "ADJUSTMENT",
      description: `Correção pós-encerramento: ${input.description}`,
      lines: input.kind === "REVENUE" ? revenueLines(input.amountCents) : expenseLines(input.amountCents),
      createdById: actor.userId,
      postClosing: true,
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "ledger.post_closing",
        entityType: "LedgerTransaction",
        entityId: entry.id,
        after: { kind: input.kind, amountCents: input.amountCents, description: input.description },
        reason: input.justification,
      },
      tx,
    );
    return entry;
  });
}
