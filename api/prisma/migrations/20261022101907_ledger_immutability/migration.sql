-- Registre de crédits en ajout seul (RG-02) : toute modification ou suppression est refusée,
-- y compris depuis un client SQL. Une correction passe par un nouveau mouvement.
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CreditLedger est en ajout seul : % interdit', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON "CreditLedger"
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

CREATE TRIGGER credit_ledger_no_truncate
  BEFORE TRUNCATE ON "CreditLedger"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_ledger_mutation();

-- Cohérence du signe selon le type de mouvement.
ALTER TABLE "CreditLedger" ADD CONSTRAINT credit_ledger_amount_sign CHECK (
  ("type" IN ('PURCHASE', 'BONUS', 'WELCOME', 'REFUND') AND "amount" > 0)
  OR ("type" IN ('RESERVE', 'EXPIRE') AND "amount" < 0)
  OR ("type" = 'CAPTURE' AND "amount" = 0)
  OR ("type" = 'ADJUSTMENT' AND "amount" <> 0)
);

-- Montants financiers valides.
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK ("amount" > 0 AND "credits" > 0);
ALTER TABLE "CreditPack" ADD CONSTRAINT credit_pack_values CHECK ("price" > 0 AND "credits" > 0 AND "bonusPercent" BETWEEN 0 AND 100);
ALTER TABLE "Generation" ADD CONSTRAINT generation_cost_positive CHECK ("creditsCost" > 0);
ALTER TABLE "GenerationProduct" ADD CONSTRAINT product_values CHECK (
  "creditsPerUnit" > 0 AND "billableMultiplier" > 0
  AND ("minSeconds" IS NULL OR "maxSeconds" IS NULL OR "minSeconds" <= "maxSeconds")
);
ALTER TABLE "CurrencySetting" ADD CONSTRAINT currency_value_positive CHECK ("creditValue" > 0);
