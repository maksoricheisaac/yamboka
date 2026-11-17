-- Retour en arriere de topup_rate_approval : le taux mesure redevient applique d'office.
DROP INDEX IF EXISTS "ProviderTopUp_provider_appliedToPricingAt_idx";
ALTER TABLE "ProviderTopUp" DROP COLUMN IF EXISTS "appliedToPricingAt";
