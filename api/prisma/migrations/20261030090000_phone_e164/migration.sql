-- Numéros de téléphone : format E.164 (« +242066063133 ») pour toute l'application.
-- Les numéros congolais enregistrés avant l'ouverture à l'international sont au format « 242XXXXXXXXX » (sans « + ») :
-- on leur ajoute le « + ». Modification additive et réversible (retirer le premier caractère) ; les lignes qui ne
-- correspondent pas exactement à l'ancien format ne sont pas touchées. L'application accepte les deux formats en entrée.
UPDATE "User" SET "phone" = '+' || "phone" WHERE "phone" ~ '^242[0-9]{9}$';
UPDATE "Payment" SET "payerPhone" = '+' || "payerPhone" WHERE "payerPhone" ~ '^242[0-9]{9}$';
