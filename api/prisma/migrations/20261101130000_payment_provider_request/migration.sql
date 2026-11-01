-- SasPay : requête d'initiation conservée pour être rejouée à l'identique (même Idempotency-Key, même corps).
-- Modification additive : une colonne facultative, aucun paiement existant n'est touché.
ALTER TABLE "Payment" ADD COLUMN "providerRequest" JSONB;
