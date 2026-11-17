-- Retour en arrière de model_catalog. Additive : GenerationProduct, ModelPrice et ModelPricing n'ont pas
-- été touchés, donc le code précédent retrouve exactement ses données.
ALTER TABLE "Generation" DROP CONSTRAINT IF EXISTS "Generation_modelId_fkey";
ALTER TABLE "Generation" DROP COLUMN IF EXISTS "providerInput";
ALTER TABLE "Generation" DROP COLUMN IF EXISTS "modelSlug";
ALTER TABLE "Generation" DROP COLUMN IF EXISTS "modelId";
-- La colonne redevient obligatoire : les générations créées entre-temps sans produit doivent être
-- rattachées à un produit AVANT de revenir en arrière, sinon cette instruction échoue (volontairement).
ALTER TABLE "Generation" ALTER COLUMN "productId" SET NOT NULL;
DROP TRIGGER IF EXISTS model_option_price_no_truncate ON "ModelOptionPrice";
DROP TRIGGER IF EXISTS model_option_price_no_update_delete ON "ModelOptionPrice";
DROP TABLE IF EXISTS "ModelOptionPrice";
DROP TABLE IF EXISTS "ModelParam";
DROP TABLE IF EXISTS "GenerationModel";
DROP TYPE IF EXISTS "ModelOptionPriceKind";
DROP TYPE IF EXISTS "ModelParamExposure";
DROP TYPE IF EXISTS "ModelParamRole";
DROP TYPE IF EXISTS "ModelParamType";
DROP TYPE IF EXISTS "GenerationMode";
