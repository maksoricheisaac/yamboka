-- Retour en arrière de la migration provider_usd_ledger. Purement additive : rien d'existant n'a été modifié,
-- donc la défaire ne perd que les données du journal USD lui-même (recharges enrichies comprises).
DROP TRIGGER IF EXISTS provider_ledger_no_truncate ON "ProviderLedger";
DROP TRIGGER IF EXISTS provider_ledger_no_update_delete ON "ProviderLedger";
DROP FUNCTION IF EXISTS forbid_provider_ledger_mutation();
DROP TABLE IF EXISTS "ProviderBalanceCalibration";
DROP TABLE IF EXISTS "ProviderLedger";
DROP TYPE IF EXISTS "ProviderLedgerType";
ALTER TABLE "ProviderTopUp" DROP CONSTRAINT IF EXISTS provider_topup_measures;
DROP INDEX IF EXISTS "ProviderTopUp_provider_occurredAt_idx";
ALTER TABLE "ProviderTopUp"
  DROP COLUMN IF EXISTS "amountMicroUsd",
  DROP COLUMN IF EXISTS "netWithdrawnXaf",
  DROP COLUMN IF EXISTS "feeSteps",
  DROP COLUMN IF EXISTS "rOut",
  DROP COLUMN IF EXISTS "measured";
