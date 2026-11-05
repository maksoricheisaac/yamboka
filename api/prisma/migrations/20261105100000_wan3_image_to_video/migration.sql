-- Yamboka passe sur Wan 3.0 Standard, image -> video (photo + texte), via Higgsfield : Genjutsu est abandonne.
-- Modification additive et reversible (voir down.sql) : rien n'est supprime.
--
-- Tarifs (valides le 5 nov. 2026) : 1 credit = 10 FCFA ; 4 / 8 / 16 credits par seconde en 480p / 720p / 1080p.
-- Cout Higgsfield : 0,05 / 0,10 / 0,20 $ par seconde generee (verifie par estimation et essai reel).

-- 1. Idees (presets) : le produit n'est plus choisi par l'idee mais par la resolution du client.
ALTER TABLE "Preset" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "Preset" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'business';
ALTER TABLE "Preset" ADD COLUMN "photoHint" TEXT;
ALTER TABLE "Preset" ADD COLUMN "defaults" JSONB;

-- 2. Produits Wan 3.0 : un par resolution (tarif modifiable dans l'administration, Offre > Produits).
INSERT INTO "GenerationProduct"
  ("id", "code", "name", "providerModel", "resolution", "billingUnit", "creditsPerUnit", "providerCostUsdPerUnit",
   "billableMultiplier", "minSeconds", "maxSeconds", "phase", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.code, v.name, 'alibaba/wan-3.0/image-to-video', v.res, 'SECOND'::"BillingUnit", v.credits,
       v.usd, 1, 2, 30, 'MVP'::"ProductPhase", true, now(), now()
FROM (VALUES
  ('WAN_I2V_480',  'Vidéo Wan 3.0 · Standard (480p)', '480p',  4,  0.05),
  ('WAN_I2V_720',  'Vidéo Wan 3.0 · HD (720p)',       '720p',  8,  0.10),
  ('WAN_I2V_1080', 'Vidéo Wan 3.0 · Full HD (1080p)', '1080p', 16, 0.20)
) AS v(code, name, res, credits, usd)
WHERE NOT EXISTS (SELECT 1 FROM "GenerationProduct" g WHERE g."code" = v.code);

-- 3. Produits Genjutsu : desactives, jamais supprimes (les creations passees y restent rattachees).
UPDATE "GenerationProduct" SET "active" = false, "updatedAt" = now()
WHERE "providerModel" LIKE '%genjutsu%' AND "active" = true;

-- Anciennes idees Genjutsu (elles exigeaient une video de reference) : masquees, pas supprimees.
UPDATE "Preset" SET "visible" = false, "featured" = false, "updatedAt" = now()
WHERE "productId" IN (SELECT "id" FROM "GenerationProduct" WHERE "providerModel" LIKE '%genjutsu%')
  AND ("visible" = true OR "featured" = true);

-- 4. Packs : 1 credit = 10 FCFA (Starter 500, Pro 1 000, Business 2 500 credits). Les bonus ne sont PAS modifies.
UPDATE "CreditPack" SET "credits" = 500,  "updatedAt" = now() WHERE "country" = 'CG' AND "name" = 'Starter';
UPDATE "CreditPack" SET "credits" = 1000, "updatedAt" = now() WHERE "country" = 'CG' AND "name" = 'Pro';
UPDATE "CreditPack" SET "credits" = 2500, "updatedAt" = now() WHERE "country" = 'CG' AND "name" = 'Business';

-- 5. Reglages : taux de calcul 620 FCFA / $, valeur du credit, garde-fou de confirmation (modifiables dans l'admin).
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('usdToXafRate', '620'::jsonb, now())
  ON CONFLICT ("key") DO UPDATE SET "value" = '620'::jsonb, "updatedAt" = now();
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('creditValueFcfa', '10'::jsonb, now())
  ON CONFLICT ("key") DO UPDATE SET "value" = '10'::jsonb, "updatedAt" = now();
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('generationConfirmCredits', '100'::jsonb, now())
  ON CONFLICT ("key") DO NOTHING;
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('generationConfirmBalancePercent', '50'::jsonb, now())
  ON CONFLICT ("key") DO NOTHING;
-- Marge (administration) : les frais SasPay et de retrait (~5 %) sont deja comptes dans « openpayCommissionPercent » ;
-- le change et le surcout de regeneration (6 % et 15 % auparavant) ne s'ajoutent plus (la grille inclut deja ~18 % de marge de securite).
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('fxFeePercent', '0'::jsonb, now())
  ON CONFLICT ("key") DO UPDATE SET "value" = '0'::jsonb, "updatedAt" = now();
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('regenOverheadPercent', '0'::jsonb, now())
  ON CONFLICT ("key") DO UPDATE SET "value" = '0'::jsonb, "updatedAt" = now();
UPDATE "CurrencySetting" SET "creditValue" = 10 WHERE "currency" = 'XAF';
