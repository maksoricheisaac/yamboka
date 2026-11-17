-- Retour en arriere de model_estimate_check : table d'observation seule, rien d'autre a restaurer.
DROP TRIGGER IF EXISTS model_estimate_check_no_truncate ON "ModelEstimateCheck";
DROP TRIGGER IF EXISTS model_estimate_check_no_update_delete ON "ModelEstimateCheck";
DROP TABLE IF EXISTS "ModelEstimateCheck";
