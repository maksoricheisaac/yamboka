import { z } from 'zod';

/** Notifications dans l'application et préférences d'e-mail de l'utilisateur. */

export type NotificationKind =
  | 'GENERATION_READY'
  | 'GENERATION_FAILED'
  | 'CREDITS_REFUNDED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'DELETION_REMINDER'
  | 'MODERATION'
  | 'SYSTEM';

export interface NotificationView {
  id: string;
  type: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  unread: number;
  items: NotificationView[];
  nextCursor: string | null;
}

/** Événements pour lesquels l'utilisateur choisit de recevoir (ou non) un e-mail. */
export const EMAIL_PREF_KEYS = ['generationReady', 'generationFailed', 'paymentConfirmed', 'creditsRefunded'] as const;
export type EmailPrefKey = (typeof EMAIL_PREF_KEYS)[number];
export type EmailPrefs = Record<EmailPrefKey, boolean>;

/** Valeurs d'un utilisateur qui n'a encore rien choisi : tous les événements envoient un e-mail. */
export const DEFAULT_EMAIL_PREFS: EmailPrefs = {
  generationReady: true,
  generationFailed: true,
  paymentConfirmed: true,
  creditsRefunded: true,
};

export const updatePreferencesSchema = z.object({
  emailPrefs: z
    .object({
      generationReady: z.boolean(),
      generationFailed: z.boolean(),
      paymentConfirmed: z.boolean(),
      creditsRefunded: z.boolean(),
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, { message: 'Aucune préférence à enregistrer.' }),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export interface PreferencesView {
  emailPrefs: EmailPrefs;
  /** Adresse qui reçoit les e-mails, et si elle est vérifiée (sinon aucun e-mail n'est envoyé). */
  email: string;
  emailVerified: boolean;
}
