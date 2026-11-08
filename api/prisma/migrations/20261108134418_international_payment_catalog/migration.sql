-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'COMING_SOON', 'DISABLED');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('MOBILE_MONEY', 'CARD', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "CurrencySetting" ADD COLUMN     "maxAmount" INTEGER,
ADD COLUMN     "minAmount" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "countryName" TEXT,
ADD COLUMN     "methodCode" TEXT,
ADD COLUMN     "methodName" TEXT;

-- CreateTable
CREATE TABLE "Country" (
    "iso" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dialCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DISABLED',
    "indicativeFeePercent" DECIMAL(6,3),
    "indicativeFeeNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("iso")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CountryPaymentMethod" (
    "id" UUID NOT NULL,
    "countryIso" TEXT NOT NULL,
    "methodCode" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'DISABLED',
    "saspayNetwork" TEXT,
    "limitation" TEXT,
    "indicativeFeePercent" DECIMAL(6,3),
    "indicativeFeeNote" TEXT,
    "note" TEXT,
    "config" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Country_status_sortOrder_idx" ON "Country"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "CountryPaymentMethod_methodCode_idx" ON "CountryPaymentMethod"("methodCode");

-- CreateIndex
CREATE INDEX "CountryPaymentMethod_status_idx" ON "CountryPaymentMethod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CountryPaymentMethod_countryIso_methodCode_key" ON "CountryPaymentMethod"("countryIso", "methodCode");

-- CreateIndex
CREATE INDEX "Payment_createdAt_id_idx" ON "Payment"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Payment_gateway_createdAt_idx" ON "Payment"("gateway", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_country_createdAt_idx" ON "Payment"("country", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_methodCode_idx" ON "Payment"("methodCode");

-- AddForeignKey
ALTER TABLE "CountryPaymentMethod" ADD CONSTRAINT "CountryPaymentMethod_countryIso_fkey" FOREIGN KEY ("countryIso") REFERENCES "Country"("iso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryPaymentMethod" ADD CONSTRAINT "CountryPaymentMethod_methodCode_fkey" FOREIGN KEY ("methodCode") REFERENCES "PaymentMethod"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Le réglage « commission OpenPay » devient « commission de paiement » (OpenPay est supprimé ; la valeur est conservée).
UPDATE "Setting" SET "key" = 'paymentCommissionPercent'
WHERE "key" = 'openpayCommissionPercent'
  AND NOT EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'paymentCommissionPercent');
