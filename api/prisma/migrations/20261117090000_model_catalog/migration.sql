-- Catalogue de modèles piloté par la base : plus aucun slug, paramètre ni tarif de modèle en dur.
-- Migration ADDITIVE : elle reprend le modèle actuellement actif à l'identique (même slug, mêmes
-- paramètres, mêmes tarifs), de sorte qu'une génération faite après donne exactement le même appel
-- fournisseur qu'avant.

-- CreateEnum
CREATE TYPE "GenerationMode" AS ENUM ('TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO');
CREATE TYPE "ModelParamType" AS ENUM ('STRING', 'INTEGER', 'BOOLEAN', 'ENUM');
CREATE TYPE "ModelParamRole" AS ENUM ('PROMPT', 'DURATION', 'RESOLUTION', 'ASPECT_RATIO', 'IMAGE_URL', 'OPTION');
CREATE TYPE "ModelParamExposure" AS ENUM ('CLIENT', 'FIXED', 'HIDDEN_DEFAULT');
CREATE TYPE "ModelOptionPriceKind" AS ENUM ('SURCHARGE', 'MULTIPLIER');

-- CreateTable
CREATE TABLE "GenerationModel" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" "GenerationMode" NOT NULL DEFAULT 'TEXT_TO_VIDEO',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModelParam" (
    "id" UUID NOT NULL,
    "modelId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "type" "ModelParamType" NOT NULL,
    "role" "ModelParamRole" NOT NULL,
    "exposure" "ModelParamExposure" NOT NULL DEFAULT 'CLIENT',
    "allowedValues" JSONB,
    "defaultValue" JSONB,
    "affectsPrice" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelParam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModelOptionPrice" (
    "id" UUID NOT NULL,
    "providerModel" TEXT NOT NULL,
    "paramKey" TEXT NOT NULL,
    "triggerValue" JSONB NOT NULL,
    "kind" "ModelOptionPriceKind" NOT NULL,
    "microUsdPerUnit" BIGINT,
    "multiplierBp" INTEGER,
    "source" "ModelPriceSource" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelOptionPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GenerationModel_slug_key" ON "GenerationModel"("slug");
CREATE INDEX "GenerationModel_active_sortOrder_idx" ON "GenerationModel"("active", "sortOrder");
CREATE UNIQUE INDEX "ModelParam_modelId_key_key" ON "ModelParam"("modelId", "key");
CREATE INDEX "ModelParam_modelId_sortOrder_idx" ON "ModelParam"("modelId", "sortOrder");
CREATE INDEX "ModelOptionPrice_providerModel_paramKey_effectiveFrom_idx" ON "ModelOptionPrice"("providerModel", "paramKey", "effectiveFrom");
CREATE INDEX "ModelOptionPrice_effectiveFrom_idx" ON "ModelOptionPrice"("effectiveFrom");

-- AddForeignKey
ALTER TABLE "ModelParam" ADD CONSTRAINT "ModelParam_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "GenerationModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un seul modèle par défaut à la fois.
CREATE UNIQUE INDEX "GenerationModel_single_default" ON "GenerationModel"("isDefault") WHERE "isDefault";

-- Bornes de bon sens sur les règles d'option.
ALTER TABLE "ModelOptionPrice" ADD CONSTRAINT model_option_price_values CHECK (
  ("kind" = 'SURCHARGE' AND "microUsdPerUnit" IS NOT NULL AND "microUsdPerUnit" >= 0 AND "multiplierBp" IS NULL)
  OR ("kind" = 'MULTIPLIER' AND "multiplierBp" IS NOT NULL AND "multiplierBp" > 0 AND "microUsdPerUnit" IS NULL)
);

-- Ajout seul, comme ModelPrice : une règle d'option se corrige en ajoutant une ligne datée.
CREATE TRIGGER model_option_price_no_update_delete
  BEFORE UPDATE OR DELETE ON "ModelOptionPrice"
  FOR EACH ROW EXECUTE FUNCTION forbid_pricing_mutation();
CREATE TRIGGER model_option_price_no_truncate
  BEFORE TRUNCATE ON "ModelOptionPrice"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_pricing_mutation();

-- ───────────── Génération : modèle du catalogue et input figé ─────────────
ALTER TABLE "Generation" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "Generation" ADD COLUMN "modelId" UUID;
ALTER TABLE "Generation" ADD COLUMN "modelSlug" TEXT;
ALTER TABLE "Generation" ADD COLUMN "providerInput" JSONB;
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "GenerationModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Reprise du modèle actuel, à l'identique ─────────────
-- Le modèle actif est celui désigné par les produits actifs. Son slug et ses résolutions sont repris tels
-- quels ; les tarifs sont déjà dans ModelPrice (migration versioned_pricing_config).
INSERT INTO "GenerationModel" ("id", "slug", "name", "description", "mode", "active", "isDefault", "sortOrder", "updatedAt")
SELECT
  gen_random_uuid(),
  p."providerModel",
  'Wan 3.0 · image → vidéo',
  'Modèle repris du catalogue précédent, sans aucun changement de comportement.',
  'IMAGE_TO_VIDEO',
  true,
  true,
  0,
  NOW()
FROM (
  SELECT "providerModel" FROM "GenerationProduct"
  WHERE "active" = true AND "billingUnit" = 'SECOND'
  GROUP BY "providerModel"
  ORDER BY "providerModel"
  LIMIT 1
) p
WHERE NOT EXISTS (SELECT 1 FROM "GenerationModel");

-- Paramètres EXACTS envoyés aujourd'hui par api/src/generation/models.ts, un à un.
INSERT INTO "ModelParam" ("id", "modelId", "key", "label", "type", "role", "exposure", "allowedValues", "defaultValue", "affectsPrice", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), m."id", v.key, v.label, v.ptype::"ModelParamType", v.prole::"ModelParamRole",
       v.pexposure::"ModelParamExposure", v.allowed::jsonb, v.def::jsonb, v.affects, v.ord, NOW()
FROM "GenerationModel" m
CROSS JOIN (VALUES
  ('prompt',         'Description', 'STRING',  'PROMPT',       'CLIENT',         NULL,                                '{"maxLength":600}'::text, false, 0),
  ('image_url',      'Photo',       'STRING',  'IMAGE_URL',    'HIDDEN_DEFAULT', NULL,                                NULL,                      false, 1),
  ('duration',       'Durée',       'INTEGER', 'DURATION',     'CLIENT',         '{"min":2,"max":30}',                '5',                       true,  2),
  ('resolution',     'Qualité',     'ENUM',    'RESOLUTION',   'CLIENT',         '["480p","720p","1080p"]',           '"480p"',                  true,  3),
  ('aspect_ratio',   'Format',      'ENUM',    'ASPECT_RATIO', 'CLIENT',         '["9:16","3:4","1:1","4:3","16:9"]', '"9:16"',                  false, 4),
  ('generate_audio', 'Son',         'BOOLEAN', 'OPTION',       'FIXED',          NULL,                                'true',                    false, 5)
) AS v(key, label, ptype, prole, pexposure, allowed, def, affects, ord)
WHERE m."isDefault" = true
  AND NOT EXISTS (SELECT 1 FROM "ModelParam" mp WHERE mp."modelId" = m."id");
