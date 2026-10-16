import "server-only";
import { createHash } from "node:crypto";
import { competenceOf, fromISODate, toISODate, todayInBrazil, type ISODate } from "@/domain/dates";
import { buildSchedule, monthlyAmount } from "@/domain/installments";
import { canonicalRules, defaultRulesText, type RulesContent } from "@/domain/rules";
import type { Cycle, CycleRules } from "@/generated/prisma/client";
import { db, lockCycle, type DbTransaction } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import type { CurrentUser } from "@/modules/auth/session";
import type { CycleInput } from "./schemas";

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

async function loadCycle(tx: DbTransaction, cycleId: string, caixinhaId?: string | null) {
  const cycle = await tx.cycle.findFirst({
    where: { id: cycleId, ...(caixinhaId ? { caixinhaId } : {}) },
    include: { rules: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!cycle) throw new DomainError("Ciclo não encontrado.");
  return { cycle, rules: cycle.rules[0] ?? null };
}

export function rulesContent(cycle: Cycle, rules: CycleRules): RulesContent {
  return {
    cycle: {
      name: cycle.name,
      startDate: toISODate(cycle.startDate),
      contributionEndDate: toISODate(cycle.contributionEndDate),
      settlementDate: toISODate(cycle.settlementDate),
      dueDay: cycle.dueDay,
    },
    rules: {
      version: rules.version,
      adminFeeBps: rules.adminFeeBps,
      distributionMethod: rules.distributionMethod,
      quotaValuesCents: rules.quotaValuesCents,
      rulesText: rules.rulesText,
    },
  };
}

export function rulesHash(content: RulesContent): string {
  return createHash("sha256").update(canonicalRules(content)).digest("hex");
}

function cycleData(input: CycleInput) {
  return {
    name: input.name,
    startDate: fromISODate(input.startDate),
    contributionEndDate: fromISODate(input.contributionEndDate),
    settlementDate: fromISODate(input.settlementDate),
    dueDay: input.dueDay,
  };
}

function rulesData(input: CycleInput) {
  return {
    adminFeeBps: input.adminFeePercent,
    quotaValuesCents: input.quotaValues,
    rulesText:
      input.rulesText ||
      defaultRulesText({
        startDate: input.startDate,
        contributionEndDate: input.contributionEndDate,
        settlementDate: input.settlementDate,
        dueDay: input.dueDay,
        adminFeeBps: input.adminFeePercent,
        quotaValuesCents: input.quotaValues,
      }),
  };
}

async function createInstallments(
  tx: DbTransaction,
  cycle: Cycle,
  membership: { id: string; quotaCount: number; quotaValueCents: number; joinedAt: Date },
) {
  const schedule = buildSchedule({
    cycleStart: toISODate(cycle.startDate),
    contributionEnd: toISODate(cycle.contributionEndDate),
    dueDay: cycle.dueDay,
    joinedAt: toISODate(membership.joinedAt),
    monthlyCents: monthlyAmount(membership.quotaCount, membership.quotaValueCents),
  });
  if (schedule.length === 0) return 0;
  await tx.installment.createMany({
    data: schedule.map((s) => ({
      membershipId: membership.id,
      competence: s.competence,
      dueDate: fromISODate(s.dueDate),
      expectedCents: s.expectedCents,
    })),
  });
  return schedule.length;
}

// ---------------------------------------------------------------------------
// Ciclo e regras
// ---------------------------------------------------------------------------

export async function createCycle(actor: CurrentUser, input: CycleInput) {
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.create({ data: { ...cycleData(input), caixinhaId: actor.caixinhaId ?? null } });
    const rules = await tx.cycleRules.create({ data: { cycleId: cycle.id, version: 1, ...rulesData(input) } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "cycle.create",
        entityType: "Cycle",
        entityId: cycle.id,
        after: rulesContent(cycle, rules),
      },
      tx,
    );
    return cycle;
  });
}

/** Edita datas e regras. Permitido apenas antes da publicação das regras. */
export async function updateCycle(actor: CurrentUser, cycleId: string, input: CycleInput) {
  return db.$transaction(async (tx) => {
    const { cycle, rules } = await loadCycle(tx, cycleId, actor.caixinhaId);
    if (cycle.status !== "DRAFT") throw new DomainError("Somente ciclos em preparação podem ser editados.");
    if (rules?.frozenAt) throw new DomainError("As regras já foram publicadas e estão congeladas.");

    const updated = await tx.cycle.update({ where: { id: cycleId }, data: cycleData(input) });
    const newRules = rules
      ? await tx.cycleRules.update({ where: { id: rules.id }, data: rulesData(input) })
      : await tx.cycleRules.create({ data: { cycleId, version: 1, ...rulesData(input) } });

    // Mudança de valores de cota não pode deixar participações com valor inválido.
    const invalid = await tx.membership.count({
      where: { cycleId, quotaValueCents: { notIn: newRules.quotaValuesCents } },
    });
    if (invalid > 0) {
      throw new DomainError(`${invalid} participação(ões) usam um valor de cota que foi removido. Ajuste-as antes.`);
    }

    await recordAudit(
      {
        actorId: actor.userId,
        action: "cycle.update",
        entityType: "Cycle",
        entityId: cycleId,
        before: rules ? rulesContent(cycle, rules) : null,
        after: rulesContent(updated, newRules),
      },
      tx,
    );
    return updated;
  });
}

/**
 * Publica (congela) as regras: a partir daqui datas, percentuais, cotas e texto
 * ficam imutáveis e os participantes podem registrar o aceite.
 */
export async function publishRules(actor: CurrentUser, cycleId: string) {
  return db.$transaction(async (tx) => {
    const { cycle, rules } = await loadCycle(tx, cycleId, actor.caixinhaId);
    if (cycle.status !== "DRAFT") throw new DomainError("Somente ciclos em preparação podem ter regras publicadas.");
    if (!rules) throw new DomainError("Defina as regras do ciclo antes de publicar.");
    if (rules.frozenAt) throw new DomainError("As regras já foram publicadas.");
    if (rules.quotaValuesCents.length === 0) throw new DomainError("Defina ao menos um valor de cota.");

    const contentHash = rulesHash(rulesContent(cycle, rules));
    await tx.cycleRules.update({ where: { id: rules.id }, data: { frozenAt: new Date(), contentHash } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "cycle.publish_rules",
        entityType: "CycleRules",
        entityId: rules.id,
        after: { version: rules.version, contentHash },
      },
      tx,
    );
    return contentHash;
  });
}

/** Abre o ciclo: gera as parcelas previstas de todas as participações ativas. */
export async function openCycle(actor: CurrentUser, cycleId: string) {
  return db.$transaction(async (tx) => {
    await lockCycle(tx, cycleId);
    const { cycle, rules } = await loadCycle(tx, cycleId, actor.caixinhaId);
    if (cycle.status !== "DRAFT") throw new DomainError("Este ciclo já foi aberto.");
    if (!rules?.frozenAt) throw new DomainError("Publique as regras antes de abrir o ciclo.");

    const memberships = await tx.membership.findMany({ where: { cycleId, status: "ACTIVE" } });
    if (memberships.length === 0) throw new DomainError("Inclua ao menos um participante antes de abrir o ciclo.");

    let installments = 0;
    for (const m of memberships) installments += await createInstallments(tx, cycle, m);

    await tx.cycle.update({ where: { id: cycleId }, data: { status: "OPEN", openedAt: new Date() } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "cycle.open",
        entityType: "Cycle",
        entityId: cycleId,
        after: { memberships: memberships.length, installments },
      },
      tx,
    );
    return { memberships: memberships.length, installments };
  });
}

/** Encerra o período de contribuições (após a data prevista). */
export async function closeContributions(actor: CurrentUser, cycleId: string, today: ISODate = todayInBrazil()) {
  return db.$transaction(async (tx) => {
    const { cycle } = await loadCycle(tx, cycleId, actor.caixinhaId);
    if (cycle.status !== "OPEN") throw new DomainError("Somente ciclos abertos podem encerrar contribuições.");
    if (today <= toISODate(cycle.contributionEndDate)) {
      throw new DomainError("As contribuições só podem ser encerradas após a data de fim das contribuições.");
    }
    await tx.cycle.update({ where: { id: cycleId }, data: { status: "CONTRIBUTIONS_CLOSED" } });
    await recordAudit(
      { actorId: actor.userId, action: "cycle.close_contributions", entityType: "Cycle", entityId: cycleId },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Participações (participante × ciclo)
// ---------------------------------------------------------------------------

export async function addMembership(
  actor: CurrentUser,
  cycleId: string,
  input: { participantId: string; quotaCount: number; quotaValueCents: number; joinedAt: ISODate },
) {
  try {
    return await db.$transaction(async (tx) => {
      await lockCycle(tx, cycleId);
      const { cycle, rules } = await loadCycle(tx, cycleId, actor.caixinhaId);
      if (cycle.status !== "DRAFT" && cycle.status !== "OPEN") {
        throw new DomainError("Não é possível incluir participantes neste ciclo.");
      }
      if (!rules?.quotaValuesCents.includes(input.quotaValueCents)) {
        throw new DomainError("Valor de cota não previsto nas regras do ciclo.");
      }
      if (input.joinedAt > toISODate(cycle.contributionEndDate)) {
        throw new DomainError("A data de entrada é posterior ao fim das contribuições.");
      }
      const participant = await tx.participant.findFirst({
        where: { id: input.participantId, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
      });
      if (!participant || participant.status !== "ACTIVE")
        throw new DomainError("Participante inexistente ou inativo.");

      const membership = await tx.membership.create({
        data: {
          cycleId,
          participantId: input.participantId,
          quotaCount: input.quotaCount,
          quotaValueCents: input.quotaValueCents,
          joinedAt: fromISODate(input.joinedAt),
        },
      });
      // Entrada com o ciclo já aberto: parcelas geradas na hora.
      const installments = cycle.status === "OPEN" ? await createInstallments(tx, cycle, membership) : 0;

      await recordAudit(
        {
          actorId: actor.userId,
          action: "membership.create",
          entityType: "Membership",
          entityId: membership.id,
          after: { ...input, cycleId, installments },
        },
        tx,
      );
      return membership;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("Este participante já está neste ciclo.");
    throw e;
  }
}

/** Ajuste livre de cotas enquanto o ciclo está em preparação. */
export async function updateDraftMembership(
  actor: CurrentUser,
  membershipId: string,
  input: { quotaCount: number; quotaValueCents: number; joinedAt: ISODate },
) {
  return db.$transaction(async (tx) => {
    const m = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!m) throw new DomainError("Participação não encontrada.");
    const { cycle, rules } = await loadCycle(tx, m.cycleId, actor.caixinhaId);
    if (cycle.status !== "DRAFT")
      throw new DomainError("Com o ciclo aberto, use a alteração de cotas com data de vigência.");
    if (!rules?.quotaValuesCents.includes(input.quotaValueCents)) {
      throw new DomainError("Valor de cota não previsto nas regras do ciclo.");
    }
    const after = await tx.membership.update({
      where: { id: membershipId },
      data: {
        quotaCount: input.quotaCount,
        quotaValueCents: input.quotaValueCents,
        joinedAt: fromISODate(input.joinedAt),
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "membership.update",
        entityType: "Membership",
        entityId: membershipId,
        before: { quotaCount: m.quotaCount, quotaValueCents: m.quotaValueCents, joinedAt: toISODate(m.joinedAt) },
        after: input,
      },
      tx,
    );
    return after;
  });
}

/** Remove participação de ciclo em preparação (ainda não há parcelas nem pagamentos). */
export async function removeDraftMembership(actor: CurrentUser, membershipId: string) {
  return db.$transaction(async (tx) => {
    const m = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!m) throw new DomainError("Participação não encontrada.");
    const { cycle } = await loadCycle(tx, m.cycleId, actor.caixinhaId);
    if (cycle.status !== "DRAFT") throw new DomainError("Com o ciclo aberto, registre a saída do participante.");
    await tx.membership.delete({ where: { id: membershipId } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "membership.remove",
        entityType: "Membership",
        entityId: membershipId,
        before: { participantId: m.participantId, quotaCount: m.quotaCount, quotaValueCents: m.quotaValueCents },
      },
      tx,
    );
  });
}

/**
 * Alteração de cotas com o ciclo aberto. Vale a partir de uma competência que
 * ainda não venceu; parcelas anteriores (passado) não mudam.
 */
export async function changeQuotas(
  actor: CurrentUser,
  membershipId: string,
  input: { quotaCount: number; quotaValueCents: number; effectiveFrom: string; reason: string },
  today: ISODate = todayInBrazil(),
) {
  return db.$transaction(async (tx) => {
    const m = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!m) throw new DomainError("Participação não encontrada.");
    await lockCycle(tx, m.cycleId);
    const { cycle, rules } = await loadCycle(tx, m.cycleId, actor.caixinhaId);
    if (cycle.status !== "OPEN") throw new DomainError("Alteração de cotas só é possível com o ciclo aberto.");
    if (m.status !== "ACTIVE") throw new DomainError("Participação encerrada.");
    if (!rules?.quotaValuesCents.includes(input.quotaValueCents)) {
      throw new DomainError("Valor de cota não previsto nas regras do ciclo.");
    }
    if (input.quotaCount === m.quotaCount && input.quotaValueCents === m.quotaValueCents) {
      throw new DomainError("As cotas informadas são iguais às atuais.");
    }

    // A primeira parcela afetada não pode estar vencida.
    const first = await tx.installment.findFirst({
      where: { membershipId, competence: { gte: input.effectiveFrom }, cancelledAt: null },
      orderBy: { competence: "asc" },
    });
    if (!first) throw new DomainError("Não há parcelas a partir desta competência.");
    if (toISODate(first.dueDate) < today) {
      throw new DomainError("A alteração só pode valer a partir de uma parcela que ainda não venceu.");
    }

    const newMonthly = monthlyAmount(input.quotaCount, input.quotaValueCents);
    const updated = await tx.installment.updateMany({
      where: { membershipId, competence: { gte: input.effectiveFrom }, cancelledAt: null },
      data: { expectedCents: newMonthly },
    });
    await tx.membership.update({
      where: { id: membershipId },
      data: { quotaCount: input.quotaCount, quotaValueCents: input.quotaValueCents },
    });
    await tx.membershipChange.create({
      data: {
        membershipId,
        previousQuotaCount: m.quotaCount,
        newQuotaCount: input.quotaCount,
        previousQuotaValueCts: m.quotaValueCents,
        newQuotaValueCts: input.quotaValueCents,
        effectiveFrom: first.dueDate,
        reason: input.reason,
        changedById: actor.userId,
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "membership.change_quotas",
        entityType: "Membership",
        entityId: membershipId,
        before: { quotaCount: m.quotaCount, quotaValueCents: m.quotaValueCents },
        after: {
          quotaCount: input.quotaCount,
          quotaValueCents: input.quotaValueCents,
          effectiveFrom: input.effectiveFrom,
          installmentsUpdated: updated.count,
        },
        reason: input.reason,
      },
      tx,
    );
    return updated.count;
  });
}

/**
 * Saída no meio do ciclo: parcelas de competências posteriores à saída deixam de
 * ser devidas (canceladas, nunca apagadas). Devolução de valores e participação
 * em resultados seguem as regras a definir (Fase 4).
 */
export async function leaveCycle(actor: CurrentUser, membershipId: string, input: { leftAt: ISODate; reason: string }) {
  return db.$transaction(async (tx) => {
    const m = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!m) throw new DomainError("Participação não encontrada.");
    const { cycle } = await loadCycle(tx, m.cycleId, actor.caixinhaId);
    if (cycle.status !== "OPEN") throw new DomainError("Registro de saída só é possível com o ciclo aberto.");
    if (m.status !== "ACTIVE") throw new DomainError("Esta participação já foi encerrada.");
    if (input.leftAt < toISODate(m.joinedAt)) throw new DomainError("A saída não pode ser anterior à entrada.");

    const cancelled = await tx.installment.updateMany({
      where: { membershipId, competence: { gt: competenceOf(input.leftAt) }, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelReason: `Saída do participante: ${input.reason}` },
    });
    await tx.membership.update({
      where: { id: membershipId },
      data: { status: "LEFT", leftAt: fromISODate(input.leftAt) },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "membership.leave",
        entityType: "Membership",
        entityId: membershipId,
        after: { leftAt: input.leftAt, installmentsCancelled: cancelled.count },
        reason: input.reason,
      },
      tx,
    );
    return cancelled.count;
  });
}

/** Aceite das regras pelo próprio participante. */
export async function acceptRules(actor: CurrentUser, cycleId: string) {
  if (!actor.participantId) throw new DomainError("Seu acesso não está vinculado a um cadastro de participante.");
  const participantId = actor.participantId;
  return db.$transaction(async (tx) => {
    const { rules } = await loadCycle(tx, cycleId, actor.caixinhaId);
    if (!rules?.frozenAt) throw new DomainError("As regras deste ciclo ainda não foram publicadas.");
    const membership = await tx.membership.findUnique({ where: { participantId_cycleId: { participantId, cycleId } } });
    if (!membership) throw new DomainError("Você não participa deste ciclo.");

    const existing = await tx.rulesAcceptance.findUnique({
      where: { cycleRulesId_participantId: { cycleRulesId: rules.id, participantId } },
    });
    if (existing) return existing;

    const acceptance = await tx.rulesAcceptance.create({ data: { cycleRulesId: rules.id, participantId } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "rules.accept",
        entityType: "CycleRules",
        entityId: rules.id,
        after: { participantId, contentHash: rules.contentHash },
      },
      tx,
    );
    return acceptance;
  });
}
