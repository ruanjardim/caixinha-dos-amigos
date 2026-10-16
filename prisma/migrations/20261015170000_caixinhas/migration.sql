-- CreateEnum
CREATE TYPE "CaixinhaStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CaixinhaRole" AS ENUM ('OWNER', 'ADMIN', 'PARTICIPANT');

-- CreateTable
CREATE TABLE "caixinha" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "CaixinhaStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caixinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caixinha_member" (
    "id" TEXT NOT NULL,
    "caixinhaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CaixinhaRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caixinha_member_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "cycle" ADD COLUMN "caixinhaId" TEXT;
ALTER TABLE "participant" ADD COLUMN "caixinhaId" TEXT;
ALTER TABLE "announcement" ADD COLUMN "caixinhaId" TEXT;

-- Backfill: transforma os dados já existentes na primeira caixinha, sem perda.
INSERT INTO "caixinha" ("id", "name", "slug", "description", "ownerId", "createdAt", "updatedAt")
SELECT
    'legacy_default_caixinha',
    'Caixinha dos Amigos',
    'caixinha-dos-amigos',
    'Caixinha principal criada a partir dos dados existentes.',
    u."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "user" u
ORDER BY CASE WHEN u."role" = 'ADMIN' THEN 0 ELSE 1 END, u."createdAt"
LIMIT 1;

UPDATE "cycle"
SET "caixinhaId" = 'legacy_default_caixinha'
WHERE EXISTS (SELECT 1 FROM "caixinha" WHERE "id" = 'legacy_default_caixinha');

UPDATE "participant"
SET "caixinhaId" = 'legacy_default_caixinha'
WHERE EXISTS (SELECT 1 FROM "caixinha" WHERE "id" = 'legacy_default_caixinha');

UPDATE "announcement" a
SET "caixinhaId" = COALESCE(
    (SELECT c."caixinhaId" FROM "cycle" c WHERE c."id" = a."cycleId"),
    'legacy_default_caixinha'
)
WHERE EXISTS (SELECT 1 FROM "caixinha" WHERE "id" = 'legacy_default_caixinha');

-- O primeiro administrador é o responsável; os demais mantêm acesso administrativo.
INSERT INTO "caixinha_member" ("id", "caixinhaId", "userId", "role", "createdAt", "updatedAt")
SELECT
    'legacy_member_' || md5(u."id"),
    'legacy_default_caixinha',
    u."id",
    CASE
      WHEN u."id" = (SELECT "ownerId" FROM "caixinha" WHERE "id" = 'legacy_default_caixinha') THEN 'OWNER'::"CaixinhaRole"
      WHEN u."role" = 'ADMIN' THEN 'ADMIN'::"CaixinhaRole"
      ELSE 'PARTICIPANT'::"CaixinhaRole"
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "user" u
WHERE EXISTS (SELECT 1 FROM "caixinha" WHERE "id" = 'legacy_default_caixinha')
  AND (u."role" = 'ADMIN' OR EXISTS (SELECT 1 FROM "participant" p WHERE p."userId" = u."id"));

-- CreateIndex
CREATE UNIQUE INDEX "caixinha_slug_key" ON "caixinha"("slug");
CREATE INDEX "caixinha_ownerId_idx" ON "caixinha"("ownerId");
CREATE INDEX "caixinha_status_idx" ON "caixinha"("status");
CREATE UNIQUE INDEX "caixinha_member_caixinhaId_userId_key" ON "caixinha_member"("caixinhaId", "userId");
CREATE INDEX "caixinha_member_userId_idx" ON "caixinha_member"("userId");
CREATE INDEX "cycle_caixinhaId_idx" ON "cycle"("caixinhaId");
CREATE INDEX "participant_caixinhaId_idx" ON "participant"("caixinhaId");
CREATE INDEX "announcement_caixinhaId_idx" ON "announcement"("caixinhaId");

-- AddForeignKey
ALTER TABLE "caixinha" ADD CONSTRAINT "caixinha_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "caixinha_member" ADD CONSTRAINT "caixinha_member_caixinhaId_fkey" FOREIGN KEY ("caixinhaId") REFERENCES "caixinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "caixinha_member" ADD CONSTRAINT "caixinha_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_caixinhaId_fkey" FOREIGN KEY ("caixinhaId") REFERENCES "caixinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "participant" ADD CONSTRAINT "participant_caixinhaId_fkey" FOREIGN KEY ("caixinhaId") REFERENCES "caixinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_caixinhaId_fkey" FOREIGN KEY ("caixinhaId") REFERENCES "caixinha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
