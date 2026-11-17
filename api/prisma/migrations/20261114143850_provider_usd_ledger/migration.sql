-- CreateEnum
CREATE TYPE "ProviderLedgerType" AS ENUM ('TOPUP', 'GENERATION_RESERVE', 'GENERATION_CAPTURE', 'GENERATION_RELEASE', 'CALIBRATION', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "ProviderTopUp" ADD COLUMN     "amountMicroUsd" BIGINT,
ADD COLUMN     "feeSteps" JSONB,
ADD COLUMN     "measured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "netWithdrawnXaf" INTEGER,
ADD COLUMN     "rOut" DECIMAL(12,4);

-- CreateTable
CREATE TABLE "ProviderLedger" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'higgsfield',
    "type" "ProviderLedgerType" NOT NULL,
    "amountMicroUsd" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "generationId" UUID,
    "topUpId" UUID,
    "fcfaPerUsd" DECIMAL(12,4),
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderBalanceCalibration" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'higgsfield',
    "readMicroUsd" BIGINT NOT NULL,
    "estimatedMicroUsd" BIGINT NOT NULL,
    "deltaMicroUsd" BIGINT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderBalanceCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderLedger_reference_key" ON "ProviderLedger"("reference");

-- CreateIndex
CREATE INDEX "ProviderLedger_provider_createdAt_idx" ON "ProviderLedger"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderLedger_type_createdAt_idx" ON "ProviderLedger"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderLedger_generationId_idx" ON "ProviderLedger"("generationId");

-- CreateIndex
CREATE INDEX "ProviderTopUp_provider_occurredAt_idx" ON "ProviderTopUp"("provider", "occurredAt");

-- AddForeignKey
ALTER TABLE "ProviderBalanceCalibration" ADD CONSTRAINT "ProviderBalanceCalibration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Journal en ajout seul (même règle que CreditLedger) ─────────────
-- Le solde prépayé du fournisseur n'est jamais écrit : il est la somme des mouvements. Toute modification ou
-- suppression est refusée, y compris depuis un client SQL. Une correction passe par un nouveau mouvement.
CREATE OR REPLACE FUNCTION forbid_provider_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProviderLedger est en ajout seul : % interdit', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER provider_ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON "ProviderLedger"
  FOR EACH ROW EXECUTE FUNCTION forbid_provider_ledger_mutation();

CREATE TRIGGER provider_ledger_no_truncate
  BEFORE TRUNCATE ON "ProviderLedger"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_provider_ledger_mutation();

-- Cohérence du signe selon le type de mouvement : un bug de signe ferait disparaître de l'argent.
ALTER TABLE "ProviderLedger" ADD CONSTRAINT provider_ledger_amount_sign CHECK (
  ("type" IN ('TOPUP', 'GENERATION_RELEASE') AND "amountMicroUsd" > 0)
  OR ("type" = 'GENERATION_RESERVE' AND "amountMicroUsd" < 0)
  OR ("type" = 'GENERATION_CAPTURE' AND "amountMicroUsd" = 0)
  OR ("type" IN ('CALIBRATION', 'ADJUSTMENT') AND "amountMicroUsd" <> 0)
);

-- Un mouvement de génération porte toujours sa génération ; une recharge porte toujours la sienne.
ALTER TABLE "ProviderLedger" ADD CONSTRAINT provider_ledger_origin CHECK (
  ("type" IN ('GENERATION_RESERVE', 'GENERATION_CAPTURE', 'GENERATION_RELEASE') AND "generationId" IS NOT NULL)
  OR ("type" = 'TOPUP' AND "topUpId" IS NOT NULL)
  OR "type" IN ('CALIBRATION', 'ADJUSTMENT')
);

-- Taux positif quand il est renseigné (0 ou négatif ferait exploser toute valorisation).
ALTER TABLE "ProviderLedger" ADD CONSTRAINT provider_ledger_rate_positive CHECK (
  "fcfaPerUsd" IS NULL OR "fcfaPerUsd" > 0
);

-- Mesures d'une recharge : positives quand elles existent. `measured` ne peut être vrai qu'avec les deux mesures.
ALTER TABLE "ProviderTopUp" ADD CONSTRAINT provider_topup_measures CHECK (
  ("amountMicroUsd" IS NULL OR "amountMicroUsd" > 0)
  AND ("netWithdrawnXaf" IS NULL OR "netWithdrawnXaf" > 0)
  AND ("rOut" IS NULL OR "rOut" > 0)
  AND ("measured" = false OR ("amountMicroUsd" IS NOT NULL AND "netWithdrawnXaf" IS NOT NULL AND "rOut" IS NOT NULL))
);

-- L'écart d'un calibrage est toujours la différence des deux soldes : il ne peut pas être saisi à la main.
ALTER TABLE "ProviderBalanceCalibration" ADD CONSTRAINT provider_calibration_delta CHECK (
  "deltaMicroUsd" = "readMicroUsd" - "estimatedMicroUsd" AND "readMicroUsd" >= 0
);
