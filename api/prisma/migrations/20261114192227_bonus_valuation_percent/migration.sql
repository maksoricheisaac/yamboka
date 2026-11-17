-- AlterTable
ALTER TABLE "PricingConfig" ADD COLUMN     "bonusValuationPercent" DECIMAL(7,4) NOT NULL DEFAULT 100;

-- Part du bonus à valoriser : 0 à 100 %. 100 au lancement = le bonus compte sur chaque crédit (prudent).
ALTER TABLE "PricingConfig" ADD CONSTRAINT pricing_config_bonus_valuation CHECK (
  "bonusValuationPercent" >= 0 AND "bonusValuationPercent" <= 100
);
