-- CreditLedger ne doit avoir aucune clé étrangère entrante : TRUNCATE échouerait avant le trigger d'immuabilité.
ALTER TABLE "CreditLot" DROP CONSTRAINT "CreditLot_ledgerId_fkey";
