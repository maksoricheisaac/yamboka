-- Retour arriere MANUEL de 20261105100000_wan3_image_to_video (Prisma n'execute pas ce fichier).
-- Les produits Wan sont desactives (pas supprimes : des creations peuvent leur etre rattachees) ; Genjutsu est reactive ;
-- les anciennes idees sont republiees ; les packs reprennent leurs credits d'avant. Les colonnes ajoutees a Preset restent.
UPDATE "GenerationProduct" SET "active" = false, "updatedAt" = now() WHERE "code" LIKE 'WAN_I2V_%';
UPDATE "GenerationProduct" SET "active" = true, "updatedAt" = now() WHERE "code" = 'VIDEO_LIGHT_480';
UPDATE "Preset" SET "visible" = true, "updatedAt" = now()
WHERE "productId" IN (SELECT "id" FROM "GenerationProduct" WHERE "code" = 'VIDEO_LIGHT_480');
UPDATE "CreditPack" SET "credits" = 1250, "updatedAt" = now() WHERE "country" = 'CG' AND "name" = 'Starter';
UPDATE "CreditPack" SET "credits" = 2600, "updatedAt" = now() WHERE "country" = 'CG' AND "name" = 'Pro';
UPDATE "CreditPack" SET "credits" = 6800, "updatedAt" = now() WHERE "country" = 'CG' AND "name" = 'Business';
UPDATE "Setting" SET "value" = '575'::jsonb, "updatedAt" = now() WHERE "key" = 'usdToXafRate';
UPDATE "CurrencySetting" SET "creditValue" = 4 WHERE "currency" = 'XAF';
UPDATE "Setting" SET "value" = '6'::jsonb WHERE "key" = 'fxFeePercent';
UPDATE "Setting" SET "value" = '15'::jsonb WHERE "key" = 'regenOverheadPercent';
DELETE FROM "Setting" WHERE "key" IN ('creditValueFcfa', 'generationConfirmCredits', 'generationConfirmBalancePercent');
