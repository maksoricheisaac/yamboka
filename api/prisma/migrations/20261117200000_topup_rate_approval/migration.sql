-- Un taux sortant MESURE ne s'applique pas tout seul a la grille : il faut une confirmation explicite.
-- Sans cela, saisir une recharge changerait tous les prix de la plateforme sans que personne ait regarde
-- l'avant / apres. Le taux reste donc en attente, et la grille continue d'utiliser le taux provisoire
-- (pessimiste) jusqu'a la confirmation.
ALTER TABLE "ProviderTopUp" ADD COLUMN "appliedToPricingAt" TIMESTAMP(3);

-- Les recharges deja enregistrees gardent leur effet actuel : on ne change pas un prix en migrant.
UPDATE "ProviderTopUp" SET "appliedToPricingAt" = "occurredAt" WHERE "measured" = true;

CREATE INDEX "ProviderTopUp_provider_appliedToPricingAt_idx"
  ON "ProviderTopUp"("provider", "appliedToPricingAt");
