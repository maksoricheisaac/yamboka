import { z } from 'zod';
import type { PackView } from './catalog';
import { phoneSchema } from './phone';
import type { CreditRates, VideoResolution } from './pricing';

/** Opérateurs historiques (Congo). Les autres réseaux sont identifiés par leur code (« orange_cm ») et rangés sous OTHER. */
export const MOBILE_OPERATORS = ['MTN', 'AIRTEL'] as const;
export type MobileOperator = (typeof MOBILE_OPERATORS)[number];
export type PaymentOperator = MobileOperator | 'OTHER';

/** Pays de la clientèle d'origine : choisi quand aucun pays n'est précisé (compatibilité avec les anciens appels). */
export const DEFAULT_PAYMENT_COUNTRY = 'CG';

/** Libellé de la ligne « sur mesure » dans l'historique et les reçus (aucun pack n'est associé). */
export const CUSTOM_PURCHASE_LABEL = 'Crédits sur mesure';

export type PaymentStatus = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

/** Plafond de sécurité d'une saisie (le plafond réel dépend du pays et est contrôlé par le serveur). */
export const MAX_CUSTOM_CREDITS_INPUT = 1_000_000;

const orderFields = {
  /** Achat d'un pack. Prime sur `credits`. */
  packId: z.uuid({ error: 'Pack invalide.' }).optional(),
  /** Achat d'une quantité libre de crédits (ignorée si `packId` est fourni). Le montant est TOUJOURS recalculé par le serveur. */
  credits: z
    .number({ error: 'Indiquez un nombre de crédits.' })
    .int({ error: 'Indiquez un nombre entier de crédits.' })
    .min(1, { error: 'Indiquez un nombre de crédits.' })
    .max(MAX_CUSTOM_CREDITS_INPUT, { error: 'Quantité trop élevée.' })
    .optional(),
  /** Pays du paiement (ISO 3166-1 alpha-2). Défaut : CG. */
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, { error: 'Pays invalide.' })
    .default(DEFAULT_PAYMENT_COUNTRY),
  /** Code du réseau (« mtn_cg », « orange_cm »), tel que proposé par /catalog/pricing. */
  network: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,40}$/, { error: 'Moyen de paiement invalide.' })
    .optional(),
  /** Ancien champ (Congo) : « MTN » ou « AIRTEL » équivaut à network = mtn_cg / airtel_cg. */
  operator: z.enum(MOBILE_OPERATORS, { error: 'Choisissez un moyen de paiement.' }).optional(),
};

const oneOrder = {
  // Un pack prime : si les deux sont envoyés, `credits` est ignoré (jamais d'achat hybride).
  check: (d: { packId?: string; credits?: number }) =>
    d.packId !== undefined || d.credits !== undefined,
  params: { message: 'Choisissez un pack ou un nombre de crédits.', path: ['packId'] },
};
const oneMethod = {
  check: (d: { network?: string; operator?: string }) => d.network !== undefined || d.operator !== undefined,
  params: { message: 'Choisissez un moyen de paiement.', path: ['network'] },
};

export const createPaymentSchema = z
  .object({ ...orderFields, phone: phoneSchema })
  .refine(oneOrder.check, oneOrder.params)
  .refine(oneMethod.check, oneMethod.params);
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** Devis serveur : mêmes champs que la création, sans téléphone. */
export const quotePaymentSchema = z.object(orderFields).refine(oneOrder.check, oneOrder.params);
export type QuotePaymentInput = z.infer<typeof quotePaymentSchema>;

/** Résultat d'un devis : ce que le serveur facturerait réellement. */
export interface PaymentQuoteView {
  country: string;
  currency: string;
  /** Montant à payer, dans la devise du pays. */
  amount: number;
  /** Crédits de base achetés (le bonus de premier achat éventuel s'y ajoute à la confirmation). */
  credits: number;
  /** Pourcentage de bonus de premier achat promis ; toujours 0 pour un achat sur mesure. */
  firstPurchaseBonusPercent: number;
  custom: boolean;
  packName: string;
}

// ───────────── Pays et moyens de paiement ─────────────

export interface PaymentMethodView {
  /** Code envoyé au serveur (« mtn_cg »). */
  code: string;
  /** Nom affiché (« MTN Mobile Money »). */
  name: string;
  /**
   * ACTIVE = sélectionnable. COMING_SOON = affiché « Bientôt disponible », jamais sélectionnable.
   * Absent = ACTIVE (anciennes réponses).
   */
  status?: 'ACTIVE' | 'COMING_SOON';
}

/** Achat de crédits à la quantité, dans la devise d'un pays. */
export interface CustomPurchaseRules {
  /** Prix d'un crédit dans la devise (entier). */
  unitPrice: number;
  minCredits: number;
  maxCredits: number;
}

export interface PaymentCountryView {
  /** ISO 3166-1 alpha-2. */
  iso: string;
  name: string;
  /** ISO 4217. */
  currency: string;
  /** Indicatif international avec « + » (« +242 »). */
  dialCode: string;
  methods: PaymentMethodView[];
  /** Packs vendus dans cette devise. */
  packs: PackView[];
  /** null = achat à la quantité indisponible pour cette devise. */
  custom: CustomPurchaseRules | null;
}

/** Tarification publique complète : une seule source pour le site, l'espace client et le moteur de génération. */
export interface PricingView {
  /** Crédits par seconde de vidéo, par résolution (réglés dans l'administration). */
  rates: CreditRates;
  duration: { min: number; max: number; default: number };
  resolutions: { id: VideoResolution; label: string; creditsPerSecond: number }[];
  countries: PaymentCountryView[];
  /** Pays intégrés mais pas encore ouverts (« Bientôt disponible »), non sélectionnables. */
  upcomingCountries: { iso: string; name: string }[];
}

export interface PaymentView {
  id: string;
  status: PaymentStatus;
  packName: string;
  /** Montant payé, dans la devise `currency` (le nom date du lancement en FCFA). */
  amountFcfa: number;
  currency: string;
  credits: number;
  bonusCredits: number;
  /** MTN et Airtel pour les anciens paiements ; OTHER pour les autres réseaux (voir `network`). */
  operator: PaymentOperator;
  /** Code du réseau (« mtn_cg »), null pour les paiements antérieurs au multi-pays. */
  network: string | null;
  /** Nom du moyen de paiement prêt à afficher (« Orange Money Cameroun »). */
  methodLabel: string;
  country: string;
  /** Vrai pour un achat à la quantité (sans pack). */
  custom: boolean;
  payerPhone: string;
  reference: string | null;
  failureReason: string | null;
  createdAt: string;
  creditedAt: string | null;
  /** Fournisseur de paiement (« saspay », « mock »), pour l'historique. */
  provider: string;
  /** Non vide : le client doit être redirigé ici pour payer (certains réseaux). Ne prouve jamais un paiement. */
  checkoutUrl: string | null;
  /** Vrai quand le fournisseur est simulé : l'écran d'attente propose alors le simulateur. */
  simulated: boolean;
}

export interface PaymentReceipt extends PaymentView {
  receiptNumber: string;
}

/** Scénarios du faux fournisseur (mode simulation uniquement). */
export const SIMULATION_OUTCOMES = [
  'success',
  'failed',
  'cancelled',
  'forged_callback',
  'provider_error',
  'invalid_response',
] as const;
export type SimulationOutcome = (typeof SIMULATION_OUTCOMES)[number];

export const simulatePaymentSchema = z.object({
  outcome: z.enum(SIMULATION_OUTCOMES),
  /** Nombre de callbacks envoyés pour ce scénario (test de callbacks dupliqués). */
  callbacks: z.number().int().min(1).max(5).default(1),
});
export type SimulatePaymentInput = z.infer<typeof simulatePaymentSchema>;

/**
 * Montant d'un achat à la quantité : ⌈ crédits × prix du crédit ⌉, calculé en centièmes entiers (pas de flottants).
 * Une SEULE formule pour l'affichage en direct (navigateur) et pour la facturation (serveur, qui la rejoue).
 */
export function customPurchaseAmount(credits: number, unitPrice: number): number {
  if (!Number.isInteger(credits) || credits < 1) throw new RangeError('Quantité de crédits invalide.');
  const hundredths = Math.round(unitPrice * 100);
  if (!(hundredths > 0)) throw new RangeError('Prix du crédit invalide.');
  return Math.ceil((credits * hundredths) / 100);
}
