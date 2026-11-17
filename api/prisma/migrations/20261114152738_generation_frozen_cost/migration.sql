-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "costMicroUsd" BIGINT,
ADD COLUMN     "marginPercent" DECIMAL(7,4),
ADD COLUMN     "modelPriceId" UUID,
ADD COLUMN     "priceFcfa" INTEGER,
ADD COLUMN     "pricingConfigId" UUID,
ADD COLUMN     "pricingRate" DECIMAL(12,4);

-- Un coût figé ne peut être que positif quand il existe (les anciennes créations n'en ont pas).
ALTER TABLE "Generation" ADD CONSTRAINT generation_frozen_cost_values CHECK (
  ("costMicroUsd" IS NULL OR "costMicroUsd" > 0)
  AND ("pricingRate" IS NULL OR "pricingRate" > 0)
  AND ("marginPercent" IS NULL OR "marginPercent" >= 0)
  AND ("priceFcfa" IS NULL OR "priceFcfa" > 0)
);
