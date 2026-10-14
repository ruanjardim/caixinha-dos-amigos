-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "pix_charge" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "endToEndId" TEXT,
ADD COLUMN     "membershipId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "webhook_event" ADD COLUMN     "chargeId" TEXT,
ADD COLUMN     "eventType" TEXT,
ADD COLUMN     "outcome" TEXT;

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_dedupeKey_key" ON "notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- CreateIndex
CREATE INDEX "pix_charge_status_idx" ON "pix_charge"("status");

-- AddForeignKey
ALTER TABLE "pix_charge" ADD CONSTRAINT "pix_charge_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "pix_charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Eventos de webhook são o registro bruto do que o provedor enviou: nunca mudam o conteúdo nem são apagados.
CREATE OR REPLACE FUNCTION caixinha_webhook_event_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Eventos de webhook não podem ser apagados.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."externalId" IS DISTINCT FROM OLD."externalId"
     OR NEW."signatureValid" IS DISTINCT FROM OLD."signatureValid" THEN
    RAISE EXCEPTION 'O conteúdo de um evento de webhook não pode ser alterado.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_event_guard
  BEFORE UPDATE OR DELETE ON "webhook_event"
  FOR EACH ROW EXECUTE FUNCTION caixinha_webhook_event_guard();
