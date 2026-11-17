-- Retour en arrière : colonne ajoutée uniquement (valeur par défaut 100 = comportement prudent du lancement).
ALTER TABLE "PricingConfig" DROP CONSTRAINT IF EXISTS pricing_config_bonus_valuation;
ALTER TABLE "PricingConfig" DROP COLUMN IF EXISTS "bonusValuationPercent";
