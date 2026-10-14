/**
 * Painéis, prestação de contas, comunicados e recibos contra o banco de TESTES.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  listAnnouncementsForParticipant,
  saveAnnouncement,
  setAnnouncementPublished,
} from "@/modules/announcements/service";
import type { CurrentUser } from "@/modules/auth/session";
import { addMembership, createCycle, openCycle, publishRules } from "@/modules/cycles/service";
import { getAdminDashboard, getCollectiveReport } from "@/modules/dashboard/queries";
import { getLedgerOverview, recordManualEntry } from "@/modules/ledger/service";
import { registerPayment, reversePayment } from "@/modules/payments/service";
import { loadReceiptPayment, receiptCode } from "@/modules/receipts/service";

const enabled = Boolean(process.env.DATABASE_URL);
const TODAY = "2027-02-20";

async function makeUser(name: string, role: "ADMIN" | "PARTICIPANT"): Promise<CurrentUser> {
  const id = randomUUID();
  const email = `${id.slice(0, 8)}@painel.local`;
  await db.user.create({ data: { id, name, email, role } });
  const p =
    role === "PARTICIPANT"
      ? await db.participant.create({
          data: { fullName: name, email, joinedAt: new Date("2026-12-01T00:00:00Z"), userId: id },
        })
      : null;
  return { userId: id, name, email, role, status: "ACTIVE", participantId: p?.id ?? null };
}

describe.skipIf(!enabled)("painéis e prestação de contas (integração)", () => {
  let admin: CurrentUser;
  let carla: CurrentUser;
  let diego: CurrentUser;
  let outsider: CurrentUser;
  let cycleId: string;
  let otherCycleId: string;
  let carlaM: string;
  let confirmedPaymentId: string;

  beforeAll(async () => {
    admin = await makeUser("Admin Painel", "ADMIN");
    carla = await makeUser("Carla Nominho Unico", "PARTICIPANT");
    diego = await makeUser("Diego Sobrenome Raro", "PARTICIPANT");
    outsider = await makeUser("Fora do Ciclo", "PARTICIPANT");

    const base = {
      startDate: "2026-12-01",
      contributionEndDate: "2027-11-30",
      settlementDate: "2027-12-15",
      dueDay: 10,
      adminFeePercent: 1000,
      quotaValues: [5_000, 10_000],
      rulesText: "",
    };
    cycleId = (await createCycle(admin, { ...base, name: "Ciclo Painel" })).id;
    otherCycleId = (await createCycle(admin, { ...base, name: "Outro Ciclo" })).id;
    carlaM = (
      await addMembership(admin, cycleId, {
        participantId: carla.participantId!,
        quotaCount: 2,
        quotaValueCents: 5_000,
        joinedAt: "2026-12-01",
      })
    ).id;
    const diegoM = (
      await addMembership(admin, cycleId, {
        participantId: diego.participantId!,
        quotaCount: 1,
        quotaValueCents: 10_000,
        joinedAt: "2026-12-01",
      })
    ).id;
    await addMembership(admin, otherCycleId, {
      participantId: outsider.participantId!,
      quotaCount: 1,
      quotaValueCents: 5_000,
      joinedAt: "2026-12-01",
    });
    await publishRules(admin, cycleId);
    await openCycle(admin, cycleId);

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
    // Carla em dia (dez, jan, fev) ; Diego só pagou dezembro → em atraso em jan e fev.
    confirmedPaymentId = (await pay(carlaM, 30_000, "2026-12-08")).id;
    await pay(diegoM, 10_000, "2026-12-09");
    const reversed = await pay(diegoM, 10_000, "2027-01-09");
    await reversePayment(admin, { paymentId: reversed.id, reversedAt: "2027-01-15", reason: "Pix devolvido" }, TODAY);
    await recordManualEntry(admin, {
      cycleId,
      kind: "REVENUE",
      amountCents: 20_000,
      occurredOn: "2027-01-20",
      description: "Bazar do grupo",
    });
    await recordManualEntry(admin, {
      cycleId,
      kind: "EXPENSE",
      amountCents: 3_000,
      occurredOn: "2027-02-05",
      description: "Tarifa bancária",
    });
  });

  it("indicadores batem com o livro-caixa", async () => {
    const d = (await getAdminDashboard(cycleId, {}, TODAY))!;
    const ledger = await getLedgerOverview(cycleId);
    expect(d.kpis.cashCents).toBe(ledger.cashCents);
    expect(d.kpis.receivedCents).toBe(40_000); // estornado não conta
    expect(d.kpis.principalOwedCents).toBe(40_000);
    expect(d.kpis.expectedCents).toBe(12 * 20_000);
    expect(d.kpis.activeMembers).toBe(2);
    expect(d.kpis.quotas).toBe(3);
  });

  it("projeções: 10% só sobre resultado positivo, separado do principal", async () => {
    const d = (await getAdminDashboard(cycleId, {}, TODAY))!;
    expect(d.kpis.partialResultCents).toBe(17_000);
    expect(d.kpis.adminFeeProjectionCents).toBe(1_700);
    expect(d.kpis.participantsProjectionCents).toBe(15_300);
  });

  it("adimplência: Carla em dia, Diego em atraso", async () => {
    const d = (await getAdminDashboard(cycleId, {}, TODAY))!;
    expect(d.compliance.upToDate).toBe(1);
    expect(d.compliance.overdue).toBe(1);
    expect(d.compliance.overdueMembers[0]).toMatchObject({
      name: "Diego Sobrenome Raro",
      count: 2,
      overdueCents: 20_000,
    });
  });

  it("séries mensais somam o mesmo que o livro-caixa", async () => {
    const d = (await getAdminDashboard(cycleId, {}, TODAY))!;
    const net = d.series.reduce((s, p) => s + p.inCents - p.outCents, 0);
    expect(net).toBe(d.kpis.cashCents);
    expect(d.series.find((p) => p.competence === "2027-01")).toMatchObject({
      receivedCents: 0,
      inCents: 30_000,
      outCents: 10_000,
    });
  });

  it("filtro de período recorta os gráficos e é limitado aos meses do ciclo", async () => {
    const d = (await getAdminDashboard(cycleId, { from: "2027-01", to: "2027-02" }, TODAY))!;
    expect(d.series.map((p) => p.competence)).toEqual(["2027-01", "2027-02"]);
    const clamped = (await getAdminDashboard(cycleId, { from: "2020-01", to: "2099-12" }, TODAY))!;
    expect(clamped.period).toMatchObject({ from: "2026-12", to: "2027-11" });
    const invalid = (await getAdminDashboard(cycleId, { from: "abc", to: "2027-13" }, TODAY))!;
    expect(invalid.series).toHaveLength(12);
  });

  it("prestação de contas coletiva NÃO expõe nomes nem pagamentos individuais", async () => {
    const report = (await getCollectiveReport(cycleId, TODAY))!;
    const json = JSON.stringify(report);
    expect(json).not.toContain("Carla");
    expect(json).not.toContain("Diego");
    expect(json).not.toContain(carla.participantId!);
    expect(report.otherEntries.map((e) => e.description)).toEqual(["Bazar do grupo", "Tarifa bancária"]);
    expect(report.participants).toBe(2);
    expect(report.overview.cashCents).toBe(57_000);
  });

  it("comunicados: rascunho invisível; gerais para todos; de ciclo só para seus participantes", async () => {
    await saveAnnouncement(admin, { title: "Rascunho", body: "Ainda não", cycleId: null, publishNow: false });
    await saveAnnouncement(admin, { title: "Geral", body: "Para todos", cycleId: null, publishNow: true });
    const doCiclo = await saveAnnouncement(admin, {
      title: "Do ciclo",
      body: "Só ciclo painel",
      cycleId,
      publishNow: true,
    });

    const seenByCarla = (await listAnnouncementsForParticipant(carla.participantId)).map((a) => a.title);
    const seenByOutsider = (await listAnnouncementsForParticipant(outsider.participantId)).map((a) => a.title);
    expect(seenByCarla).toEqual(expect.arrayContaining(["Geral", "Do ciclo"]));
    expect(seenByCarla).not.toContain("Rascunho");
    expect(seenByOutsider).toContain("Geral");
    expect(seenByOutsider).not.toContain("Do ciclo");

    await setAnnouncementPublished(admin, doCiclo.id, false);
    expect((await listAnnouncementsForParticipant(carla.participantId)).map((a) => a.title)).not.toContain("Do ciclo");
  });

  it("código do recibo é estável e muda se o valor mudar", async () => {
    const p = (await loadReceiptPayment(confirmedPaymentId))!;
    const base = { id: p.id, amountCents: p.amountCents, receivedAt: p.receivedAt!, confirmedAt: p.confirmedAt! };
    const code = receiptCode(base);
    expect(code).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(receiptCode(base)).toBe(code);
    expect(receiptCode({ ...base, amountCents: base.amountCents + 1 })).not.toBe(code);
    expect(p.participantName).toBe("Carla Nominho Unico");
  });
});
