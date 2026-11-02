-- Lot B : lots de crédits (FIFO), libération, bonus de premier achat. Pas de crédits de bienvenue.

-- 1. Types du journal : noms de la spécification. WELCOME est conservé (lignes anciennes du registre immuable).
ALTER TYPE "CreditTxType" RENAME VALUE 'BONUS' TO 'FIRST_PURCHASE_BONUS';
ALTER TYPE "CreditTxType" RENAME VALUE 'REFUND' TO 'RELEASE';
ALTER TYPE "CreditTxType" RENAME VALUE 'ADJUSTMENT' TO 'ADMIN_ADJUST';

ALTER TABLE "CreditLedger" DROP CONSTRAINT credit_ledger_amount_sign;
ALTER TABLE "CreditLedger" ADD CONSTRAINT credit_ledger_amount_sign CHECK (
  ("type" IN ('PURCHASE', 'FIRST_PURCHASE_BONUS', 'WELCOME', 'RELEASE') AND "amount" > 0)
  OR ("type" IN ('RESERVE', 'EXPIRE') AND "amount" < 0)
  OR ("type" = 'CAPTURE' AND "amount" = 0)
  OR ("type" = 'ADMIN_ADJUST' AND "amount" <> 0)
);

-- 2. Le bonus de premier achat est accordé au plus une fois par compte, quoi qu'il arrive (filet de la base).
--    Les anciens bonus de pack (référence « bonus: ») ne sont pas concernés.
CREATE UNIQUE INDEX "CreditLedger_one_first_purchase_bonus"
  ON "CreditLedger" ("userId")
  WHERE "type" = 'FIRST_PURCHASE_BONUS' AND "reference" LIKE 'firstbonus:%';

-- 3. Plus de bonus permanent par pack : seul le bonus de premier achat existe.
UPDATE "CreditPack" SET "bonusPercent" = 0;

-- 4. Lots pour les crédits existants. Même logique que l'ancienne expiration : la consommation nette est répartie
--    sur les lots dans l'ordre d'échéance ; la part restante d'un lot déjà expiré est nulle.
--    Une échéance absente (ancien ajustement sans date) devient « jamais » (9999-12-31) pour ne rien changer.
INSERT INTO "CreditLot" ("id", "userId", "kind", "initialAmount", "remaining", "expiresAt", "ledgerId", "paymentId", "createdAt")
WITH src AS (
  SELECT l."id", l."userId", l."amount", l."paymentId", l."createdAt", l."type",
         COALESCE(l."expiresAt", TIMESTAMP '9999-12-31') AS exp,
         (SELECT -e."amount" FROM "CreditLedger" e WHERE e."reference" = 'expire:' || l."id"::text) AS expired
  FROM "CreditLedger" l
  WHERE l."amount" > 0 AND l."type" IN ('PURCHASE', 'FIRST_PURCHASE_BONUS', 'WELCOME', 'ADMIN_ADJUST')
), cons AS (
  SELECT "userId", GREATEST(0, -SUM("amount")) AS c
  FROM "CreditLedger"
  WHERE "type" IN ('RESERVE', 'RELEASE') OR ("type" = 'ADMIN_ADJUST' AND "amount" < 0)
  GROUP BY "userId"
), capped AS (
  SELECT s.*, COALESCE(c.c, 0) AS c,
         s."amount" - COALESCE(s.expired, 0) AS cap
  FROM src s LEFT JOIN cons c ON c."userId" = s."userId"
), placed AS (
  SELECT capped.*,
         COALESCE(SUM(cap) OVER (PARTITION BY "userId" ORDER BY exp, "createdAt", "id"
                                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS cap_before
  FROM capped
)
SELECT gen_random_uuid(), "userId",
       CASE "type" WHEN 'PURCHASE' THEN 'PURCHASE'::"CreditLotKind"
                   WHEN 'FIRST_PURCHASE_BONUS' THEN 'FIRST_PURCHASE_BONUS'::"CreditLotKind"
                   ELSE 'ADMIN_ADJUST'::"CreditLotKind" END,
       "amount",
       CASE WHEN expired IS NOT NULL THEN 0
            ELSE "amount" - LEAST(cap, GREATEST(0, c - cap_before)) END,
       exp, "id", "paymentId", "createdAt"
FROM placed;
