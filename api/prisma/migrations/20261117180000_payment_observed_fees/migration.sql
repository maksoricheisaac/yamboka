-- Net reellement recu et frais observes, par paiement. Sans cela, `fees.ts` ne peut pas etre recalibre
-- sur du reel : la grille publique de l'encaisseur n'est qu'un plancher (« des X % »), et seule la
-- comparaison paiement par paiement dit ce qu'on paie vraiment.
ALTER TABLE "Payment" ADD COLUMN "netReceived" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "observedFeePercent" DECIMAL(7,4);
ALTER TABLE "Payment" ADD COLUMN "expectedFeePercent" DECIMAL(7,4);

CREATE INDEX "Payment_country_methodCode_creditedAt_idx"
  ON "Payment"("country", "methodCode", "creditedAt");
