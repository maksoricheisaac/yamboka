-- Notifications : événement de remboursement, clé d'idempotence, suivi de l'envoi d'e-mail.
-- Préférences d'e-mail par utilisateur. Mise en avant éditoriale des presets (tendances).
-- Modifications additives : colonnes facultatives ou avec valeur par défaut, aucune donnée existante touchée.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CREDITS_REFUNDED';

ALTER TABLE "User" ADD COLUMN "emailPrefs" JSONB;

ALTER TABLE "Notification" ADD COLUMN "dedupKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "emailPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN "emailSentAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN "emailAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notification" ADD COLUMN "emailError" TEXT;
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

ALTER TABLE "Preset" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;
