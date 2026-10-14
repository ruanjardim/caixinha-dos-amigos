/**
 * Atividades de arrecadação e conformidade, contra o banco de TESTES.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/modules/auth/session";
import { createCycle, openCycle, publishRules, addMembership } from "@/modules/cycles/service";
import {
  activateAuthorizedMode,
  addPrize,
  confirmNumber,
  createActivity,
  decideCompliance,
  generateNumbers,
  recordActivityEntry,
  recordOfficialResult,
  releaseNumber,
  reserveNumber,
  runSimulatedDraw,
  setActivityStatus,
  setFeatureFlag,
  updateActivity,
} from "@/modules/fundraising/service";
import type { ActivityInput } from "@/modules/fundraising/schemas";

const enabled = Boolean(process.env.DATABASE_URL);
const TODAY = "2027-01-20";
const RULES =
  "Regulamento: resultado pela extração da Loteria Federal; prêmio entregue em 30 dias; números a R$ 10,00.";

async function expectDomainError(promise: Promise<unknown>, pattern: RegExp) {
  const e = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e, "era esperado um erro").toBeInstanceOf(DomainError);
  expect((e as Error).message).toMatch(pattern);
}

describe.skipIf(!enabled)("arrecadação e conformidade (integração)", () => {
  let admin: CurrentUser;
  let cycleId: string;
  let participantId: string;
  const raffle = (over: Partial<ActivityInput> = {}): ActivityInput => ({
    cycleId,
    type: "RAFFLE",
    title: "Rifa de Natal",
    description: null,
    startsOn: null,
    endsOn: null,
    numberRangeStart: 1,
    numberRangeEnd: 50,
    unitPriceCents: 1_000,
    promotionRules: RULES,
    ...over,
  });

  beforeAll(async () => {
    const id = randomUUID();
    await db.user.create({
      data: { id, name: "Admin Arrecadação", email: `${id.slice(0, 8)}@arr.local`, role: "ADMIN" },
    });
    admin = { userId: id, name: "Admin", email: "", role: "ADMIN", status: "ACTIVE", participantId: null };
    cycleId = (
      await createCycle(admin, {
        name: "Arrecadação 2026/27",
        startDate: "2026-12-01",
        contributionEndDate: "2027-11-30",
        settlementDate: "2027-12-15",
        dueDay: 10,
        adminFeePercent: 1000,
        quotaValues: [5_000],
        rulesText: "",
      })
    ).id;
    participantId = (
      await db.participant.create({
        data: {
          fullName: "Comprador Teste",
          email: `${id.slice(0, 8)}@c.local`,
          joinedAt: new Date("2026-12-01T00:00:00Z"),
        },
      })
    ).id;
    await addMembership(admin, cycleId, {
      participantId,
      quotaCount: 1,
      quotaValueCents: 5_000,
      joinedAt: "2026-12-01",
    });
    await publishRules(admin, cycleId);
    await openCycle(admin, cycleId);
    await setFeatureFlag(admin, {
      key: "RAFFLE_SALES_ENABLED",
      enable: false,
      justification: "Estado inicial do teste.",
    });
  });

  describe("sorteio em SIMULAÇÃO (padrão)", () => {
    let activityId: string;

    it("nasce em simulação e com conformidade pendente", async () => {
      const a = await createActivity(admin, raffle());
      activityId = a.id;
      expect(a).toMatchObject({ simulationOnly: true, complianceStatus: "PENDING_REVIEW", status: "DRAFT" });
    });

    it("gera numeração simulada e controla reservas/confirmações sem dinheiro", async () => {
      expect(await generateNumbers(admin, activityId)).toBe(50);
      await expectDomainError(generateNumbers(admin, activityId), /já foi gerada/);
      await expectDomainError(
        reserveNumber(admin, { activityId, number: 7, participantId }),
        /planejada ou em andamento/,
      );
      await setActivityStatus(admin, activityId, "PLANNED");
      await setActivityStatus(admin, activityId, "IN_PROGRESS");

      await reserveNumber(admin, { activityId, number: 7, participantId });
      await expectDomainError(reserveNumber(admin, { activityId, number: 7, participantId }), /não está disponível/);
      await releaseNumber(admin, { activityId, number: 7 });
      await reserveNumber(admin, { activityId, number: 7, participantId });
      await confirmNumber(admin, { activityId, number: 7, paidOn: "2027-01-10", transactionRef: null }, TODAY);

      const n = await db.raffleNumber.findUniqueOrThrow({ where: { activityId_number: { activityId, number: 7 } } });
      expect(n).toMatchObject({ status: "CONFIRMED", isSimulation: true, ledgerTransactionId: null });
      expect(await db.ledgerTransaction.count({ where: { activityId } })).toBe(0); // nenhum dinheiro
      await expect(db.raffleNumber.update({ where: { id: n.id }, data: { status: "AVAILABLE" } })).rejects.toThrow(
        /confirmado não pode/,
      );
      await expect(db.raffleNumber.delete({ where: { id: n.id } })).rejects.toThrow(/Exclusão definitiva/);
    });

    it("não permite lançar dinheiro em sorteio simulado", async () => {
      await expectDomainError(
        recordActivityEntry(admin, {
          activityId,
          kind: "REVENUE",
          amountCents: 1_000,
          occurredOn: "2027-01-10",
          description: "venda",
        }),
        /simulação/,
      );
    });

    it("sorteio simulado escolhe entre confirmados e NÃO grava resultado", async () => {
      expect(await runSimulatedDraw(admin, activityId)).toBe(7);
      expect((await db.fundraisingActivity.findUniqueOrThrow({ where: { id: activityId } })).drawnAt).toBeNull();
      await addPrize(admin, { activityId, name: "Cesta", description: null, costCents: null, position: 1 });
      await expectDomainError(
        recordOfficialResult(admin, { activityId, drawSource: "x", drawnOn: "2027-01-15", winners: [] }),
        /simulação não tem resultado oficial/,
      );
    });

    it("simulação nunca vira venda real (numeração já gerada)", async () => {
      await decideCompliance(admin, {
        activityId,
        legalModality: "Teste",
        authorization: null,
        legalOpinion: "Parecer de teste com fundamentação suficiente.",
        decision: "APPROVED",
      });
      await setFeatureFlag(admin, {
        key: "RAFFLE_SALES_ENABLED",
        enable: true,
        justification: "Teste: parecer jurídico favorável anexado ao processo.",
        confirmation: "ATIVAR",
      });
      await expectDomainError(activateAuthorizedMode(admin, activityId), /gerada em simulação/);
      await setFeatureFlag(admin, {
        key: "RAFFLE_SALES_ENABLED",
        enable: false,
        justification: "Fim do teste de simulação.",
      });
    });
  });

  describe("ativação de recursos sensíveis", () => {
    it("exige justificativa e a confirmação digitada", async () => {
      await expectDomainError(
        setFeatureFlag(admin, {
          key: "RAFFLE_SALES_ENABLED",
          enable: true,
          justification: "curta",
          confirmation: "ATIVAR",
        }),
        /30 caracteres/,
      );
      await expectDomainError(
        setFeatureFlag(admin, {
          key: "RAFFLE_SALES_ENABLED",
          enable: true,
          justification: "Justificativa suficientemente longa para o teste.",
          confirmation: "sim",
        }),
        /Digite ATIVAR/,
      );
      const audits = await db.auditLog.count({ where: { action: { startsWith: "compliance.flag" } } });
      expect(audits).toBeGreaterThan(0);
    });
  });

  describe("sorteio AUTORIZADO (após parecer + recurso + regulamento)", () => {
    let activityId: string;

    it("não ativa sem parecer aprovado nem com o recurso desligado", async () => {
      activityId = (await createActivity(admin, raffle({ title: "Rifa autorizada" }))).id;
      await expectDomainError(activateAuthorizedMode(admin, activityId), /parecer de conformidade aprovado.*desligado/);
    });

    it("parecer reprovado bloqueia; aprovado + recurso ligado ativa", async () => {
      await decideCompliance(admin, {
        activityId,
        legalModality: "Modalidade X",
        authorization: null,
        legalOpinion: "Sem enquadramento legal identificado para a modalidade.",
        decision: "REJECTED",
      });
      await expectDomainError(
        recordActivityEntry(admin, {
          activityId,
          kind: "COST",
          amountCents: 100,
          occurredOn: "2027-01-10",
          description: "x",
        }),
        /REPROVADO/,
      );
      await decideCompliance(admin, {
        activityId,
        legalModality: "Modalidade autorizada",
        authorization: "Proc. 123/2026",
        legalOpinion: "Enquadramento confirmado por advogado, com autorização anexada.",
        decision: "APPROVED",
      });
      await setFeatureFlag(admin, {
        key: "RAFFLE_SALES_ENABLED",
        enable: true,
        justification: "Parecer jurídico favorável e autorização obtida (teste).",
        confirmation: "ativar",
      });
      await activateAuthorizedMode(admin, activityId);
      expect((await db.fundraisingActivity.findUniqueOrThrow({ where: { id: activityId } })).simulationOnly).toBe(
        false,
      );
    });

    it("regulamento e preço congelam após autorização", async () => {
      await expectDomainError(
        updateActivity(admin, activityId, raffle({ title: "Rifa autorizada", unitPriceCents: 2_000 })),
        /congelados/,
      );
    });

    it("venda real: exige identificação, não repete transação, lança receita", async () => {
      await generateNumbers(admin, activityId);
      await setActivityStatus(admin, activityId, "PLANNED");
      await setActivityStatus(admin, activityId, "IN_PROGRESS");
      await reserveNumber(admin, { activityId, number: 1, participantId });
      await reserveNumber(admin, { activityId, number: 2, participantId });
      await expectDomainError(
        confirmNumber(admin, { activityId, number: 1, paidOn: "2027-01-10", transactionRef: null }, TODAY),
        /identificação da transação/,
      );
      await confirmNumber(admin, { activityId, number: 1, paidOn: "2027-01-10", transactionRef: "E2E-PIX-1" }, TODAY);
      await expectDomainError(
        confirmNumber(admin, { activityId, number: 2, paidOn: "2027-01-10", transactionRef: "E2E-PIX-1" }, TODAY),
        /já foi usada no número 1/,
      );

      const entries = await db.ledgerTransaction.findMany({ where: { activityId }, include: { lines: true } });
      expect(entries).toHaveLength(1);
      expect(entries[0].lines.find((l) => l.account === "CASH")?.amountCents).toBe(1_000);
    });

    it("sistema não executa sorteio real; resultado oficial é registrado uma única vez", async () => {
      await expectDomainError(runSimulatedDraw(admin, activityId), /não executa sorteios reais/);
      const prize = await addPrize(admin, {
        activityId,
        name: "Vale-compras",
        description: null,
        costCents: 5_000,
        position: 1,
      });
      await expectDomainError(
        recordOfficialResult(admin, {
          activityId,
          drawSource: "Loteria Federal",
          drawnOn: "2027-01-15",
          winners: [{ prizeId: prize.id, winningNumber: 2 }],
        }),
        /não está confirmado/,
      );
      const result = await recordOfficialResult(admin, {
        activityId,
        drawSource: "Loteria Federal — extração 12345 de 15/01/2027",
        drawnOn: "2027-01-15",
        winners: [{ prizeId: prize.id, winningNumber: 1 }],
      });
      expect(result).toMatch(/número 01/);
      const a = await db.fundraisingActivity.findUniqueOrThrow({ where: { id: activityId } });
      expect(a.status).toBe("FINISHED");
      await expectDomainError(
        recordOfficialResult(admin, {
          activityId,
          drawSource: "x",
          drawnOn: "2027-01-16",
          winners: [{ prizeId: prize.id, winningNumber: 1 }],
        }),
        /já foi registrado/,
      );
      await setFeatureFlag(admin, {
        key: "RAFFLE_SALES_ENABLED",
        enable: false,
        justification: "Fim do teste autorizado.",
      });
    });
  });

  describe("atividades comuns (bazar)", () => {
    it("registram receitas e custos ligados à atividade", async () => {
      const a = await createActivity(admin, {
        ...raffle(),
        type: "EVENT",
        title: "Bazar",
        numberRangeStart: null,
        numberRangeEnd: null,
        unitPriceCents: null,
        promotionRules: null,
      });
      expect(a.complianceStatus).toBe("NOT_REQUIRED");
      await recordActivityEntry(admin, {
        activityId: a.id,
        kind: "REVENUE",
        amountCents: 30_000,
        occurredOn: "2027-01-12",
        description: "Vendas",
      });
      await recordActivityEntry(admin, {
        activityId: a.id,
        kind: "COST",
        amountCents: 5_000,
        occurredOn: "2027-01-12",
        description: "Barraca",
      });
      const entries = await db.ledgerTransaction.findMany({ where: { activityId: a.id }, select: { category: true } });
      expect(entries.map((e) => e.category).sort()).toEqual(["ACTIVITY_COST", "ADDITIONAL_REVENUE"]);
    });
  });
});
