-- Tous les parametres de calcul passent par la configuration versionnee : plus aucun n'est en dur ni
-- disperse dans la table Setting. Colonnes ajoutees avec une valeur par defaut, donc les versions deja
-- enregistrees restent valides telles quelles.

-- Frais de chaque etape du circuit de recharge, en % : SasPay -> MoMo -> carte -> recharge fournisseur.
-- Valeurs PROVISOIRES tant que `provisional` est vrai : seul r_out mesure fait foi une fois disponible.
ALTER TABLE "PricingConfig" ADD COLUMN "withdrawalFeePercent" DECIMAL(7,4) NOT NULL DEFAULT 1;
ALTER TABLE "PricingConfig" ADD COLUMN "momoToCardFeePercent" DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE "PricingConfig" ADD COLUMN "topUpFeePercent" DECIMAL(7,4) NOT NULL DEFAULT 0;
-- Marge nette minimale acceptee : en dessous, l'application d'une configuration exige une confirmation.
ALTER TABLE "PricingConfig" ADD COLUMN "minMarginPercent" DECIMAL(7,4) NOT NULL DEFAULT 5;
-- Achat minimum sur mesure, en FCFA : en dessous, la marge nette ne serait plus positive.
ALTER TABLE "PricingConfig" ADD COLUMN "minPurchaseXaf" INTEGER NOT NULL DEFAULT 500;
-- Duree de validite d'un devis deja affiche, en secondes.
ALTER TABLE "PricingConfig" ADD COLUMN "quoteValiditySeconds" INTEGER NOT NULL DEFAULT 600;
-- Version a laquelle celle-ci revient (retour en arriere), ou NULL.
ALTER TABLE "PricingConfig" ADD COLUMN "revertedFromId" UUID;

ALTER TABLE "PricingConfig" ADD CONSTRAINT pricing_config_fees_values CHECK (
  "withdrawalFeePercent" >= 0 AND "withdrawalFeePercent" < 100
  AND "momoToCardFeePercent" >= 0 AND "momoToCardFeePercent" < 100
  AND "topUpFeePercent" >= 0 AND "topUpFeePercent" < 100
  AND "minMarginPercent" >= 0 AND "minMarginPercent" < 1000
  AND "minPurchaseXaf" > 0
  AND "quoteValiditySeconds" > 0 AND "quoteValiditySeconds" <= 86400
);

-- Reprise des valeurs deja reglees ailleurs (table Setting) : par une NOUVELLE VERSION, jamais par un
-- UPDATE. La table est en ajout seul, et un trigger le fait respecter : une correction se fait en ajoutant
-- une ligne datee. La nouvelle version recopie la precedente a l'identique, aux deux valeurs reprises pres,
-- donc le comportement ne change pas.
INSERT INTO "PricingConfig" (
  "id", "marginPercent", "fxBufferPercent", "cardFcfaPerUsd", "circuitLossPercent",
  "bonusValuationPercent", "withdrawalFeePercent", "momoToCardFeePercent", "topUpFeePercent",
  "minMarginPercent", "safetyMarginMicroUsd", "dailyCapMicroUsd", "dailyUserCapMicroUsd",
  "minWithdrawalXaf", "minPurchaseXaf", "quoteValiditySeconds", "provisional", "effectiveFrom", "note"
)
SELECT
  gen_random_uuid(),
  c."marginPercent", c."fxBufferPercent", c."cardFcfaPerUsd", c."circuitLossPercent",
  c."bonusValuationPercent", c."withdrawalFeePercent", c."momoToCardFeePercent", c."topUpFeePercent",
  COALESCE((SELECT ("value"#>>'{}')::numeric FROM "Setting" WHERE "key" = 'minMarginPercent'), c."minMarginPercent"),
  c."safetyMarginMicroUsd", c."dailyCapMicroUsd", c."dailyUserCapMicroUsd",
  c."minWithdrawalXaf",
  COALESCE((SELECT ("value"#>>'{}')::int FROM "Setting" WHERE "key" = 'minPurchaseXaf'), c."minPurchaseXaf"),
  c."quoteValiditySeconds",
  c."provisional",
  NOW(),
  'Reprise de la marge minimale et de l''achat minimum dans la configuration versionnee.'
FROM "PricingConfig" c
WHERE c."id" = (
  SELECT "id" FROM "PricingConfig" ORDER BY "effectiveFrom" DESC, "createdAt" DESC LIMIT 1
);
