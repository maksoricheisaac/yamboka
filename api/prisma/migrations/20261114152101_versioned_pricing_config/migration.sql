-- CreateEnum
CREATE TYPE "ModelPriceSource" AS ENUM ('MANUAL', 'ESTIMATE');

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" UUID NOT NULL,
    "marginPercent" DECIMAL(7,4) NOT NULL,
    "fxBufferPercent" DECIMAL(7,4) NOT NULL,
    "cardFcfaPerUsd" DECIMAL(12,4) NOT NULL,
    "circuitLossPercent" DECIMAL(7,4) NOT NULL,
    "safetyMarginMicroUsd" BIGINT NOT NULL,
    "dailyCapMicroUsd" BIGINT NOT NULL,
    "dailyUserCapMicroUsd" BIGINT NOT NULL,
    "minWithdrawalXaf" INTEGER NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPrice" (
    "id" UUID NOT NULL,
    "providerModel" TEXT NOT NULL,
    "resolution" TEXT,
    "format" TEXT,
    "billingUnit" "BillingUnit" NOT NULL DEFAULT 'SECOND',
    "microUsdPerUnit" BIGINT NOT NULL,
    "billableMultiplier" INTEGER NOT NULL DEFAULT 1,
    "minSeconds" INTEGER,
    "maxSeconds" INTEGER,
    "source" "ModelPriceSource" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingConfig_effectiveFrom_idx" ON "PricingConfig"("effectiveFrom");

-- CreateIndex
CREATE INDEX "ModelPrice_providerModel_resolution_effectiveFrom_idx" ON "ModelPrice"("providerModel", "resolution", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ModelPrice_effectiveFrom_idx" ON "ModelPrice"("effectiveFrom");

-- ───────────── Tarifs et paramètres en ajout seul ─────────────
-- Un tarif ou un paramètre ne se corrige jamais sur place : on ajoute une ligne avec sa date d'entrée en
-- vigueur. C'est ce qui garantit qu'une ancienne génération garde le coût qui lui a été appliqué.
CREATE OR REPLACE FUNCTION forbid_pricing_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% est en ajout seul : % interdit (ajoutez une nouvelle ligne datée)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pricing_config_no_update_delete
  BEFORE UPDATE OR DELETE ON "PricingConfig"
  FOR EACH ROW EXECUTE FUNCTION forbid_pricing_mutation();
CREATE TRIGGER pricing_config_no_truncate
  BEFORE TRUNCATE ON "PricingConfig"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_pricing_mutation();

CREATE TRIGGER model_price_no_update_delete
  BEFORE UPDATE OR DELETE ON "ModelPrice"
  FOR EACH ROW EXECUTE FUNCTION forbid_pricing_mutation();
CREATE TRIGGER model_price_no_truncate
  BEFORE TRUNCATE ON "ModelPrice"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_pricing_mutation();

-- Bornes de bon sens : une valeur absurde ici se propagerait à tous les prix.
ALTER TABLE "PricingConfig" ADD CONSTRAINT pricing_config_values CHECK (
  "marginPercent" >= 0 AND "marginPercent" < 1000
  AND "fxBufferPercent" >= 0 AND "fxBufferPercent" < 100
  AND "cardFcfaPerUsd" > 0
  AND "circuitLossPercent" >= 0 AND "circuitLossPercent" < 100
  AND "safetyMarginMicroUsd" >= 0
  AND "dailyCapMicroUsd" > 0
  AND "dailyUserCapMicroUsd" > 0
  AND "dailyUserCapMicroUsd" <= "dailyCapMicroUsd"
  AND "minWithdrawalXaf" > 0
);

ALTER TABLE "ModelPrice" ADD CONSTRAINT model_price_values CHECK (
  "microUsdPerUnit" > 0
  AND "billableMultiplier" > 0
  AND ("minSeconds" IS NULL OR "maxSeconds" IS NULL OR "minSeconds" <= "maxSeconds")
);

-- ───────────── Première version des paramètres ─────────────
-- Reprise des réglages actuels (table Setting) SANS les modifier : la nouvelle table prend le relais, les
-- anciennes clés restent lisibles. Marquée « provisoire » : aucune valeur ne repose encore sur une mesure.
INSERT INTO "PricingConfig" (
  "id", "marginPercent", "fxBufferPercent", "cardFcfaPerUsd", "circuitLossPercent",
  "safetyMarginMicroUsd", "dailyCapMicroUsd", "dailyUserCapMicroUsd", "minWithdrawalXaf",
  "provisional", "effectiveFrom", "note"
)
SELECT
  gen_random_uuid(),
  10,  -- marge commerciale initiale, à réévaluer avec les vrais chiffres
  COALESCE((SELECT ("value"#>>'{}')::numeric FROM "Setting" WHERE "key" = 'fxBufferPercent'), 2),
  COALESCE((SELECT ("value"#>>'{}')::numeric FROM "Setting" WHERE "key" = 'usdToXafRate'), 620),
  COALESCE((SELECT ("value"#>>'{}')::numeric FROM "Setting" WHERE "key" = 'circuitLossPercent'), 9),
  2000000,   -- 2 $ gardés en réserve en permanence
  20000000,  -- 20 $ de dépense fournisseur par jour, tous utilisateurs confondus
  5000000,   -- 5 $ par utilisateur et par jour
  COALESCE((SELECT ("value"#>>'{}')::int FROM "Setting" WHERE "key" = 'minWithdrawalXaf'), 2500),
  true,
  NOW(),
  'Première version : reprise des réglages existants. Valeurs non mesurées.'
WHERE NOT EXISTS (SELECT 1 FROM "PricingConfig");

-- ───────────── Reprise des tarifs modèles actuels ─────────────
-- Un tarif par produit actif, converti en micro-dollars (arrondi AU-DESSUS : jamais sous le coût réel).
INSERT INTO "ModelPrice" (
  "id", "providerModel", "resolution", "format", "billingUnit", "microUsdPerUnit",
  "billableMultiplier", "minSeconds", "maxSeconds", "source", "effectiveFrom", "note"
)
SELECT
  gen_random_uuid(),
  p."providerModel",
  p."resolution",
  NULL,
  p."billingUnit",
  CEIL(p."providerCostUsdPerUnit" * 1000000)::bigint,
  p."billableMultiplier",
  p."minSeconds",
  p."maxSeconds",
  'MANUAL',
  NOW(),
  'Reprise du tarif enregistré sur le produit ' || p."code"
FROM "GenerationProduct" p
WHERE p."active" = true
  AND NOT EXISTS (
    SELECT 1 FROM "ModelPrice" m
    WHERE m."providerModel" = p."providerModel"
      AND COALESCE(m."resolution", '') = COALESCE(p."resolution", '')
  );
