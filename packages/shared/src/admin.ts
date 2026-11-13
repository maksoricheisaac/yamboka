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

/**
 * Au-delà de ce nombre de crédits, une attribution exceptionnelle exige une justification détaillée ET une
 * confirmation renforcée dans l'interface. Vérifié côté serveur : le navigateur n'est jamais la seule protection.
 */
export const GRANT_JUSTIFICATION_THRESHOLD = 1_000;

/** Plafond d'une attribution manuelle unique. Le serveur refuse au-delà, quelle que soit la requête envoyée. */
export const MANUAL_GRANT_MAX = 100_000;

/** Longueur minimale d'une justification détaillée (attribution exceptionnelle importante, validation sur preuve). */
export const JUSTIFICATION_MIN = 20;

const justificationSchema = z
  .string()
  .trim()
  .max(2000, 'Justification trop longue.')
  .optional();

/**
 * Attribution exceptionnelle (geste commercial, correction) : écrite en ADMIN_ADJUST avec une référence unique.
 * La régularisation d'un paiement NE passe PAS par ici : voir `paymentSettleSchema`.
 */
export const creditAdjustSchema = z
  .object({
    /** Signé : positif pour créditer, négatif pour débiter. */
    amount: z
      .number({ error: 'Montant requis.' })
      .int('Nombre entier requis.')
      .refine((n) => n !== 0, 'Le montant ne peut pas être nul.')
      .refine((n) => Math.abs(n) <= MANUAL_GRANT_MAX, 'Montant trop élevé.'),
    reason: reasonSchema,
    /** Justification détaillée, obligatoire au-delà de GRANT_JUSTIFICATION_THRESHOLD crédits. */
    justification: justificationSchema,
  })
  .superRefine((v, ctx) => {
    if (
      Math.abs(v.amount) >= GRANT_JUSTIFICATION_THRESHOLD &&
      (v.justification ?? '').length < JUSTIFICATION_MIN
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification'],
        message: `Au-delà de ${GRANT_JUSTIFICATION_THRESHOLD} crédits, une justification détaillée d'au moins ${JUSTIFICATION_MIN} caractères est obligatoire.`,
      });
    }
  });
export type CreditAdjustInput = z.infer<typeof creditAdjustSchema>;

/**
 * Régularisation d'un paiement confirmé mais non crédité.
 *
 * - `PROVIDER` : le fournisseur est interrogé et doit confirmer un succès au montant exact. Seul cas où une
 *   attribution est automatiquement justifiée.
 * - `MANUAL_PROOF` : le fournisseur est injoignable. L'administrateur engage sa responsabilité sur une preuve
 *   externe (relevé du compte marchand) ; l'opération est tracée comme une validation administrative, jamais
 *   comme une confirmation du fournisseur. Un paiement que le fournisseur déclare échoué reste refusé.
 */
export const paymentSettleSchema = z
  .object({
    mode: z.enum(['PROVIDER', 'MANUAL_PROOF']).default('PROVIDER'),
    /** Référence de la preuve externe, obligatoire en validation administrative. */
    proofReference: z
      .string()
      .trim()
      .max(120, 'Référence de preuve trop longue.')
      .optional(),
    reason: reasonSchema,
    justification: justificationSchema,
  })
  .superRefine((v, ctx) => {
    if (v.mode !== 'MANUAL_PROOF') return;
    if ((v.proofReference ?? '').length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['proofReference'],
        message:
          'Une référence de preuve (relevé du compte marchand) est obligatoire pour une validation administrative.',
      });
    }
    if ((v.justification ?? '').length < JUSTIFICATION_MIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['justification'],
        message: `Une justification détaillée d'au moins ${JUSTIFICATION_MIN} caractères est obligatoire pour une validation administrative.`,
      });
    }
  });
export type PaymentSettleInput = z.infer<typeof paymentSettleSchema>;

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
  creditValueFcfa: 'number',
  generationConfirmCredits: 'number',
  generationConfirmBalancePercent: 'number',
  fxFeePercent: 'number',
  paymentCommissionPercent: 'number',
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
  /** Fournisseur de paiement (« saspay », « mock ») : filtre du journal des paiements. */
  provider: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  /** 10, 20, 50 ou 100 dans l'interface ; 100 au maximum côté serveur. */
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Colonne de tri (liste blanche propre à chaque liste, sinon ignorée) et sens. Un identifiant départage toujours les égalités. */
  sort: z.string().trim().max(30).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  /** Réclamations : motif choisi par le client (REPORT_REASONS). */
  reason: z.string().trim().max(60).optional(),
  /** Journal d'audit : e-mail (même partiel) de l'administrateur, et type d'entité visée. */
  actor: z.string().trim().max(120).optional(),
  entity: z.string().trim().max(40).optional(),
  /** Générations : code du produit de génération (WAN_I2V_480…). */
  product: z.string().trim().max(40).optional(),
  /** Filtres du journal des paiements. */
  country: z.string().trim().length(2).toUpperCase().optional(),
  method: z.string().trim().max(40).optional(),
  /** Journal des paiements : anomalie recherchée (voir PAYMENT_ANOMALIES). */
  anomaly: z.enum(['pending', 'uncredited', 'settled', 'attention']).optional(),
  userId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
