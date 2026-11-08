-- Achat de crédits sur mesure et paiements multi-pays.
-- 1. Un paiement peut ne référencer aucun pack (quantité libre) : montant et crédits sont déjà portés par Payment.
-- 2. Les réseaux autres que MTN et Airtel (Orange, Moov, Wave…) sont rangés sous OTHER ; le code exact du réseau est dans Payment.network.
ALTER TYPE "MobileOperator" ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TABLE "Payment" ALTER COLUMN "packId" DROP NOT NULL;

-- Le prix du crédit sert désormais aussi à facturer l'achat à la quantité : il doit rester cohérent avec les packs.
-- Là où la grille de lancement a été appliquée (Starter 5 000 FCFA = 1 250 crédits, soit 4 FCFA le crédit), on aligne
-- le réglage sur le pack d'entrée, uniquement s'il porte encore l'ancienne valeur par défaut (10).
UPDATE "Setting" AS s
SET "value" = to_jsonb(p.rate)
FROM (
  SELECT ROUND("price"::numeric / "credits", 2) AS rate
  FROM "CreditPack"
  WHERE "country" = 'CG' AND "active" = true AND "credits" > 0
  ORDER BY "sortOrder" ASC
  LIMIT 1
) AS p
WHERE s."key" = 'creditValueFcfa' AND s."value" = '10'::jsonb AND p.rate <> 10;
