/**
 * Fluxo financeiro completo contra o banco de TESTES:
 * ciclo → regras → participações → abertura → pagamentos → livro-caixa.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type CurrentUser } from "@/modules/auth/session";
import { getCycleDetail, getMembershipDetail } from "@/modules/cycles/queries";
import {
  acceptRules,
  addMembership,
  changeQuotas,
  closeContributions,
  createCycle,
  leaveCycle,
  openCycle,
  publishRules,
  rulesContent,
  rulesHash,
  updateCycle,
} from "@/modules/cycles/service";
import type { CycleInput } from "@/modules/cycles/schemas";
import { getLedgerOverview, recordManualEntry, reverseEntry } from "@/modules/ledger/service";
import {
  confirmPayment,
  informPayment,
  registerPayment,
  rejectPayment,
  reversePayment,
  type NewPaymentInput,
} from "@/modules/payments/service";

const enabled = Boolean(process.env.DATABASE_URL);

async function makeUser(name: string, role: "ADMIN" | "PARTICIPANT", withParticipant: boolean): Promise<CurrentUser> {
  const id = randomUUID();
  const email = `${name.toLowerCase().replace(/\s+/g, ".")}.${id.slice(0, 6)}@teste.local`;
  await db.user.create({ data: { id, name, email, role } });
  let participantId: string | null = null;
  if (withParticipant) {
    const p = await db.participant.create({
      data: { fullName: `${name} Teste`, email, joinedAt: new Date("2026-12-01T00:00:00Z"), userId: id },
    });
    participantId = p.id;
  }
  return { userId: id, name, email, role, status: "ACTIVE", participantId };
}

const CYCLE: CycleInput = {
  name: "Ciclo de teste 2026/2027",
  startDate: "2026-12-01",
  contributionEndDate: "2027-11-30",
  settlementDate: "2027-12-15",
  dueDay: 10,
  adminFeePercent: 1000,
  quotaValues: [5_000, 10_000],
  rulesText: "",
};

function payment(membershipId: string, overrides: Partial<NewPaymentInput> = {}): NewPaymentInput {
  return {
    membershipId,
    amountCents: 10_000,
    receivedAt: "2026-12-05",
    method: "PIX_MANUAL",
    transactionRef: `E${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
    notes: null,
    idempotencyKey: randomUUID(),
    acknowledgeDuplicate: false,
    ...overrides,
  };
}

async function expectError(promise: Promise<unknown>, type: new (...a: never[]) => Error, pattern?: RegExp) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "era esperado um erro").toBeInstanceOf(type);
  if (pattern) expect((error as Error).message).toMatch(pattern);
  return error as Error;
}

describe.skipIf(!enabled)("fluxo financeiro (integração)", () => {
  let admin: CurrentUser;
  let joao: CurrentUser;
  let ana: CurrentUser;
  let cycleId: string;
  let joaoMembership: string;
  let anaMembership: string;
  const TODAY = "2026-12-20";

  beforeAll(async () => {
    admin = await makeUser("Admin Principal", "ADMIN", false);
    joao = await makeUser("João", "PARTICIPANT", true);
    ana = await makeUser("Ana", "PARTICIPANT", true);
  });

  describe("ciclo e regras", () => {
    it("cria o ciclo em preparação com regras padrão", async () => {
      const cycle = await createCycle(admin, CYCLE);
      cycleId = cycle.id;
      expect(cycle.status).toBe("DRAFT");
      const rules = await db.cycleRules.findFirstOrThrow({ where: { cycleId } });
      expect(rules.adminFeeBps).toBe(1000);
      expect(rules.rulesText).toMatch(/NÃO existe promessa de rendimento/);
    });

    it("rejeita participação com valor de cota fora das regras", async () => {
      await expectError(
        addMembership(admin, cycleId, {
          participantId: joao.participantId!,
          quotaCount: 2,
          quotaValueCents: 7_000,
          joinedAt: "2026-12-01",
        }),
        DomainError,
        /não previsto/,
      );
    });

    it("inclui participantes (João: 2 cotas de R$ 50; Ana: 1 cota de R$ 100)", async () => {
      joaoMembership = (
        await addMembership(admin, cycleId, {
          participantId: joao.participantId!,
          quotaCount: 2,
          quotaValueCents: 5_000,
          joinedAt: "2026-12-01",
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
      await expectError(
        addMembership(admin, cycleId, {
          participantId: joao.participantId!,
          quotaCount: 1,
          quotaValueCents: 5_000,
          joinedAt: "2026-12-01",
        }),
        DomainError,
        /já está neste ciclo/,
      );
    });

    it("não abre o ciclo sem regras publicadas", async () => {
      await expectError(openCycle(admin, cycleId), DomainError, /Publique as regras/);
    });

    it("publica as regras com hash verificável e bloqueia edição posterior", async () => {
      const hash = await publishRules(admin, cycleId);
      const cycle = await db.cycle.findUniqueOrThrow({ where: { id: cycleId } });
      const rules = await db.cycleRules.findFirstOrThrow({ where: { cycleId } });
      expect(rules.frozenAt).not.toBeNull();
      expect(rulesHash(rulesContent(cycle, rules))).toBe(hash);
      await expectError(updateCycle(admin, cycleId, { ...CYCLE, adminFeePercent: 2000 }), DomainError, /congeladas/);
      // Proteção também no banco:
      await expect(db.cycleRules.update({ where: { id: rules.id }, data: { adminFeeBps: 2000 } })).rejects.toThrow(
        /congeladas/,
      );
    });

    it("abre o ciclo gerando 12 parcelas previstas por participante", async () => {
      const result = await openCycle(admin, cycleId);
      expect(result).toEqual({ memberships: 2, installments: 24 });
      const detail = await getCycleDetail(cycleId, TODAY);
      expect(detail!.totals.quotas).toBe(3);
      expect(detail!.totals.monthlyCents).toBe(20_000);
      expect(detail!.totals.expectedCents).toBe(240_000);
      expect(detail!.totals.receivedCents).toBe(0); // previsto ≠ recebido
    });

    it("participante registra o aceite das regras (uma vez só)", async () => {
      const a1 = await acceptRules(joao, cycleId);
      const a2 = await acceptRules(joao, cycleId);
      expect(a2.id).toBe(a1.id);
    });

    it("não encerra contribuições antes da data prevista", async () => {
      await expectError(closeContributions(admin, cycleId, TODAY), DomainError, /após a data/);
    });
  });

  describe("pagamentos", () => {
    let informedId: string;

    it("pagamento informado pelo participante fica EM ANÁLISE e não conta como recebido", async () => {
      const p = await informPayment(joao, payment(joaoMembership), TODAY);
      informedId = p.id;
      expect(p.status).toBe("UNDER_REVIEW");
      const m = await getMembershipDetail(joaoMembership, TODAY);
      expect(m!.summary.receivedCents).toBe(0);
      expect(m!.summary.underReviewCents).toBe(10_000);
    });

    it("participante não informa pagamento na participação de outra pessoa", async () => {
      await expectError(informPayment(joao, payment(anaMembership), TODAY), ForbiddenError);
    });

    it("não aceita data futura", async () => {
      await expectError(
        informPayment(joao, payment(joaoMembership, { receivedAt: "2026-12-25" }), TODAY),
        DomainError,
        /futuro/,
      );
    });

    it("confirmação lança no livro-caixa (partidas dobradas) e conta como recebido", async () => {
      await confirmPayment(admin, { paymentId: informedId, receivedAt: "2026-12-05", confirmationNote: null }, TODAY);
      const p = await db.payment.findUniqueOrThrow({ where: { id: informedId } });
      expect(p.status).toBe("CONFIRMED");
      expect(p.confirmedById).toBe(admin.userId);
      const entry = await db.ledgerTransaction.findUniqueOrThrow({
        where: { paymentId: informedId },
        include: { lines: true },
      });
      expect(entry.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(0);
      const overview = await getLedgerOverview(cycleId);
      expect(overview.cashCents).toBe(10_000);
      expect(overview.principalOwedCents).toBe(10_000);
    });

    it("não confirma duas vezes", async () => {
      await expectError(
        confirmPayment(admin, { paymentId: informedId, receivedAt: "2026-12-05", confirmationNote: null }, TODAY),
        DomainError,
        /já foi conferido/,
      );
    });

    it("duas confirmações simultâneas do mesmo pagamento: só uma vence", async () => {
      const p = await informPayment(
        joao,
        payment(joaoMembership, { amountCents: 1_234, receivedAt: "2026-12-08" }),
        TODAY,
      );
      const confirm = () =>
        confirmPayment(admin, { paymentId: p.id, receivedAt: "2026-12-08", confirmationNote: null }, TODAY);
      const results = await Promise.allSettled([confirm(), confirm(), confirm()]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.ledgerTransaction.count({ where: { paymentId: p.id } })).toBe(1);
      // Desfaz para não afetar os próximos cenários.
      await reversePayment(
        admin,
        { paymentId: p.id, reversedAt: "2026-12-08", reason: "Teste de concorrência" },
        TODAY,
      );
    });

    it("pagamento confirmado não pode ter o valor alterado (proteção do banco)", async () => {
      await expect(db.payment.update({ where: { id: informedId }, data: { amountCents: 1 } })).rejects.toThrow(
        /não pode ter dados financeiros alterados/,
      );
      await expect(db.payment.delete({ where: { id: informedId } })).rejects.toThrow(/Exclusão definitiva/);
    });

    it("anti-duplicidade: mesma referência é bloqueada", async () => {
      const first = payment(anaMembership);
      await registerPayment(admin, { ...first, confirmNow: false, confirmationNote: null }, TODAY);
      const err = await expectError(
        registerPayment(
          admin,
          { ...first, idempotencyKey: randomUUID(), confirmNow: false, confirmationNote: null },
          TODAY,
        ),
        DomainError,
        /referência/,
      );
      expect((err as DomainError).code).toBe("DUPLICATE_REFERENCE");
    });

    it("anti-duplicidade: reenvio do mesmo formulário devolve o mesmo pagamento", async () => {
      const input = {
        ...payment(anaMembership, { amountCents: 3_333, receivedAt: "2026-12-06" }),
        confirmNow: false,
        confirmationNote: null,
      };
      const a = await registerPayment(admin, input, TODAY);
      const b = await registerPayment(admin, input, TODAY);
      expect(b.id).toBe(a.id);
    });

    it("anti-duplicidade: mesmo valor e data pede confirmação explícita", async () => {
      const base = payment(anaMembership, {
        method: "CASH",
        transactionRef: null,
        amountCents: 4_444,
        receivedAt: "2026-12-07",
      });
      await registerPayment(admin, { ...base, confirmNow: false, confirmationNote: null }, TODAY);
      const err = await expectError(
        registerPayment(
          admin,
          { ...base, idempotencyKey: randomUUID(), confirmNow: false, confirmationNote: null },
          TODAY,
        ),
        DomainError,
      );
      expect((err as DomainError).code).toBe("DUPLICATE_SUSPECTED");
      const ok = await registerPayment(
        admin,
        {
          ...base,
          idempotencyKey: randomUUID(),
          acknowledgeDuplicate: true,
          confirmNow: false,
          confirmationNote: null,
        },
        TODAY,
      );
      expect(ok.status).toBe("UNDER_REVIEW");
      await rejectPayment(admin, { paymentId: ok.id, reason: "Duplicado de teste" });
      expect((await db.payment.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe("CANCELLED");
    });

    it("pagamento parcial e antecipado: R$ 60 + R$ 350 para João", async () => {
      await registerPayment(
        admin,
        {
          ...payment(joaoMembership, { amountCents: 6_000, receivedAt: "2026-12-10" }),
          confirmNow: true,
          confirmationNote: null,
        },
        TODAY,
      );
      let m = await getMembershipDetail(joaoMembership, TODAY);
      // R$ 100 (dez) + R$ 60 → dez paga, jan parcial
      expect(m!.summary.installments[1]).toMatchObject({
        competence: "2027-01",
        situation: "PARTIAL",
        coveredCents: 6_000,
      });

      await registerPayment(
        admin,
        {
          ...payment(joaoMembership, { amountCents: 35_000, receivedAt: "2026-12-15" }),
          confirmNow: true,
          confirmationNote: null,
        },
        TODAY,
      );
      m = await getMembershipDetail(joaoMembership, TODAY);
      expect(m!.summary.receivedCents).toBe(51_000);
      expect(m!.summary.advancedCents).toBe(41_000); // tudo além de dez/2026 é antecipação
      expect(m!.summary.nextDue?.competence).toBe("2027-05");
    });

    it("estorno: pagamento vira ESTORNADO, livro-caixa recebe lançamento inverso", async () => {
      const p = await registerPayment(
        admin,
        {
          ...payment(anaMembership, { amountCents: 10_000, receivedAt: "2026-12-12" }),
          confirmNow: true,
          confirmationNote: null,
        },
        TODAY,
      );
      const cashBefore = (await getLedgerOverview(cycleId)).cashCents;
      await reversePayment(
        admin,
        { paymentId: p.id, reversedAt: "2026-12-18", reason: "Pix devolvido pelo banco" },
        TODAY,
      );

      const after = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
      expect(after.status).toBe("REVERSED");
      expect((await getLedgerOverview(cycleId)).cashCents).toBe(cashBefore - 10_000);
      const original = await db.ledgerTransaction.findUniqueOrThrow({
        where: { paymentId: p.id },
        include: { reversedBy: true },
      });
      expect(original.reversedBy?.category).toBe("CONTRIBUTION_REVERSAL");

      await expectError(
        reversePayment(admin, { paymentId: p.id, reversedAt: "2026-12-18", reason: "de novo" }, TODAY),
        DomainError,
        /Somente pagamentos confirmados/,
      );
      // Estornado não volta a ser confirmado (proteção do banco):
      await expect(db.payment.update({ where: { id: p.id }, data: { status: "CONFIRMED" } })).rejects.toThrow(
        /não pode mais ser alterado/,
      );
    });
  });

  describe("administrador que também participa", () => {
    it("com outro administrador ativo, não confirma o próprio pagamento", async () => {
      const selfAdmin = await makeUser("Bia Admin", "ADMIN", true);
      const m = await addMembership(admin, cycleId, {
        participantId: selfAdmin.participantId!,
        quotaCount: 1,
        quotaValueCents: 5_000,
        joinedAt: "2026-12-01",
      });
      const p = await informPayment(selfAdmin, payment(m.id, { amountCents: 5_000 }), TODAY);
      await expectError(
        confirmPayment(
          selfAdmin,
          { paymentId: p.id, receivedAt: "2026-12-05", confirmationNote: "Recebi no caixa" },
          TODAY,
        ),
        ForbiddenError,
        /Outro administrador/,
      );
      // O outro administrador confirma normalmente.
      await confirmPayment(admin, { paymentId: p.id, receivedAt: "2026-12-05", confirmationNote: null }, TODAY);
    });
  });

  describe("livro-caixa", () => {
    it("receita e despesa separadas; despesa não pode exceder o caixa", async () => {
      const before = await getLedgerOverview(cycleId);
      await expectError(
        recordManualEntry(admin, {
          cycleId,
          kind: "EXPENSE",
          amountCents: before.cashCents + 1,
          occurredOn: "2026-12-19",
          description: "Despesa grande",
        }),
        DomainError,
        /Saldo em caixa insuficiente/,
      );
      await recordManualEntry(admin, {
        cycleId,
        kind: "REVENUE",
        amountCents: 20_000,
        occurredOn: "2026-12-19",
        description: "Bazar beneficente",
      });
      const expense = await recordManualEntry(admin, {
        cycleId,
        kind: "EXPENSE",
        amountCents: 2_500,
        occurredOn: "2026-12-19",
        description: "Tarifa bancária",
      });
      const after = await getLedgerOverview(cycleId);
      expect(after.revenueCents).toBe(before.revenueCents + 20_000);
      expect(after.expenseCents).toBe(before.expenseCents + 2_500);
      expect(after.principalOwedCents).toBe(before.principalOwedCents); // contribuições não se misturam
      expect(after.cashCents).toBe(after.principalOwedCents + after.partialResultCents);

      await reverseEntry(admin, {
        transactionId: expense.id,
        occurredOn: "2026-12-20",
        reason: "Tarifa estornada pelo banco",
      });
      expect((await getLedgerOverview(cycleId)).expenseCents).toBe(before.expenseCents);
      await expectError(
        reverseEntry(admin, { transactionId: expense.id, occurredOn: "2026-12-20", reason: "de novo" }),
        DomainError,
        /já foi estornado/,
      );
    });

    it("lançamentos de pagamento não são estornados pelo livro-caixa", async () => {
      const entry = await db.ledgerTransaction.findFirstOrThrow({ where: { cycleId, category: "CONTRIBUTION" } });
      await expectError(
        reverseEntry(admin, { transactionId: entry.id, occurredOn: "2026-12-20", reason: "x" }),
        DomainError,
        /tela do pagamento/,
      );
    });
  });

  describe("alterações na participação", () => {
    it("alteração de cotas vale a partir de parcela ainda não vencida", async () => {
      await expectError(
        changeQuotas(
          admin,
          anaMembership,
          { quotaCount: 2, quotaValueCents: 10_000, effectiveFrom: "2026-12", reason: "Aumento" },
          TODAY,
        ),
        DomainError,
        /ainda não venceu/,
      );
      const updated = await changeQuotas(
        admin,
        anaMembership,
        { quotaCount: 2, quotaValueCents: 10_000, effectiveFrom: "2027-03", reason: "Aumento de cotas" },
        TODAY,
      );
      expect(updated).toBe(9); // mar/2027 a nov/2027
      const m = await getMembershipDetail(anaMembership, TODAY);
      expect(m!.summary.installments.find((i) => i.competence === "2027-02")?.expectedCents).toBe(10_000);
      expect(m!.summary.installments.find((i) => i.competence === "2027-03")?.expectedCents).toBe(20_000);
      expect(m!.changes).toHaveLength(1);
    });

    it("saída no meio do ciclo cancela as parcelas seguintes (sem apagar)", async () => {
      const cancelled = await leaveCycle(admin, anaMembership, { leftAt: "2027-06-15", reason: "Mudança de cidade" });
      expect(cancelled).toBe(5); // jul a nov/2027
      const m = await getMembershipDetail(anaMembership, TODAY);
      expect(m!.status).toBe("LEFT");
      expect(m!.installments).toHaveLength(12); // nada apagado
      expect(m!.summary.installments).toHaveLength(7); // só as devidas
      await expect(db.installment.delete({ where: { id: m!.installments[0].id } })).rejects.toThrow(
        /Exclusão definitiva/,
      );
    });
  });
});
