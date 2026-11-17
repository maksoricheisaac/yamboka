-- Retour en arrière de versioned_pricing_config. Additive : les réglages d'origine (table Setting) et les
-- tarifs sur GenerationProduct n'ont pas été touchés, donc rien d'autre n'est à restaurer.
DROP TRIGGER IF EXISTS model_price_no_truncate ON "ModelPrice";
DROP TRIGGER IF EXISTS model_price_no_update_delete ON "ModelPrice";
DROP TRIGGER IF EXISTS pricing_config_no_truncate ON "PricingConfig";
DROP TRIGGER IF EXISTS pricing_config_no_update_delete ON "PricingConfig";
DROP FUNCTION IF EXISTS forbid_pricing_mutation();
DROP TABLE IF EXISTS "ModelPrice";
DROP TABLE IF EXISTS "PricingConfig";
DROP TYPE IF EXISTS "ModelPriceSource";
