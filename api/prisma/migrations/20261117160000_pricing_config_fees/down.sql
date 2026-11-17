-- Retour en arriere de pricing_config_fees.
ALTER TABLE "PricingConfig" DROP CONSTRAINT IF EXISTS pricing_config_fees_values;
ALTER TABLE "PricingConfig" DROP COLUMN IF EXISTS "revertedFromId";
ALTER TABLE "PricingConfig" DROP COLUMN IF EXISTS "quoteValiditySeconds";
ALTER TABLE "PricingConfig" DROP COLUMN IF EXISTS "minPurchaseXaf";
ALTER TABLE "PricingConfig" DROP COLUMN IF EXISTS "minMarginPercent";
ALTER TABLE "PricingConfig" DROP COLUMN IF EXISTS "topUpFeePercent";
ALTER TABLE "PricingConfig" DROP COLUMN IF EXISTS "momoToCardFeePercent";
ALTER TABLE "PricingConfig" DROP COLUMN IF EXISTS "withdrawalFeePercent";
