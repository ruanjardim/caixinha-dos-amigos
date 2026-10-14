-- AlterTable
ALTER TABLE "distribution" ADD COLUMN     "ledgerTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "distribution_shareId_key" ON "distribution"("shareId");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_ledgerTransactionId_key" ON "distribution"("ledgerTransactionId");

-- AddForeignKey
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "ledger_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- Proteções da Fase 4 (resultados)
-- =============================================================================

-- Participações calculadas e pagamentos de distribuição nunca são alterados nem apagados.
CREATE TRIGGER result_share_append_only
  BEFORE UPDATE OR DELETE ON "result_share"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_change();

CREATE TRIGGER distribution_append_only
  BEFORE UPDATE OR DELETE ON "distribution"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_change();

-- Conciliações registradas não mudam (uma nova conciliação registra a nova leitura).
CREATE TRIGGER cash_reconciliation_append_only
  BEFORE UPDATE OR DELETE ON "cash_reconciliation"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_change();

-- Somente UMA apuração aprovada por ciclo.
CREATE UNIQUE INDEX result_calculation_one_approved
  ON "result_calculation" ("cycleId") WHERE "status" = 'APPROVED';
