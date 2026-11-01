import { z } from 'zod';

/** Contrats de l'administration. Les opérations sensibles exigent un motif écrit (journal d'audit). */

export const reasonSchema = z
  .string({ error: 'Le motif est obligatoire.' })
  .trim()
  .min(5, 'Le motif doit contenir au moins 5 caractères.')
  .max(500, 'Motif trop long.');

export const userStatusActionSchema = z.object({
  action: z.enum(['SUSPEND', 'BAN', 'REACTIVATE']),
  reason: reasonSchema,
});
export type UserStatusActionInput = z.infer<typeof userStatusActionSchema>;

export const creditAdjustSchema = z.object({
  /** Signé : positif pour créditer, négatif pour débiter. */
  amount: z
    .number({ error: 'Montant requis.' })
    .int('Nombre entier requis.')
    .refine((n) => n !== 0, 'Le montant ne peut pas être nul.')
    .refine((n) => Math.abs(n) <= 100_000, 'Montant trop élevé.'),
  reason: reasonSchema,
});
export type CreditAdjustInput = z.infer<typeof creditAdjustSchema>;

export const packUpdateSchema = z
  .object({
    price: z.number().int().min(100).max(1_000_000).optional(),
    credits: z.number().int().min(1).max(100_000).optional(),
    bonusPercent: z.number().int().min(0).max(100).optional(),
    active: z.boolean().optional(),
    featured: z.boolean().optional(),
    publicVisible: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    reason: reasonSchema,
  })
  .strict();
export type PackUpdateInput = z.infer<typeof packUpdateSchema>;

export const packCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    price: z.number().int().min(100).max(1_000_000),
    credits: z.number().int().min(1).max(100_000),
    bonusPercent: z.number().int().min(0).max(100).default(0),
    reason: reasonSchema,
  })
  .strict();
export type PackCreateInput = z.infer<typeof packCreateSchema>;

export const productUpdateSchema = z
  .object({
    active: z.boolean().optional(),
    creditsPerUnit: z.number().int().min(1).max(10_000).optional(),
    reason: reasonSchema,
  })
  .strict();
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** Paramètres modifiables dans l'administration (liste fermée : on ne touche pas aux autres clés). */
export const EDITABLE_SETTINGS = {
  maintenanceMode: 'boolean',
  maintenanceMessage: 'string',
  purchasedCreditsExpiryMonths: 'number',
  minMarginPercent: 'number',
  usdToXafRate: 'number',
  fxFeePercent: 'number',
  openpayCommissionPercent: 'number',
  regenOverheadPercent: 'number',
  maxConcurrentGenerationsPerUser: 'number',
  maxConcurrentGenerationsGlobal: 'number',
  inputRetentionDays: 'number',
  outputRetentionDays: 'number',
  deletionReminderDays: 'number',
  providerBalanceAlertUsd: 'number',
  failureRateAlertPercent: 'number',
  loginOtpMode: 'string',
} as const;
export type EditableSettingKey = keyof typeof EDITABLE_SETTINGS;

export const settingsUpdateSchema = z
  .object({
    values: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])),
    reason: reasonSchema,
  })
  .strict();
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

export const promoteAdminSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), reason: reasonSchema });
export type PromoteAdminInput = z.infer<typeof promoteAdminSchema>;

export const demoteAdminSchema = z.object({ reason: reasonSchema });
export type DemoteAdminInput = z.infer<typeof demoteAdminSchema>;

export const legalPublishSchema = z.object({
  type: z.enum(['CGU', 'CHARTE', 'CONFIDENTIALITE']),
  content: z.string().trim().min(50, 'Texte trop court.').max(100_000),
  major: z.boolean(),
  reason: reasonSchema,
});
export type LegalPublishInput = z.infer<typeof legalPublishSchema>;

export const topUpSchema = z.object({
  amountUsd: z.number().positive().max(1_000_000),
  amountXaf: z.number().int().positive().max(1_000_000_000),
  note: z.string().trim().max(300).optional(),
});
export type TopUpInput = z.infer<typeof topUpSchema>;

export const payoutSchema = z.object({
  amountXaf: z.number().int().positive().max(1_000_000_000),
  commissionXaf: z.number().int().min(0).max(1_000_000_000),
  date: z.iso.date(),
  note: z.string().trim().max(300).optional(),
});
export type PayoutInput = z.infer<typeof payoutSchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
