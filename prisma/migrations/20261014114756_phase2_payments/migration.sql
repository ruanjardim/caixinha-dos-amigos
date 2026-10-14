/*
  Warnings:

  - You are about to drop the `payment_allocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "payment_allocation" DROP CONSTRAINT "payment_allocation_installmentId_fkey";

-- DropForeignKey
ALTER TABLE "payment_allocation" DROP CONSTRAINT "payment_allocation_paymentId_fkey";

-- AlterTable
ALTER TABLE "installment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "confirmationNote" TEXT,
ADD COLUMN     "registeredById" TEXT;

-- DropTable
DROP TABLE "payment_allocation";

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Proteções adicionais da Fase 2
-- =============================================================================

-- Parcelas previstas nunca são apagadas (saída/cancelamento usa "cancelledAt").
CREATE TRIGGER installment_no_delete
  BEFORE DELETE ON "installment"
  FOR EACH ROW EXECUTE FUNCTION caixinha_forbid_delete();

-- Ciclo de vida do pagamento:
--   PENDING      → UNDER_REVIEW | CONFIRMED | CANCELLED
--   UNDER_REVIEW → CONFIRMED | CANCELLED
--   CONFIRMED    → REVERSED
--   CANCELLED, REVERSED: finais
-- Depois de confirmado, valor, data, participante, meio e referência são imutáveis.
CREATE OR REPLACE FUNCTION caixinha_payment_lifecycle() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('CANCELLED', 'REVERSED') THEN
    RAISE EXCEPTION 'Pagamento % está % e não pode mais ser alterado.', OLD."id", OLD."status"
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'PENDING' AND NEW."status" IN ('UNDER_REVIEW', 'CONFIRMED', 'CANCELLED'))
    OR (OLD."status" = 'UNDER_REVIEW' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
    OR (OLD."status" = 'CONFIRMED' AND NEW."status" = 'REVERSED')
  ) THEN
    RAISE EXCEPTION 'Transição de status inválida: % → %.', OLD."status", NEW."status"
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD."status" = 'CONFIRMED' AND (
       NEW."amountCents" IS DISTINCT FROM OLD."amountCents"
    OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
    OR NEW."membershipId" IS DISTINCT FROM OLD."membershipId"
    OR NEW."method" IS DISTINCT FROM OLD."method"
    OR NEW."transactionRef" IS DISTINCT FROM OLD."transactionRef"
    OR NEW."confirmedById" IS DISTINCT FROM OLD."confirmedById"
    OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt"
  ) THEN
    RAISE EXCEPTION 'Pagamento confirmado não pode ter dados financeiros alterados. Use estorno.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW."status" = 'CONFIRMED' AND (NEW."receivedAt" IS NULL OR NEW."confirmedById" IS NULL) THEN
    RAISE EXCEPTION 'Pagamento confirmado exige data de crédito e responsável pela confirmação.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_lifecycle
  BEFORE UPDATE ON "payment"
  FOR EACH ROW EXECUTE FUNCTION caixinha_payment_lifecycle();

-- Pagamento não pode NASCER confirmado sem data e responsável.
CREATE OR REPLACE FUNCTION caixinha_payment_insert() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('REVERSED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Pagamento não pode ser criado com status %.', NEW."status"
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW."status" = 'CONFIRMED' AND (NEW."receivedAt" IS NULL OR NEW."confirmedById" IS NULL) THEN
    RAISE EXCEPTION 'Pagamento confirmado exige data de crédito e responsável pela confirmação.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_insert_check
  BEFORE INSERT ON "payment"
  FOR EACH ROW EXECUTE FUNCTION caixinha_payment_insert();
