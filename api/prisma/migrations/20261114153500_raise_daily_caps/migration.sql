-- Nouvelle version des paramètres (la table est en ajout seul) : les plafonds de la première version
-- rendaient impossible une vidéo 1080p de 30 s, dont le coût fournisseur atteint 6 $ (0,20 $/s × 30).
-- Un plafond doit laisser passer la création la plus chère du catalogue, sinon le produit est invendable.
--   • par utilisateur et par jour : 5 $ → 12 $ (deux créations maximales, pas plus)
--   • tous utilisateurs confondus : 20 $ → 40 $
INSERT INTO "PricingConfig" (
  "id", "marginPercent", "fxBufferPercent", "cardFcfaPerUsd", "circuitLossPercent",
  "safetyMarginMicroUsd", "dailyCapMicroUsd", "dailyUserCapMicroUsd", "minWithdrawalXaf",
  "provisional", "effectiveFrom", "note"
)
SELECT
  gen_random_uuid(),
  c."marginPercent", c."fxBufferPercent", c."cardFcfaPerUsd", c."circuitLossPercent",
  c."safetyMarginMicroUsd",
  40000000,
  12000000,
  c."minWithdrawalXaf",
  c."provisional",
  NOW(),
  'Plafonds quotidiens relevés : la création la plus chère du catalogue (1080p, 30 s = 6 $) doit passer.'
FROM "PricingConfig" c
ORDER BY c."effectiveFrom" DESC, c."createdAt" DESC
LIMIT 1;
