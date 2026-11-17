-- Contrôle périodique du tarif configuré contre le prix annonce par le fournisseur (POST /estimate).
-- `/estimate` n'est JAMAIS sur le chemin client : il est appelé par le calibrage et par ce controle.
-- En ajout seul : chaque relevé est une observation datée, on ne réécrit jamais une observation passée.
CREATE TABLE "ModelEstimateCheck" (
    "id" UUID NOT NULL,
    "providerModel" TEXT NOT NULL,
    "resolution" TEXT,
    "options" JSONB NOT NULL,
    "configuredMicroUsdPerUnit" BIGINT NOT NULL,
    "observedMicroUsdPerUnit" BIGINT NOT NULL,
    "deviationPercent" INTEGER NOT NULL,
    "units" INTEGER NOT NULL,
    "raw" JSONB,
    "note" TEXT,
    "createdById" UUID,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelEstimateCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelEstimateCheck_providerModel_resolution_checkedAt_idx"
  ON "ModelEstimateCheck"("providerModel", "resolution", "checkedAt");
CREATE INDEX "ModelEstimateCheck_checkedAt_idx" ON "ModelEstimateCheck"("checkedAt");

ALTER TABLE "ModelEstimateCheck" ADD CONSTRAINT model_estimate_check_values CHECK (
  "configuredMicroUsdPerUnit" >= 0 AND "observedMicroUsdPerUnit" >= 0 AND "units" > 0
);

CREATE TRIGGER model_estimate_check_no_update_delete
  BEFORE UPDATE OR DELETE ON "ModelEstimateCheck"
  FOR EACH ROW EXECUTE FUNCTION forbid_pricing_mutation();
CREATE TRIGGER model_estimate_check_no_truncate
  BEFORE TRUNCATE ON "ModelEstimateCheck"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_pricing_mutation();
