-- Notification d'une attribution de crédits par un administrateur (geste commercial, correction).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CREDITS_GRANTED';
