import { z } from 'zod';
import { phoneSchema } from './phone';

/** Règles d'authentification partagées (cahier des charges §3.1, RG). La validation définitive reste côté API. */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string({ error: 'Adresse e-mail requise.' })
  .trim()
  .toLowerCase()
  .max(254, 'Adresse e-mail trop longue.')
  .pipe(z.email('Adresse e-mail invalide.'));

export const passwordSchema = z
  .string({ error: 'Mot de passe requis.' })
  .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`)
  .max(PASSWORD_MAX_LENGTH, 'Mot de passe trop long.');

const nameSchema = (label: string) =>
  z
    .string({ error: `${label} requis.` })
    .trim()
    .min(1, `${label} requis.`)
    .max(80, `${label} trop long.`);

const optionalPhone = z
  .union([phoneSchema, z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

export const signupSchema = z
  .object({
    firstName: nameSchema('Prénom'),
    lastName: nameSchema('Nom'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string({ error: 'Confirmation requise.' }),
    phone: optionalPhone,
    acceptLegal: z.literal(true, { error: 'Vous devez accepter les conditions d’utilisation et la charte.' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas.',
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Mot de passe requis.' }).min(1, 'Mot de passe requis.').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const tokenSchema = z.string().trim().min(20).max(200);

/** Code à usage unique reçu par e-mail : chiffres uniquement (la longueur exacte est configurée côté API). */
export const otpCodeSchema = z
  .string({ error: 'Code requis.' })
  .trim()
  .regex(/^\d{4,10}$/, 'Le code ne contient que des chiffres.');

export const verifyEmailSchema = z.object({ code: otpCodeSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/** Correction de l'adresse e-mail d'un compte dont l'adresse n'est pas encore vérifiée. */
export const changeEmailSchema = z.object({ email: emailSchema });
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const loginOtpSchema = z.object({ email: emailSchema, code: otpCodeSchema });
export type LoginOtpInput = z.infer<typeof loginOtpSchema>;

export const resetPasswordSchema = z
  .object({
    token: tokenSchema,
    password: passwordSchema,
    confirmPassword: z.string({ error: 'Confirmation requise.' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas.',
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Profil modifiable. Le rôle, le statut et l'e-mail n'en font volontairement pas partie. */
export const updateProfileSchema = z
  .object({
    firstName: nameSchema('Prénom').optional(),
    lastName: nameSchema('Nom').optional(),
    phone: optionalPhone,
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis.').max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
    confirmPassword: z.string({ error: 'Confirmation requise.' }),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Les mots de passe ne correspondent pas.',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const acceptLegalSchema = z.object({ accept: z.literal(true) }).strict();

/** Suppression de compte (UF-62) : le mot de passe est redemandé pour les comptes qui en ont un. */
export const deleteAccountSchema = z.object({ password: z.string().max(PASSWORD_MAX_LENGTH).optional() }).strict();
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
