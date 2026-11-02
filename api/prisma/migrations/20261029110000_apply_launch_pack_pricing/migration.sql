-- Tarification de lancement : packs Starter / Pro / Business (prix tout compris), vidéo de 10 s = 100 crédits.
-- Les anciens packs (Mini, Découverte, Créateur, Agence) sont retirés de la vente mais conservés : les paiements
-- passés les référencent. Pro et Business gardent leur ligne (même nom) avec le nouveau prix et les nouveaux crédits ;
-- les paiements existants portent leur propre montant et leurs crédits, ils ne changent pas.

UPDATE "CreditPack"
SET "active" = false, "publicVisible" = false, "featured" = false, "sortOrder" = 10 + "sortOrder"
WHERE "country" = 'CG' AND "name" IN ('Mini', 'Découverte', 'Créateur', 'Agence');

INSERT INTO "CreditPack" ("id", "name", "country", "currency", "price", "credits", "bonusPercent", "sortOrder", "featured", "active", "publicVisible", "updatedAt")
SELECT gen_random_uuid(), 'Starter', 'CG', 'XAF', 5000, 1250, 0, 0, false, true, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CreditPack" WHERE "country" = 'CG' AND "name" = 'Starter');

INSERT INTO "CreditPack" ("id", "name", "country", "currency", "price", "credits", "bonusPercent", "sortOrder", "featured", "active", "publicVisible", "updatedAt")
SELECT gen_random_uuid(), 'Pro', 'CG', 'XAF', 10000, 2600, 0, 1, true, true, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CreditPack" WHERE "country" = 'CG' AND "name" = 'Pro');

INSERT INTO "CreditPack" ("id", "name", "country", "currency", "price", "credits", "bonusPercent", "sortOrder", "featured", "active", "publicVisible", "updatedAt")
SELECT gen_random_uuid(), 'Business', 'CG', 'XAF', 25000, 6800, 0, 2, false, true, true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CreditPack" WHERE "country" = 'CG' AND "name" = 'Business');

-- Pro et Business existaient avec d'anciennes valeurs : on les aligne sur la nouvelle grille.
UPDATE "CreditPack"
SET "price" = 10000, "credits" = 2600, "bonusPercent" = 0, "sortOrder" = 1, "featured" = true, "active" = true, "publicVisible" = true
WHERE "country" = 'CG' AND "name" = 'Pro';

UPDATE "CreditPack"
SET "price" = 25000, "credits" = 6800, "bonusPercent" = 0, "sortOrder" = 2, "featured" = false, "active" = true, "publicVisible" = true
WHERE "country" = 'CG' AND "name" = 'Business';

UPDATE "CreditPack"
SET "price" = 5000, "credits" = 1250, "bonusPercent" = 0, "sortOrder" = 0, "featured" = false, "active" = true, "publicVisible" = true
WHERE "country" = 'CG' AND "name" = 'Starter';

-- Modèle de référence des équivalences : 10 crédits/s (⌈0,04 $ × 575 ÷ 2,5⌉), prix provisoire en attendant le modèle retenu.
INSERT INTO "ModelPricing" ("id", "code", "name", "providerModel", "usdPerSecond", "minSeconds", "maxSeconds", "isDefault", "active", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), 'DEFAULT_VIDEO', 'Modèle vidéo par défaut (prix provisoire)', 'a-definir', 0.04, 5, 10, true, true, 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ModelPricing" WHERE "code" = 'DEFAULT_VIDEO')
  AND NOT EXISTS (SELECT 1 FROM "ModelPricing" WHERE "isDefault" = true);

-- Produit vidéo actif : même grille (10 crédits/s), s'il n'a pas été ajusté depuis le lancement.
UPDATE "GenerationProduct"
SET "creditsPerUnit" = 10, "providerCostUsdPerUnit" = 0.04, "billableMultiplier" = 1
WHERE "code" = 'VIDEO_LIGHT_480' AND "creditsPerUnit" = 4 AND "billableMultiplier" = 2;

-- Valeur indicative d'un crédit : prix du pack d'entrée ÷ ses crédits (5 000 ÷ 1 250 = 4 FCFA), si elle n'a pas été ajustée.
UPDATE "CurrencySetting" SET "creditValue" = 4 WHERE "currency" = 'XAF' AND "creditValue" = 25;
