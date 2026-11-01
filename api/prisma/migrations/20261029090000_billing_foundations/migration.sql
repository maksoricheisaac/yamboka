-- CreateEnum
CREATE TYPE "CreditLotKind" AS ENUM ('PURCHASE', 'FIRST_PURCHASE_BONUS', 'ADMIN_ADJUST');

-- AlterTable
ALTER TABLE "CreditPack" ADD COLUMN     "firstPurchaseBonusPercent" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "clientFee" INTEGER,
ADD COLUMN     "debitedAmount" INTEGER,
ADD COLUMN     "feeSnapshot" JSONB,
ADD COLUMN     "firstPurchaseBonusPercent" INTEGER,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "network" TEXT,
ADD COLUMN     "sentAmount" INTEGER;

-- AlterTable
ALTER TABLE "ProviderTopUp" ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "saspayWithdrawnXaf" INTEGER;

-- CreateTable
CREATE TABLE "FeeRateOverride" (
    "id" UUID NOT NULL,
    "country" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "percent" DECIMAL(7,4) NOT NULL,
    "fixed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "floorAmount" DECIMAL(12,2),
    "capAmount" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeRateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLot" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "CreditLotKind" NOT NULL,
    "initialAmount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ledgerId" UUID,
    "paymentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotAllocation" (
    "id" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPricing" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerModel" TEXT NOT NULL,
    "resolution" TEXT,
    "usdPerSecond" DECIMAL(10,5) NOT NULL,
    "usdPerSecondWithAudio" DECIMAL(10,5),
    "minSeconds" INTEGER NOT NULL DEFAULT 1,
    "maxSeconds" INTEGER NOT NULL DEFAULT 10,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeRateOverride_country_network_key" ON "FeeRateOverride"("country", "network");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLot_ledgerId_key" ON "CreditLot"("ledgerId");

-- CreateIndex
CREATE INDEX "CreditLot_userId_expiresAt_idx" ON "CreditLot"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "LotAllocation_generationId_idx" ON "LotAllocation"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "LotAllocation_lotId_generationId_key" ON "LotAllocation"("lotId", "generationId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPricing_code_key" ON "ModelPricing"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "CreditLot" ADD CONSTRAINT "CreditLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLot" ADD CONSTRAINT "CreditLot_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "CreditLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLot" ADD CONSTRAINT "CreditLot_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotAllocation" ADD CONSTRAINT "LotAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CreditLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotAllocation" ADD CONSTRAINT "LotAllocation_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contraintes de cohérence (non exprimables dans le schéma Prisma).
ALTER TABLE "CreditPack" ADD CONSTRAINT credit_pack_first_bonus CHECK (
  "firstPurchaseBonusPercent" IS NULL OR "firstPurchaseBonusPercent" BETWEEN 0 AND 100
);
ALTER TABLE "Payment" ADD CONSTRAINT payment_sent_amount CHECK (
  "sentAmount" IS NULL OR ("sentAmount" > 0 AND "sentAmount" <= "amount")
);
ALTER TABLE "FeeRateOverride" ADD CONSTRAINT fee_rate_values CHECK (
  "percent" >= 0 AND "percent" < 100 AND "fixed" >= 0
  AND ("floorAmount" IS NULL OR "floorAmount" >= 0)
  AND ("capAmount" IS NULL OR "capAmount" >= 0)
  AND ("floorAmount" IS NULL OR "capAmount" IS NULL OR "floorAmount" <= "capAmount")
);
-- Un lot ne peut jamais être surconsommé ni recréditer au-delà de son montant initial.
ALTER TABLE "CreditLot" ADD CONSTRAINT credit_lot_amounts CHECK (
  "initialAmount" > 0 AND "remaining" >= 0 AND "remaining" <= "initialAmount"
);
ALTER TABLE "LotAllocation" ADD CONSTRAINT lot_allocation_amounts CHECK (
  "amount" > 0 AND "returned" >= 0 AND "returned" <= "amount"
);
ALTER TABLE "ModelPricing" ADD CONSTRAINT model_pricing_values CHECK (
  "usdPerSecond" > 0
  AND ("usdPerSecondWithAudio" IS NULL OR "usdPerSecondWithAudio" > 0)
  AND "minSeconds" >= 1 AND "minSeconds" <= "maxSeconds"
);
-- Un seul modèle de référence pour les équivalences « ≈ N vidéos ».
CREATE UNIQUE INDEX "ModelPricing_single_default" ON "ModelPricing" ("isDefault") WHERE "isDefault";
