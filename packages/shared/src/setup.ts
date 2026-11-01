import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth';

/** Mot de passe d'un administrateur : plus exigeant que celui d'un client (12 caractères, 3 types de caractères). */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const adminPasswordSchema = passwordSchema
  .min(ADMIN_PASSWORD_MIN_LENGTH, `Le mot de passe administrateur doit contenir au moins ${ADMIN_PASSWORD_MIN_LENGTH} caractères.`)
  .refine(
    (v) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(v)).length >= 3,
    'Utilisez au moins trois types de caractères : minuscules, majuscules, chiffres, symboles.',
  );

export const SETUP_SECRET_HEADER = 'x-setup-secret';

const name = (label: string) =>
  z.string({ error: `${label} requis.` }).trim().min(1, `${label} requis.`).max(80, `${label} trop long.`);

export const setupAdminSchema = z
  .object({
    firstName: name('Prénom'),
    lastName: name('Nom'),
    email: emailSchema,
    password: adminPasswordSchema,
    confirmPassword: z.string({ error: 'Confirmation requise.' }),
    acceptLegal: z.literal(true, { error: 'Vous devez accepter les conditions d’utilisation et la charte.' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas.',
  });
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;

export interface SetupStatus {
  /** Vrai : l'assistant est verrouillé définitivement. */
  initialized: boolean;
  /** Faux : SETUP_SECRET n'est pas défini côté serveur, l'assistant est inutilisable. */
  secretConfigured: boolean;
}

export interface SetupCheckItem {
  key: string;
  label: string;
  state: 'ok' | 'warning' | 'error';
  detail: string;
}

export interface SetupDiagnostic {
  items: SetupCheckItem[];
  /** Faux si un contrôle bloquant est en erreur. */
  canContinue: boolean;
}

export interface SetupSummary {
  adminEmail: string;
  baseData: { settings: number; packs: number; products: number; legalDocuments: number };
  email: { provider: 'console' | 'smtp'; ok: boolean; detail: string };
}
