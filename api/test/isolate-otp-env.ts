/** À importer AVANT les helpers : rétablit le délai de renvoi et le plafond horaire pour tester l'anti-abus des codes. */
process.env.EMAIL_OTP_RESEND_COOLDOWN_SECONDS = '60';
process.env.EMAIL_OTP_MAX_SENDS_PER_HOUR = '5';
