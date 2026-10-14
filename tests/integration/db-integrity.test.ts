/**
 * Verifica as proteções de integridade aplicadas no PRÓPRIO banco de dados
 * (migration `integrity_triggers`). Tudo roda dentro de uma transação que é
 * desfeita no final — o banco de desenvolvimento não é alterado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
const client = new Client({ connectionString: url });

/** Executa `sql` esperando erro, sem abortar a transação externa. */
async function expectDbError(sql: string, params: unknown[], message: RegExp) {
  await client.query("SAVEPOINT t");
  try {
    await client.query(sql, params);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    throw new Error("Era esperado um erro do banco, mas a operação foi aceita.");
  } catch (err) {
    expect((err as Error).message).toMatch(message);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT t");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
  }
}

describe.skipIf(!url)("integridade no banco de dados", () => {
  beforeAll(async () => {
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "user" (id, name, email, "updatedAt") VALUES ('t-user', 'Teste', 't@t.local', now())`,
    );
    await client.query(
      `INSERT INTO cycle (id, name, "startDate", "contributionEndDate", "settlementDate", status, "updatedAt")
       VALUES ('t-open', 'Aberto', '2026-12-01', '2027-11-30', '2027-12-15', 'OPEN', now()),
              ('t-closed', 'Encerrado', '2025-12-01', '2026-11-30', '2026-12-15', 'CLOSED', now()),
              ('t-draft', 'Rascunho', '2027-12-01', '2028-11-30', '2028-12-15', 'DRAFT', now())`,
    );
  });

  afterAll(async () => {
    await client.query("ROLLBACK");
    await client.end();
  });

  async function insertLedgerTx(id: string, cycleId: string, postClosing = false) {
    await client.query(
      `INSERT INTO ledger_transaction (id, "cycleId", "occurredOn", category, description, "createdById", "postClosing")
       VALUES ($1, $2, '2026-12-05', 'CONTRIBUTION', 'teste', 't-user', $3)`,
      [id, cycleId, postClosing],
    );
  }

  it("aceita lançamento balanceado (soma zero)", async () => {
    await client.query("SAVEPOINT ok");
    await insertLedgerTx("t-bal", "t-open");
    await client.query(
      `INSERT INTO ledger_line (id, "transactionId", account, "amountCents")
       VALUES ('l1', 't-bal', 'CASH', 10000), ('l2', 't-bal', 'PARTICIPANT_PRINCIPAL', -10000)`,
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    await client.query("RELEASE SAVEPOINT ok");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
  });

  it("rejeita lançamento desbalanceado", async () => {
    await client.query("SAVEPOINT pre");
    await insertLedgerTx("t-unbal", "t-open");
    await expectDbError(
      `INSERT INTO ledger_line (id, "transactionId", account, "amountCents")
       VALUES ('l3', 't-unbal', 'CASH', 10000), ('l4', 't-unbal', 'PARTICIPANT_PRINCIPAL', -9999)`,
      [],
      /desbalanceado/,
    );
    await client.query("ROLLBACK TO SAVEPOINT pre");
  });

  it("linhas do livro-caixa não podem ser alteradas nem apagadas", async () => {
    await expectDbError(`UPDATE ledger_line SET "amountCents" = 1 WHERE id = 'l1'`, [], /somente-inclusão/);
    await expectDbError(`DELETE FROM ledger_line WHERE id = 'l1'`, [], /somente-inclusão/);
    await expectDbError(`DELETE FROM ledger_transaction WHERE id = 't-bal'`, [], /somente-inclusão/);
  });

  it("auditoria é somente-inclusão", async () => {
    await client.query(`INSERT INTO audit_log (id, action, "entityType") VALUES ('t-audit', 'teste', 'Teste')`);
    await expectDbError(`UPDATE audit_log SET action = 'x' WHERE id = 't-audit'`, [], /somente-inclusão/);
    await expectDbError(`DELETE FROM audit_log WHERE id = 't-audit'`, [], /somente-inclusão/);
  });

  it("ciclo encerrado não aceita lançamentos comuns", async () => {
    await expectDbError(
      `INSERT INTO ledger_transaction (id, "cycleId", "occurredOn", category, description, "createdById")
       VALUES ('t-x', 't-closed', '2026-12-05', 'ADJUSTMENT', 'x', 't-user')`,
      [],
      /Ciclo encerrado/,
    );
  });

  it("ciclo encerrado aceita correção pelo procedimento pós-encerramento", async () => {
    await client.query("SAVEPOINT pc");
    await insertLedgerTx("t-post", "t-closed", true);
    await client.query("ROLLBACK TO SAVEPOINT pc");
  });

  it("ciclo em rascunho não aceita lançamentos", async () => {
    await expectDbError(
      `INSERT INTO ledger_transaction (id, "cycleId", "occurredOn", category, description, "createdById")
       VALUES ('t-y', 't-draft', '2027-12-05', 'ADJUSTMENT', 'x', 't-user')`,
      [],
      /rascunho/,
    );
  });

  it("regras congeladas não podem ser alteradas", async () => {
    await client.query(
      `INSERT INTO cycle_rules (id, "cycleId", version, "quotaValuesCents", "rulesText", "frozenAt")
       VALUES ('t-rules', 't-open', 1, '{5000,10000}', 'Regras', now())`,
    );
    await expectDbError(`UPDATE cycle_rules SET "adminFeeBps" = 2000 WHERE id = 't-rules'`, [], /congeladas/);
  });

  it("pagamentos não podem ser apagados e não aceitam valor zero", async () => {
    await client.query(
      `INSERT INTO participant (id, "fullName", email, "joinedAt", "updatedAt") VALUES ('t-p', 'P', 'p@t.local', '2026-12-01', now())`,
    );
    await client.query(
      `INSERT INTO membership (id, "participantId", "cycleId", "quotaCount", "quotaValueCents", "joinedAt", "updatedAt")
       VALUES ('t-m', 't-p', 't-open', 2, 5000, '2026-12-01', now())`,
    );
    await client.query(
      `INSERT INTO payment (id, "membershipId", "amountCents", method, "transactionRef", "updatedAt")
       VALUES ('t-pay', 't-m', 10000, 'PIX_MANUAL', 'E123', now())`,
    );
    await expectDbError(`DELETE FROM payment WHERE id = 't-pay'`, [], /Exclusão definitiva/);
    await expectDbError(
      `INSERT INTO payment (id, "membershipId", "amountCents", method, "updatedAt") VALUES ('t-pay0', 't-m', 0, 'CASH', now())`,
      [],
      /payment_amount_positive/,
    );
  });

  it("impede registrar duas vezes a mesma transação (anti-duplicidade)", async () => {
    await expectDbError(
      `INSERT INTO payment (id, "membershipId", "amountCents", method, "transactionRef", "updatedAt")
       VALUES ('t-pay2', 't-m', 10000, 'PIX_MANUAL', 'E123', now())`,
      [],
      /duplicate key|unique/i,
    );
  });

  it("recursos sensíveis começam desligados", async () => {
    const { rows } = await client.query(`SELECT key, enabled FROM feature_flag ORDER BY key`);
    expect(rows).toEqual([
      { key: "ADMIN_PAYOUT_ENABLED", enabled: false },
      { key: "PIX_LIVE_ENABLED", enabled: false },
      { key: "RAFFLE_SALES_ENABLED", enabled: false },
    ]);
  });
});
