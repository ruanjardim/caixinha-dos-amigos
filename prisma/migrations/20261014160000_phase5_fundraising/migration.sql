-- AlterTable
ALTER TABLE "fundraising_activity" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "drawRecordedById" TEXT,
ADD COLUMN     "drawSource" TEXT,
ADD COLUMN     "endsOn" DATE,
ADD COLUMN     "startsOn" DATE;

-- AlterTable
ALTER TABLE "prize" ADD COLUMN     "winningNumber" INTEGER;

-- AlterTable
ALTER TABLE "raffle_number" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "ledgerTransactionId" TEXT,
ADD COLUMN     "reservedAt" TIMESTAMP(3),
ADD COLUMN     "transactionRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "raffle_number_ledgerTransactionId_key" ON "raffle_number"("ledgerTransactionId");

-- AddForeignKey
ALTER TABLE "raffle_number" ADD CONSTRAINT "raffle_number_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "ledger_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =============================================================================
-- Proteções da Fase 5 (arrecadação)
-- =============================================================================

-- Pareceres de conformidade são registros permanentes.
CREATE TRIGGER compliance_approval_append_only
  BEFORE UPDATE OR DELETE ON "compliance_approval"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_change();

-- Números de sorteio nunca são apagados.
CREATE TRIGGER raffle_number_no_delete
  BEFORE DELETE ON "raffle_number"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_delete();

-- Número confirmado não volta atrás, não troca de dono e não perde a identificação.
CREATE OR REPLACE FUNCTION caixinha_raffle_number_lifecycle() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'CONFIRMED' AND (
       NEW."status" <> 'CONFIRMED'
    OR NEW."participantId" IS DISTINCT FROM OLD."participantId"
    OR NEW."transactionRef" IS DISTINCT FROM OLD."transactionRef"
    OR NEW."isSimulation" IS DISTINCT FROM OLD."isSimulation"
  ) THEN
    RAISE EXCEPTION 'Número de sorteio confirmado não pode ser alterado.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER raffle_number_lifecycle
  BEFORE UPDATE ON "raffle_number"
  FOR EACH ROW EXECUTE FUNCTION caixinha_raffle_number_lifecycle();
