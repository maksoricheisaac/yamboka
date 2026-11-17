-- Retour en arriere de payment_observed_fees.
DROP INDEX IF EXISTS "Payment_country_methodCode_creditedAt_idx";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "expectedFeePercent";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "observedFeePercent";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "netReceived";
