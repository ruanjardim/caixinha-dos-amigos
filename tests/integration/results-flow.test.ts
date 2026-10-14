/**
 * Apuração → aprovação → distribuição → encerramento, contra o banco de TESTES.
 * Ciclo no passado (2025) para poder encerrar as contribuições.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/modules/auth/session";
import {
  addMembership,
  closeContributions,
  createCycle,
  leaveCycle,
  openCycle,
  publishRules,
} from "@/modules/cycles/service";
import { getLedgerOverview, recordManualEntry } from "@/modules/ledger/service";
import { informPayment, registerPayment } from "@/modules/payments/service";
import {
  approveResults,
  calculateResults,
  closeCycle,
  postClosingAdjustment,
  reconcileCash,
  registerAdminFeePayment,
  registerDistribution,
  returnPrincipal,
} from "@/modules/results/service";

const enabled = Boolean(process.env.DATABASE_URL);
const TODAY = "2026-01-20";
const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

async function makeParticipant(admin: CurrentUser, name: string) {
  const p = await db.participant.create({
    data: {
      fullName: name,
      email: `${randomUUID().slice(0, 8)}@resultado.local`,
      joinedAt: new Date("2025-01-01T00:00:00Z"),
    },
  });
  return p.id;
}

async function expectDomainError(promise: Promise<unknown>, pattern: RegExp) {
  const e = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(DomainError);
  expect((e as Error).message).toMatch(pattern);
}

const base = {
  startDate: "2025-01-01",
  contributionEndDate: "2025-12-31",
  settlementDate: "2026-01-15",
  dueDay: 10,
  adminFeePercent: 1000,
  quotaValues: [10_000],
  rulesText: "",
};

describe.skipIf(!enabled)("apuração e encerramento (integração)", () => {
  let admin: CurrentUser;
  const pay = (membershipId: string, amountCents: number, receivedAt: string) =>
    registerPayment(
      admin,
      {
        membershipId,
        amountCents,
        receivedAt,
        method: "CASH",
        transactionRef: null,
        notes: null,
        idempotencyKey: randomUUID(),
        acknowledgeDuplicate: true,
        confirmNow: true,
        confirmationNote: null,
      },
      TODAY,
    );

  beforeAll(async () => {
    const id = randomUUID();
    await db.user.create({
      data: { id, name: "Admin Resultado", email: `${id.slice(0, 8)}@resultado.local`, role: "ADMIN" },
    });
    admin = { userId: id, name: "Admin Resultado", email: "", role: "ADMIN", status: "ACTIVE", participantId: null };
  });

  describe("resultado positivo, com saída no meio do ciclo", () => {
    let cycleId: string;
    let ana: string;
    let bruno: string;
    let carla: string;
    let calcId: string;

    beforeAll(async () => {
      cycleId = (await createCycle(admin, { ...base, name: "Resultado 2025" })).id;
      const add = async (name: string) =>
        (
          await addMembership(admin, cycleId, {
            participantId: await makeParticipant(admin, name),
            quotaCount: 1,
            quotaValueCents: 10_000,
            joinedAt: "2025-01-01",
          })
        ).id;
      ana = await add("Ana Resultado");
      bruno = await add("Bruno Resultado");
      carla = await add("Carla Resultado");
      await publishRules(admin, cycleId);
      await openCycle(admin, cycleId);

      await pay(ana, 120_000, "2025-01-01");
      for (const m of MONTHS) await pay(bruno, 10_000, `2025-${m}-01`);
      for (const m of ["01", "02", "03"]) await pay(carla, 10_000, `2025-${m}-01`);
      await leaveCycle(admin, carla, { leftAt: "2025-03-15", reason: "Mudou de cidade" });
      await recordManualEntry(admin, {
        cycleId,
        kind: "REVENUE",
        amountCents: 150_000,
        occurredOn: "2025-06-10",
        description: "Bazar",
      });
      await recordManualEntry(admin, {
        cycleId,
        kind: "EXPENSE",
        amountCents: 10_000,
        occurredOn: "2025-07-10",
        description: "Tarifas",
      });
    });

    it("quem saiu recebe o principal de volta (lançamento no livro-caixa)", async () => {
      const r = await returnPrincipal(
        admin,
        { membershipId: carla, paidOn: "2025-03-20", transactionRef: null },
        TODAY,
      );
      expect(r.amountCents).toBe(30_000);
      await expectDomainError(
        returnPrincipal(admin, { membershipId: carla, paidOn: "2025-03-21", transactionRef: null }, TODAY),
        /Não há principal/,
      );
    });

    it("não apura antes de encerrar as contribuições", async () => {
      await expectDomainError(calculateResults(admin, cycleId), /encerrar o período de contribuições/);
    });

    it("não apura com pagamento em análise", async () => {
      await closeContributions(admin, cycleId, TODAY);
      const anaUser = randomUUID();
      await db.user.create({ data: { id: anaUser, name: "Ana", email: `${anaUser.slice(0, 8)}@r.local` } });
      const anaMembership = await db.membership.findUniqueOrThrow({ where: { id: ana } });
      await db.participant.update({ where: { id: anaMembership.participantId }, data: { userId: anaUser } });
      const p = await informPayment(
        {
          userId: anaUser,
          name: "Ana",
          email: "",
          role: "PARTICIPANT",
          status: "ACTIVE",
          participantId: anaMembership.participantId,
        },
        {
          membershipId: ana,
          amountCents: 500,
          receivedAt: "2026-01-05",
          method: "CASH",
          transactionRef: null,
          notes: null,
          idempotencyKey: randomUUID(),
          acknowledgeDuplicate: true,
        },
        TODAY,
      );
      await expectDomainError(calculateResults(admin, cycleId), /em análise/);
      await db.payment.update({ where: { id: p.id }, data: { status: "CANCELLED", cancelReason: "teste" } });
    });

    it("apura: 10% sobre R$ 1.400 líquido, resto pelo saldo diário", async () => {
      const calc = await calculateResults(admin, cycleId);
      calcId = calc.id;
      expect(calc).toMatchObject({
        status: "DRAFT",
        netResultCents: 140_000,
        adminFeeCents: 14_000,
        distributableCents: 126_000,
      });
      const shares = await db.resultShare.findMany({ where: { calculationId: calc.id } });
      const by = (id: string) => shares.find((s) => s.membershipId === id)!;
      expect(shares.reduce((s, x) => s + x.shareCents, 0)).toBe(126_000);
      expect(by(ana).shareCents).toBeGreaterThan(by(bruno).shareCents); // antecipou
      expect(by(carla)).toMatchObject({ principalCents: 0 }); // já recebeu de volta
      expect(by(carla).shareCents).toBeGreaterThan(0); // participa pelos dias até a devolução
      expect(by(carla).weight).toBe(10_000n * (78n + 47n + 19n)); // 01/01, 01/02, 01/03 → 20/03
    });

    it("movimentação depois do cálculo exige recalcular", async () => {
      await recordManualEntry(admin, {
        cycleId,
        kind: "TAX",
        amountCents: 1_000,
        occurredOn: "2026-01-10",
        description: "IOF",
      });
      await expectDomainError(approveResults(admin, calcId), /Calcule novamente/);
      const recalc = await calculateResults(admin, cycleId);
      expect(recalc.netResultCents).toBe(139_000);
      expect((await db.resultCalculation.findUniqueOrThrow({ where: { id: calcId } })).status).toBe("SUPERSEDED");
      calcId = recalc.id;
    });

    it("aprova: apuração fica imutável e o ciclo vai para distribuição", async () => {
      await approveResults(admin, calcId);
      expect((await db.cycle.findUniqueOrThrow({ where: { id: cycleId } })).status).toBe("SETTLING");
      await expect(db.resultCalculation.update({ where: { id: calcId }, data: { netResultCents: 1 } })).rejects.toThrow(
        /não pode ser alterada/,
      );
      await expect(
        db.resultShare.updateMany({ where: { calculationId: calcId }, data: { shareCents: 1 } }),
      ).rejects.toThrow(/somente-inclusão/);
      await expectDomainError(
        recordManualEntry(admin, {
          cycleId,
          kind: "EXPENSE",
          amountCents: 100,
          occurredOn: "2026-01-15",
          description: "x",
        }),
        /Apuração aprovada/,
      );
      await expectDomainError(pay(ana, 100, "2026-01-15"), /não está recebendo pagamentos/);
    });

    it("remuneração administrativa bloqueada enquanto o recurso estiver desligado", async () => {
      await expectDomainError(
        registerAdminFeePayment(admin, { calculationId: calcId, paidOn: "2026-01-16", transactionRef: null }, TODAY),
        /desativado/,
      );
    });

    it("não encerra antes de pagar todos; paga uma vez só; encerra", async () => {
      await expectDomainError(closeCycle(admin, cycleId), /Faltam 3/);
      const shares = await db.resultShare.findMany({ where: { calculationId: calcId } });
      for (const s of shares)
        await registerDistribution(admin, { shareId: s.id, paidOn: "2026-01-16", transactionRef: null }, TODAY);
      await expectDomainError(
        registerDistribution(admin, { shareId: shares[0].id, paidOn: "2026-01-16", transactionRef: null }, TODAY),
        /já recebeu/,
      );

      const { remainingCashCents } = await closeCycle(admin, cycleId);
      const calc = await db.resultCalculation.findUniqueOrThrow({ where: { id: calcId } });
      expect(remainingCashCents).toBe(calc.adminFeeCents); // remuneração retida até validação jurídica
      const o = await getLedgerOverview(cycleId);
      expect(o.principalOwedCents).toBe(0);
      expect(o.distributedResultCents).toBe(calc.distributableCents);
    });

    it("conciliação registra a diferença entre extrato e livro-caixa", async () => {
      const rec = await reconcileCash(
        admin,
        { cycleId, referenceDate: "2026-01-20", statementBalanceCents: 13_800, notes: null },
        TODAY,
      );
      expect(rec.bookBalanceCents).toBe(13_900);
      expect(rec.differenceCents).toBe(-100);
    });

    it("correção pós-encerramento exige justificativa e não altera a apuração", async () => {
      await expectDomainError(
        postClosingAdjustment(admin, {
          cycleId,
          kind: "EXPENSE",
          amountCents: 500,
          occurredOn: "2026-01-20",
          description: "Tarifa",
          justification: "curta",
        }),
        /justificativa/,
      );
      const entry = await postClosingAdjustment(admin, {
        cycleId,
        kind: "EXPENSE",
        amountCents: 100,
        occurredOn: "2026-01-20",
        description: "Tarifa de manutenção cobrada após o encerramento",
        justification: "Banco debitou tarifa de janeiro depois do fechamento do ciclo.",
      });
      expect(entry.postClosing).toBe(true);
      expect((await db.resultCalculation.findUniqueOrThrow({ where: { id: calcId } })).netResultCents).toBe(139_000);
      await expectDomainError(
        recordManualEntry(admin, {
          cycleId,
          kind: "EXPENSE",
          amountCents: 1,
          occurredOn: "2026-01-20",
          description: "x",
        }),
        /correção pós-encerramento/,
      );
    });
  });

  describe("resultado negativo (prejuízo)", () => {
    it("rateia o prejuízo pelo principal, sem remuneração, e o caixa zera no encerramento", async () => {
      const cycleId = (await createCycle(admin, { ...base, name: "Prejuízo 2025" })).id;
      const a = (
        await addMembership(admin, cycleId, {
          participantId: await makeParticipant(admin, "Dora Prejuízo"),
          quotaCount: 1,
          quotaValueCents: 10_000,
          joinedAt: "2025-01-01",
        })
      ).id;
      const b = (
        await addMembership(admin, cycleId, {
          participantId: await makeParticipant(admin, "Eva Prejuízo"),
          quotaCount: 1,
          quotaValueCents: 10_000,
          joinedAt: "2025-01-01",
        })
      ).id;
      await publishRules(admin, cycleId);
      await openCycle(admin, cycleId);
      await pay(a, 80_000, "2025-01-05");
      await pay(b, 20_000, "2025-11-05");
      await recordManualEntry(admin, {
        cycleId,
        kind: "EXPENSE",
        amountCents: 5_000,
        occurredOn: "2025-06-01",
        description: "Custo de evento cancelado",
      });
      await closeContributions(admin, cycleId, TODAY);

      const calc = await calculateResults(admin, cycleId);
      expect(calc).toMatchObject({ netResultCents: -5_000, adminFeeCents: 0, distributableCents: 0 });
      const shares = await db.resultShare.findMany({ where: { calculationId: calc.id } });
      expect(shares.find((s) => s.membershipId === a)!.shareCents).toBe(-4_000);
      expect(shares.find((s) => s.membershipId === b)!.shareCents).toBe(-1_000);

      await approveResults(admin, calc.id);
      for (const s of shares)
        await registerDistribution(admin, { shareId: s.id, paidOn: "2026-01-16", transactionRef: null }, TODAY);
      const { remainingCashCents } = await closeCycle(admin, cycleId);
      expect(remainingCashCents).toBe(0);
    });
  });
});
