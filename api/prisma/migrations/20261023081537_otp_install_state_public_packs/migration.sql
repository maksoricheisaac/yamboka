-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('VERIFY_EMAIL', 'LOGIN', 'SENSITIVE_ACTION');

-- AlterTable
ALTER TABLE "CreditPack" ADD COLUMN     "publicVisible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmailOtp" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "userId" UUID,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminUserId" UUID,

    CONSTRAINT "InstallState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailOtp_email_purpose_createdAt_idx" ON "EmailOtp"("email", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "EmailOtp_expiresAt_idx" ON "EmailOtp"("expiresAt");

-- Un seul état d'installation possible (singleton).
ALTER TABLE "InstallState" ADD CONSTRAINT "InstallState_singleton" CHECK ("id" = 1);

-- Installations existantes (administrateur créé par le seed) : l'assistant de configuration est verrouillé.
INSERT INTO "InstallState" ("id", "completedAt", "adminUserId")
SELECT 1, NOW(), (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" LIMIT 1)
WHERE EXISTS (SELECT 1 FROM "User" WHERE "role" = 'ADMIN');

-- Offre publique réduite à trois packs (entrée, recommandé, régulier). Tarifs et crédits inchangés ;
-- l'administrateur peut modifier la sélection.
UPDATE "CreditPack" SET "publicVisible" = true
WHERE "country" = 'CG' AND "name" IN ('Découverte', 'Créateur', 'Pro');
