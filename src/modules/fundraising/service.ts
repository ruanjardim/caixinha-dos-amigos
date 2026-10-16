import "server-only";
import { randomInt } from "node:crypto";
import { fromISODate, todayInBrazil, type ISODate } from "@/domain/dates";
import {
  canRecordMoney,
  checkRaffleAuthorization,
  formatRaffleNumber,
  FundraisingError,
  initialComplianceStatus,
  simulateDraw,
  validateNumberRange,
} from "@/domain/fundraising";
import { expenseLines, revenueLines } from "@/domain/ledger";
import { formatBRL, type Cents } from "@/domain/money";
import type { FundraisingActivity } from "@/generated/prisma/client";
import { db, lockCycle, type DbTransaction } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/audit";
import type { CurrentUser } from "@/modules/auth/session";
import { saveUpload } from "@/modules/files/service";
import { postEntry } from "@/modules/ledger/service";
import type { ActivityInput } from "./schemas";

function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof FundraisingError) throw new DomainError(e.message);
    throw e;
  }
}

async function loadActivity(tx: DbTransaction, activityId: string, caixinhaId?: string | null) {
  const a = await tx.fundraisingActivity.findFirst({
    where: { id: activityId, ...(caixinhaId ? { cycle: { caixinhaId } } : {}) },
    include: { cycle: { select: { status: true } } },
  });
  if (!a) throw new DomainError("Atividade não encontrada.");
  return a;
}

function assertEditable(a: Pick<FundraisingActivity, "status">) {
  if (a.status === "FINISHED" || a.status === "CANCELLED")
    throw new DomainError("Atividade encerrada ou cancelada não pode ser alterada.");
}

async function salesFlag(tx: DbTransaction) {
  return Boolean((await tx.featureFlag.findUnique({ where: { key: "RAFFLE_SALES_ENABLED" } }))?.enabled);
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

function validateRaffleFields(input: ActivityInput) {
  if (input.type !== "RAFFLE") return;
  if (input.numberRangeStart !== null && input.numberRangeEnd !== null) {
    domain(() => validateNumberRange(input.numberRangeStart!, input.numberRangeEnd!));
  }
}

export async function createActivity(actor: CurrentUser, input: ActivityInput) {
  validateRaffleFields(input);
  return db.$transaction(async (tx) => {
    const cycle = await tx.cycle.findFirst({
      where: { id: input.cycleId, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
    });
    if (!cycle) throw new DomainError("Ciclo não encontrado.");
    if (cycle.status === "CLOSED") throw new DomainError("Ciclo encerrado não recebe novas atividades.");
    const isRaffle = input.type === "RAFFLE";
    const activity = await tx.fundraisingActivity.create({
      data: {
        cycleId: input.cycleId,
        type: input.type,
        title: input.title,
        description: input.description,
        startsOn: input.startsOn ? fromISODate(input.startsOn) : null,
        endsOn: input.endsOn ? fromISODate(input.endsOn) : null,
        complianceStatus: initialComplianceStatus(input.type),
        simulationOnly: true,
        numberRangeStart: isRaffle ? input.numberRangeStart : null,
        numberRangeEnd: isRaffle ? input.numberRangeEnd : null,
        unitPriceCents: isRaffle ? input.unitPriceCents : null,
        promotionRules: input.promotionRules,
        createdById: actor.userId,
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.create",
        entityType: "FundraisingActivity",
        entityId: activity.id,
        after: input,
      },
      tx,
    );
    return activity;
  });
}

export async function updateActivity(actor: CurrentUser, activityId: string, input: ActivityInput) {
  validateRaffleFields(input);
  return db.$transaction(async (tx) => {
    const before = await loadActivity(tx, activityId, actor.caixinhaId);
    assertEditable(before);
    if (before.type !== input.type)
      throw new DomainError("O tipo da atividade não pode ser trocado; crie outra atividade.");
    const numbers = await tx.raffleNumber.count({ where: { activityId } });
    const rangeChanged =
      before.numberRangeStart !== input.numberRangeStart || before.numberRangeEnd !== input.numberRangeEnd;
    if (numbers > 0 && rangeChanged) throw new DomainError("A numeração já foi gerada: a faixa não pode mudar.");
    if (
      !before.simulationOnly &&
      (before.unitPriceCents !== input.unitPriceCents || before.promotionRules !== input.promotionRules)
    ) {
      throw new DomainError("Sorteio autorizado: preço e regulamento ficam congelados.");
    }

    // Mudou o que foi analisado (regulamento/preço/faixa)? O parecer precisa ser refeito.
    const reviewedFieldsChanged =
      before.promotionRules !== input.promotionRules || before.unitPriceCents !== input.unitPriceCents || rangeChanged;
    const complianceStatus =
      before.type === "RAFFLE" && before.complianceStatus === "APPROVED" && reviewedFieldsChanged
        ? "PENDING_REVIEW"
        : before.complianceStatus;

    const after = await tx.fundraisingActivity.update({
      where: { id: activityId },
      data: {
        title: input.title,
        description: input.description,
        startsOn: input.startsOn ? fromISODate(input.startsOn) : null,
        endsOn: input.endsOn ? fromISODate(input.endsOn) : null,
        numberRangeStart: before.type === "RAFFLE" ? input.numberRangeStart : null,
        numberRangeEnd: before.type === "RAFFLE" ? input.numberRangeEnd : null,
        unitPriceCents: before.type === "RAFFLE" ? input.unitPriceCents : null,
        promotionRules: input.promotionRules,
        complianceStatus,
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.update",
        entityType: "FundraisingActivity",
        entityId: activityId,
        before: {
          title: before.title,
          promotionRules: before.promotionRules,
          unitPriceCents: before.unitPriceCents,
          complianceStatus: before.complianceStatus,
        },
        after: {
          title: after.title,
          promotionRules: after.promotionRules,
          unitPriceCents: after.unitPriceCents,
          complianceStatus: after.complianceStatus,
        },
      },
      tx,
    );
    return after;
  });
}

const STATUS_FLOW: Record<string, string[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["FINISHED", "CANCELLED"],
  FINISHED: [],
  CANCELLED: [],
};

export async function setActivityStatus(
  actor: CurrentUser,
  activityId: string,
  status: "PLANNED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED",
) {
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, activityId, actor.caixinhaId);
    if (!STATUS_FLOW[a.status].includes(status)) throw new DomainError("Mudança de situação não permitida.");
    if (status === "CANCELLED" && !a.simulationOnly) {
      const sold = await tx.raffleNumber.count({ where: { activityId, status: "CONFIRMED" } });
      if (sold > 0) throw new DomainError("Há números pagos: registre as devoluções antes de cancelar.");
    }
    await tx.fundraisingActivity.update({ where: { id: activityId }, data: { status } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.status",
        entityType: "FundraisingActivity",
        entityId: activityId,
        before: { status: a.status },
        after: { status },
      },
      tx,
    );
  });
}

export async function addPrize(
  actor: CurrentUser,
  input: { activityId: string; name: string; description: string | null; costCents: Cents | null; position: number },
) {
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, input.activityId, actor.caixinhaId);
    assertEditable(a);
    if (a.drawnAt) throw new DomainError("Resultado já registrado: prêmios não podem mudar.");
    const prize = await tx.prize.create({
      data: {
        activityId: a.id,
        name: input.name,
        description: input.description,
        costCents: input.costCents ?? 0,
        position: input.position,
      },
    });
    await recordAudit(
      { actorId: actor.userId, action: "fundraising.prize_add", entityType: "Prize", entityId: prize.id, after: input },
      tx,
    );
    return prize;
  });
}

export async function removePrize(actor: CurrentUser, prizeId: string) {
  return db.$transaction(async (tx) => {
    const prize = await tx.prize.findUnique({ where: { id: prizeId } });
    if (!prize) throw new DomainError("Prêmio não encontrado.");
    const a = await loadActivity(tx, prize.activityId, actor.caixinhaId);
    assertEditable(a);
    if (a.drawnAt) throw new DomainError("Resultado já registrado: prêmios não podem mudar.");
    await tx.prize.delete({ where: { id: prizeId } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.prize_remove",
        entityType: "Prize",
        entityId: prizeId,
        before: prize,
      },
      tx,
    );
  });
}

export async function addActivityImage(actor: CurrentUser, activityId: string, file: unknown, caption: string | null) {
  const a = await db.fundraisingActivity.findFirst({
    where: { id: activityId, ...(actor.caixinhaId ? { cycle: { caixinhaId: actor.caixinhaId } } : {}) },
  });
  if (!a) throw new DomainError("Atividade não encontrada.");
  assertEditable(a);
  const upload = await saveUpload(file, actor.userId);
  if (!upload) throw new DomainError("Escolha uma imagem.");
  if (!upload.contentType.startsWith("image/")) throw new DomainError("Envie uma imagem (PNG, JPG ou WEBP).");
  const image = await db.activityImage.create({ data: { activityId, fileId: upload.id, caption } });
  await recordAudit({
    actorId: actor.userId,
    action: "fundraising.image_add",
    entityType: "ActivityImage",
    entityId: image.id,
  });
  return image;
}

export async function removeActivityImage(actor: CurrentUser, imageId: string) {
  const image = await db.activityImage.findFirst({
    where: {
      id: imageId,
      ...(actor.caixinhaId ? { activity: { cycle: { caixinhaId: actor.caixinhaId } } } : {}),
    },
  });
  if (!image) throw new DomainError("Imagem não encontrada.");
  await db.activityImage.delete({ where: { id: imageId } });
  await recordAudit({
    actorId: actor.userId,
    action: "fundraising.image_remove",
    entityType: "ActivityImage",
    entityId: imageId,
  });
}

export async function addActivityParticipant(
  actor: CurrentUser,
  input: { activityId: string; participantId: string; role: string | null },
) {
  try {
    return await db.$transaction(async (tx) => {
      const a = await loadActivity(tx, input.activityId, actor.caixinhaId);
      assertEditable(a);
      const p = await tx.participant.findFirst({
        where: { id: input.participantId, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
      });
      if (!p || p.status !== "ACTIVE") throw new DomainError("Participante inexistente ou inativo.");
      const row = await tx.activityParticipant.create({ data: input });
      await recordAudit(
        {
          actorId: actor.userId,
          action: "fundraising.participant_add",
          entityType: "ActivityParticipant",
          entityId: row.id,
          after: input,
        },
        tx,
      );
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("Este participante já está na atividade.");
    throw e;
  }
}

export async function removeActivityParticipant(actor: CurrentUser, id: string) {
  const row = await db.activityParticipant.findFirst({
    where: {
      id,
      ...(actor.caixinhaId ? { activity: { cycle: { caixinhaId: actor.caixinhaId } } } : {}),
    },
  });
  if (!row) throw new DomainError("Registro não encontrado.");
  await db.activityParticipant.delete({ where: { id } });
  await recordAudit({
    actorId: actor.userId,
    action: "fundraising.participant_remove",
    entityType: "ActivityParticipant",
    entityId: id,
    before: row,
  });
}

// ---------------------------------------------------------------------------
// Conformidade
// ---------------------------------------------------------------------------

export async function decideCompliance(
  actor: CurrentUser,
  input: {
    activityId: string;
    legalModality: string;
    authorization: string | null;
    legalOpinion: string;
    decision: "APPROVED" | "REJECTED";
  },
  documentFile?: unknown,
) {
  const document = documentFile ? await saveUpload(documentFile, actor.userId) : null;
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, input.activityId, actor.caixinhaId);
    assertEditable(a);
    if (
      input.decision === "APPROVED" &&
      a.type === "RAFFLE" &&
      (!a.promotionRules || a.promotionRules.trim().length < 50)
    ) {
      throw new DomainError("Escreva o regulamento da promoção antes de aprovar.");
    }
    const approval = await tx.complianceApproval.create({
      data: {
        activityId: a.id,
        legalModality: input.legalModality,
        authorization: input.authorization,
        legalOpinion: input.legalOpinion,
        documentFileId: document?.id ?? null,
        decision: input.decision,
        decidedById: actor.userId,
      },
    });
    await tx.fundraisingActivity.update({ where: { id: a.id }, data: { complianceStatus: input.decision } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "compliance.decide",
        entityType: "FundraisingActivity",
        entityId: a.id,
        before: { complianceStatus: a.complianceStatus },
        after: {
          complianceStatus: input.decision,
          legalModality: input.legalModality,
          authorization: input.authorization,
        },
        reason: input.legalOpinion,
      },
      tx,
    );
    return approval;
  });
}

export const FLAG_CONFIRMATION_PHRASE = "ATIVAR";

/** Liga/desliga recursos sensíveis. Ligar exige justificativa longa e confirmação digitada. */
export async function setFeatureFlag(
  actor: CurrentUser,
  input: {
    key: "RAFFLE_SALES_ENABLED" | "PIX_LIVE_ENABLED" | "ADMIN_PAYOUT_ENABLED";
    enable: boolean;
    justification: string;
    confirmation?: string;
  },
) {
  if (input.enable) {
    if (input.justification.trim().length < 30)
      throw new DomainError("Justifique a ativação com ao menos 30 caracteres (base legal, parecer).");
    if ((input.confirmation ?? "").trim().toUpperCase() !== FLAG_CONFIRMATION_PHRASE) {
      throw new DomainError(`Digite ${FLAG_CONFIRMATION_PHRASE} para confirmar a ativação.`);
    }
  } else if (input.justification.trim().length < 10) {
    throw new DomainError("Informe o motivo da desativação.");
  }
  return db.$transaction(async (tx) => {
    const before = await tx.featureFlag.findUnique({ where: { key: input.key } });
    const after = await tx.featureFlag.upsert({
      where: { key: input.key },
      update: { enabled: input.enable, justification: input.justification, updatedById: actor.userId },
      create: { key: input.key, enabled: input.enable, justification: input.justification, updatedById: actor.userId },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: input.enable ? "compliance.flag_on" : "compliance.flag_off",
        entityType: "FeatureFlag",
        entityId: input.key,
        before: { enabled: before?.enabled ?? false },
        after: { enabled: after.enabled },
        reason: input.justification,
      },
      tx,
    );
    return after;
  });
}

/** Ativa o modo AUTORIZADO (venda real) — somente com todas as condições cumpridas. */
export async function activateAuthorizedMode(actor: CurrentUser, activityId: string) {
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, activityId, actor.caixinhaId);
    assertEditable(a);
    const check = checkRaffleAuthorization({
      type: a.type,
      complianceStatus: a.complianceStatus,
      salesFlagEnabled: await salesFlag(tx),
      promotionRules: a.promotionRules,
      numbersGenerated: (await tx.raffleNumber.count({ where: { activityId } })) > 0,
    });
    if (!check.ok) throw new DomainError(check.reasons.join(" "));
    if (!a.unitPriceCents || a.numberRangeStart === null || a.numberRangeEnd === null) {
      throw new DomainError("Defina faixa de números e preço por número.");
    }
    await tx.fundraisingActivity.update({ where: { id: activityId }, data: { simulationOnly: false } });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.authorized_mode",
        entityType: "FundraisingActivity",
        entityId: activityId,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Numeração (sorteios)
// ---------------------------------------------------------------------------

export async function generateNumbers(actor: CurrentUser, activityId: string) {
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, activityId, actor.caixinhaId);
    assertEditable(a);
    if (a.type !== "RAFFLE") throw new DomainError("Somente sorteios têm numeração.");
    if (a.numberRangeStart === null || a.numberRangeEnd === null) throw new DomainError("Defina a faixa de números.");
    domain(() => validateNumberRange(a.numberRangeStart!, a.numberRangeEnd!));
    if ((await tx.raffleNumber.count({ where: { activityId } })) > 0)
      throw new DomainError("A numeração já foi gerada.");
    const data = [];
    for (let n = a.numberRangeStart; n <= a.numberRangeEnd; n++)
      data.push({ activityId, number: n, isSimulation: a.simulationOnly });
    await tx.raffleNumber.createMany({ data });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.numbers",
        entityType: "FundraisingActivity",
        entityId: activityId,
        after: { count: data.length, simulation: a.simulationOnly },
      },
      tx,
    );
    return data.length;
  });
}

async function loadNumber(tx: DbTransaction, activityId: string, number: number) {
  const row = await tx.raffleNumber.findUnique({ where: { activityId_number: { activityId, number } } });
  if (!row) throw new DomainError("Número não encontrado nesta atividade.");
  return row;
}

function assertNumbersOpen(a: { status: string; drawnAt: Date | null }) {
  if (a.status !== "PLANNED" && a.status !== "IN_PROGRESS")
    throw new DomainError("A atividade precisa estar planejada ou em andamento.");
  if (a.drawnAt) throw new DomainError("Resultado já registrado.");
}

export async function reserveNumber(
  actor: CurrentUser,
  input: { activityId: string; number: number; participantId: string },
) {
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, input.activityId, actor.caixinhaId);
    assertNumbersOpen(a);
    const p = await tx.participant.findFirst({
      where: { id: input.participantId, ...(actor.caixinhaId ? { caixinhaId: actor.caixinhaId } : {}) },
    });
    if (!p || p.status !== "ACTIVE") throw new DomainError("Participante inexistente ou inativo.");
    const changed = await tx.raffleNumber.updateMany({
      where: { activityId: input.activityId, number: input.number, status: "AVAILABLE" },
      data: { status: "RESERVED", participantId: input.participantId, reservedAt: new Date() },
    });
    if (changed.count !== 1) throw new DomainError("Este número não está disponível.");
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.number_reserve",
        entityType: "FundraisingActivity",
        entityId: a.id,
        after: { number: input.number, participantId: input.participantId, simulation: a.simulationOnly },
      },
      tx,
    );
  });
}

export async function releaseNumber(actor: CurrentUser, input: { activityId: string; number: number }) {
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, input.activityId, actor.caixinhaId);
    assertNumbersOpen(a);
    const changed = await tx.raffleNumber.updateMany({
      where: { activityId: input.activityId, number: input.number, status: "RESERVED" },
      data: { status: "AVAILABLE", participantId: null, reservedAt: null },
    });
    if (changed.count !== 1) throw new DomainError("Somente números reservados podem ser liberados.");
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.number_release",
        entityType: "FundraisingActivity",
        entityId: a.id,
        after: { number: input.number },
      },
      tx,
    );
  });
}

/**
 * Confirma o pagamento de um número reservado.
 * - Simulação: apenas marca como confirmado (nenhum dinheiro, nada no livro-caixa).
 * - Autorizado: exige identificação da transação (única na atividade) e lança a receita.
 */
export async function confirmNumber(
  actor: CurrentUser,
  input: { activityId: string; number: number; paidOn: ISODate; transactionRef: string | null },
  today: ISODate = todayInBrazil(),
) {
  if (input.paidOn > today) throw new DomainError("A data do pagamento não pode estar no futuro.");
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, input.activityId, actor.caixinhaId);
    assertNumbersOpen(a);
    const row = await loadNumber(tx, a.id, input.number);
    if (row.status !== "RESERVED") throw new DomainError("Somente números reservados podem ser confirmados.");

    let ledgerTransactionId: string | null = null;
    if (!row.isSimulation) {
      if (a.simulationOnly) throw new DomainError("Atividade em simulação.");
      if (!(await salesFlag(tx))) throw new DomainError("Venda de números desligada na Conformidade.");
      if (!input.transactionRef) throw new DomainError("Informe a identificação da transação do pagamento.");
      const dup = await tx.raffleNumber.findFirst({
        where: { activityId: a.id, transactionRef: input.transactionRef },
      });
      if (dup) throw new DomainError(`Esta transação já foi usada no número ${dup.number}.`);
      await lockCycle(tx, a.cycleId);
      const entry = await postEntry(tx, {
        cycleId: a.cycleId,
        occurredOn: input.paidOn,
        category: "ADDITIONAL_REVENUE",
        description: `${a.title}: número ${formatRaffleNumber(row.number, a.numberRangeEnd ?? row.number)} (${formatBRL(a.unitPriceCents ?? 0)})`,
        lines: revenueLines(a.unitPriceCents ?? 0),
        createdById: actor.userId,
        activityId: a.id,
      });
      ledgerTransactionId = entry.id;
    }

    const changed = await tx.raffleNumber.updateMany({
      where: { id: row.id, status: "RESERVED" },
      data: { status: "CONFIRMED", confirmedAt: new Date(), transactionRef: input.transactionRef, ledgerTransactionId },
    });
    if (changed.count !== 1) throw new DomainError("Este número já foi confirmado.");
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.number_confirm",
        entityType: "FundraisingActivity",
        entityId: a.id,
        after: { number: row.number, simulation: row.isSimulation, transactionRef: input.transactionRef },
      },
      tx,
    );
  });
}

/** Sorteio SIMULADO: nunca é o resultado oficial e não é gravado na atividade. */
export async function runSimulatedDraw(actor: CurrentUser, activityId: string) {
  const a = await db.fundraisingActivity.findFirst({
    where: { id: activityId, ...(actor.caixinhaId ? { cycle: { caixinhaId: actor.caixinhaId } } : {}) },
  });
  if (!a) throw new DomainError("Atividade não encontrada.");
  if (!a.simulationOnly)
    throw new DomainError("Sorteio autorizado: o sistema não executa sorteios reais; registre o resultado oficial.");
  const confirmed = await db.raffleNumber.findMany({
    where: { activityId, status: "CONFIRMED" },
    select: { number: true },
    orderBy: { number: "asc" },
  });
  const winner = domain(() =>
    simulateDraw(
      confirmed.map((c) => c.number),
      (n) => randomInt(n),
    ),
  );
  await recordAudit({
    actorId: actor.userId,
    action: "fundraising.simulated_draw",
    entityType: "FundraisingActivity",
    entityId: activityId,
    after: { winner, simulation: true },
  });
  return winner;
}

/** Registra o resultado OFICIAL obtido pelo meio autorizado. Uma vez só; imutável. */
export async function recordOfficialResult(
  actor: CurrentUser,
  input: {
    activityId: string;
    drawSource: string;
    drawnOn: ISODate;
    winners: { prizeId: string; winningNumber: number }[];
  },
) {
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, input.activityId, actor.caixinhaId);
    if (a.simulationOnly) throw new DomainError("Atividade em simulação não tem resultado oficial.");
    if (a.drawnAt) throw new DomainError("O resultado oficial já foi registrado.");
    if (a.status !== "IN_PROGRESS") throw new DomainError("A atividade precisa estar em andamento.");
    const prizes = await tx.prize.findMany({ where: { activityId: a.id }, orderBy: { position: "asc" } });
    if (prizes.length === 0) throw new DomainError("Cadastre os prêmios antes de registrar o resultado.");
    if (input.winners.length !== prizes.length) throw new DomainError("Informe o número sorteado de cada prêmio.");

    const lines: string[] = [];
    for (const w of input.winners) {
      const prize = prizes.find((p) => p.id === w.prizeId);
      if (!prize) throw new DomainError("Prêmio inválido.");
      const n = await tx.raffleNumber.findUnique({
        where: { activityId_number: { activityId: a.id, number: w.winningNumber } },
      });
      if (!n || n.status !== "CONFIRMED")
        throw new DomainError(`O número ${w.winningNumber} não está confirmado nesta atividade.`);
      await tx.prize.update({ where: { id: prize.id }, data: { winningNumber: w.winningNumber } });
      lines.push(
        `${prize.position}º prêmio (${prize.name}): número ${formatRaffleNumber(w.winningNumber, a.numberRangeEnd ?? w.winningNumber)}`,
      );
    }
    const drawResult = lines.join("; ");
    await tx.fundraisingActivity.update({
      where: { id: a.id },
      data: {
        drawResult,
        drawSource: input.drawSource,
        drawnAt: fromISODate(input.drawnOn),
        drawRecordedById: actor.userId,
        status: "FINISHED",
      },
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.official_result",
        entityType: "FundraisingActivity",
        entityId: a.id,
        after: { drawResult, drawSource: input.drawSource },
      },
      tx,
    );
    return drawResult;
  });
}

// ---------------------------------------------------------------------------
// Financeiro da atividade
// ---------------------------------------------------------------------------

export async function recordActivityEntry(
  actor: CurrentUser,
  input: { activityId: string; kind: "REVENUE" | "COST"; amountCents: Cents; occurredOn: ISODate; description: string },
) {
  return db.$transaction(async (tx) => {
    const a = await loadActivity(tx, input.activityId, actor.caixinhaId);
    const allowed = canRecordMoney(a);
    if (!allowed.ok) throw new DomainError(allowed.reason);
    if (a.status === "CANCELLED") throw new DomainError("Atividade cancelada.");
    if (a.cycle.status !== "OPEN" && a.cycle.status !== "CONTRIBUTIONS_CLOSED") {
      throw new DomainError("O ciclo da atividade não aceita lançamentos agora.");
    }
    const entry = await postEntry(tx, {
      cycleId: a.cycleId,
      occurredOn: input.occurredOn,
      category: input.kind === "REVENUE" ? "ADDITIONAL_REVENUE" : "ACTIVITY_COST",
      description: `${a.title}: ${input.description}`,
      lines: input.kind === "REVENUE" ? revenueLines(input.amountCents) : expenseLines(input.amountCents),
      createdById: actor.userId,
      activityId: a.id,
    });
    await recordAudit(
      {
        actorId: actor.userId,
        action: "fundraising.entry",
        entityType: "LedgerTransaction",
        entityId: entry.id,
        after: input,
      },
      tx,
    );
    return entry;
  });
}
