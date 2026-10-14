-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'OPEN', 'CONTRIBUTIONS_CLOSED', 'SETTLING', 'CLOSED');

-- CreateEnum
CREATE TYPE "DistributionMethod" AS ENUM ('DAILY_BALANCE');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX_MANUAL', 'PIX_SIMULATED', 'PIX_PROVIDER', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'CONFIRMED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('CASH', 'PARTICIPANT_PRINCIPAL', 'ADDITIONAL_REVENUE', 'EXPENSE', 'TAX', 'ADMIN_FEE', 'RESULT_TO_DISTRIBUTE');

-- CreateEnum
CREATE TYPE "LedgerCategory" AS ENUM ('CONTRIBUTION', 'CONTRIBUTION_REVERSAL', 'ADDITIONAL_REVENUE', 'ADMIN_EXPENSE', 'ACTIVITY_COST', 'TAX', 'ADJUSTMENT', 'REVERSAL', 'ADMIN_FEE', 'DISTRIBUTION', 'PRINCIPAL_RETURN');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('EVENT', 'PRODUCT_SALE', 'DONATION', 'RAFFLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RaffleNumberStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PixChargeStatus" AS ENUM ('CREATED', 'ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "contributionEndDate" DATE NOT NULL,
    "settlementDate" DATE NOT NULL,
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_rules" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "adminFeeBps" INTEGER NOT NULL DEFAULT 1000,
    "distributionMethod" "DistributionMethod" NOT NULL DEFAULT 'DAILY_BALANCE',
    "quotaValuesCents" INTEGER[],
    "rulesText" TEXT NOT NULL,
    "contentHash" TEXT,
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cycle_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules_acceptance" (
    "id" TEXT NOT NULL,
    "cycleRulesId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "rules_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "joinedAt" DATE NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "quotaCount" INTEGER NOT NULL,
    "quotaValueCents" INTEGER NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" DATE NOT NULL,
    "leftAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_change" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "previousQuotaCount" INTEGER NOT NULL,
    "newQuotaCount" INTEGER NOT NULL,
    "previousQuotaValueCts" INTEGER NOT NULL,
    "newQuotaValueCts" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "expectedCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "receivedAt" DATE,
    "method" "PaymentMethod" NOT NULL,
    "transactionRef" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "reversedAt" DATE,
    "reversalReason" TEXT,
    "idempotencyKey" TEXT,
    "proofFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transaction" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "category" "LedgerCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "paymentId" TEXT,
    "reversesId" TEXT,
    "activityId" TEXT,
    "attachmentId" TEXT,
    "postClosing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_line" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "membershipId" TEXT,

    CONSTRAINT "ledger_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_reconciliation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "referenceDate" DATE NOT NULL,
    "bookBalanceCents" INTEGER NOT NULL,
    "statementBalanceCents" INTEGER NOT NULL,
    "differenceCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_calculation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleRulesId" TEXT NOT NULL,
    "cutoffDate" DATE NOT NULL,
    "revenueCents" INTEGER NOT NULL,
    "expenseCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "netResultCents" INTEGER NOT NULL,
    "adminFeeCents" INTEGER NOT NULL,
    "distributableCents" INTEGER NOT NULL,
    "availableCashCents" INTEGER NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_calculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_share" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "weight" BIGINT NOT NULL,
    "shareCents" INTEGER NOT NULL,

    CONSTRAINT "result_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "resultCents" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "transactionRef" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fundraising_activity" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActivityStatus" NOT NULL DEFAULT 'DRAFT',
    "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "simulationOnly" BOOLEAN NOT NULL DEFAULT true,
    "numberRangeStart" INTEGER,
    "numberRangeEnd" INTEGER,
    "unitPriceCents" INTEGER,
    "promotionRules" TEXT,
    "drawResult" TEXT,
    "drawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fundraising_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "prize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_image" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,

    CONSTRAINT "activity_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_participant" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raffle_number" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "RaffleNumberStatus" NOT NULL DEFAULT 'AVAILABLE',
    "participantId" TEXT,
    "isSimulation" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raffle_number_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_approval" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "legalModality" TEXT NOT NULL,
    "authorization" TEXT,
    "documentFileId" TEXT,
    "legalOpinion" TEXT NOT NULL,
    "decision" "ComplianceStatus" NOT NULL,
    "decidedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pix_charge" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "copyPaste" TEXT,
    "qrCodeData" TEXT,
    "status" "PixChargeStatus" NOT NULL DEFAULT 'CREATED',
    "expiresAt" TIMESTAMP(3),
    "isSimulation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pix_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_upload" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_rules_cycleId_version_key" ON "cycle_rules"("cycleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "rules_acceptance_cycleRulesId_participantId_key" ON "rules_acceptance"("cycleRulesId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_userId_key" ON "participant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "participant_email_key" ON "participant"("email");

-- CreateIndex
CREATE INDEX "participant_fullName_idx" ON "participant"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "membership_participantId_cycleId_key" ON "membership"("participantId", "cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "installment_membershipId_competence_key" ON "installment"("membershipId", "competence");

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotencyKey_key" ON "payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_membershipId_status_idx" ON "payment"("membershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_transactionRef_key" ON "payment"("method", "transactionRef");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocation_paymentId_installmentId_key" ON "payment_allocation"("paymentId", "installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transaction_paymentId_key" ON "ledger_transaction"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transaction_reversesId_key" ON "ledger_transaction"("reversesId");

-- CreateIndex
CREATE INDEX "ledger_transaction_cycleId_occurredOn_idx" ON "ledger_transaction"("cycleId", "occurredOn");

-- CreateIndex
CREATE INDEX "ledger_line_account_idx" ON "ledger_line"("account");

-- CreateIndex
CREATE INDEX "ledger_line_membershipId_idx" ON "ledger_line"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "result_share_calculationId_membershipId_key" ON "result_share"("calculationId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_participant_activityId_participantId_key" ON "activity_participant"("activityId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "raffle_number_activityId_number_key" ON "raffle_number"("activityId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "pix_charge_paymentId_key" ON "pix_charge"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "pix_charge_provider_externalId_key" ON "pix_charge"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_externalId_key" ON "webhook_event"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "file_upload_storageKey_key" ON "file_upload"("storageKey");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_rules" ADD CONSTRAINT "cycle_rules_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules_acceptance" ADD CONSTRAINT "rules_acceptance_cycleRulesId_fkey" FOREIGN KEY ("cycleRulesId") REFERENCES "cycle_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules_acceptance" ADD CONSTRAINT "rules_acceptance_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant" ADD CONSTRAINT "participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_change" ADD CONSTRAINT "membership_change_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment" ADD CONSTRAINT "installment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "file_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocation" ADD CONSTRAINT "payment_allocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "installment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "ledger_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "fundraising_activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "file_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_line" ADD CONSTRAINT "ledger_line_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_reconciliation" ADD CONSTRAINT "cash_reconciliation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_calculation" ADD CONSTRAINT "result_calculation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_calculation" ADD CONSTRAINT "result_calculation_cycleRulesId_fkey" FOREIGN KEY ("cycleRulesId") REFERENCES "cycle_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_share" ADD CONSTRAINT "result_share_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "result_calculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_share" ADD CONSTRAINT "result_share_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "result_share"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fundraising_activity" ADD CONSTRAINT "fundraising_activity_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prize" ADD CONSTRAINT "prize_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "fundraising_activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_image" ADD CONSTRAINT "activity_image_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "fundraising_activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_image" ADD CONSTRAINT "activity_image_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_participant" ADD CONSTRAINT "activity_participant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "fundraising_activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_participant" ADD CONSTRAINT "activity_participant_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raffle_number" ADD CONSTRAINT "raffle_number_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "fundraising_activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raffle_number" ADD CONSTRAINT "raffle_number_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_approval" ADD CONSTRAINT "compliance_approval_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "fundraising_activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_approval" ADD CONSTRAINT "compliance_approval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_charge" ADD CONSTRAINT "pix_charge_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
