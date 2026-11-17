-- Retour en arrière de generation_frozen_cost : colonnes ajoutées uniquement, aucune donnée existante touchée.
ALTER TABLE "Generation" DROP CONSTRAINT IF EXISTS generation_frozen_cost_values;
ALTER TABLE "Generation"
  DROP COLUMN IF EXISTS "costMicroUsd",
  DROP COLUMN IF EXISTS "pricingRate",
  DROP COLUMN IF EXISTS "marginPercent",
  DROP COLUMN IF EXISTS "priceFcfa",
  DROP COLUMN IF EXISTS "modelPriceId",
  DROP COLUMN IF EXISTS "pricingConfigId";
