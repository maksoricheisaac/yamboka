import { z } from 'zod';
import { reasonSchema } from './admin';

/** Pays, moyens de paiement et pagination : contrats partagés entre l'API et l'interface. */

export const CATALOG_STATUSES = ['ACTIVE', 'COMING_SOON', 'DISABLED'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const CATALOG_STATUS_LABELS: Record<CatalogStatus, string> = {
  ACTIVE: 'Actif',
  COMING_SOON: 'Bientôt disponible',
  DISABLED: 'Désactivé',
};

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

/** Paramètres de pagination communs à toutes les listes (page et pageSize, 20 par défaut, 100 maximum). */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** L'interface propose PAGE_SIZES ; le serveur accepte toute valeur de 1 à 100 (jamais plus). */
  pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
});

export const countryListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(CATALOG_STATUSES).optional(),
});
export type CountryListQuery = z.infer<typeof countryListQuerySchema>;

export const methodListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  type: z.enum(['MOBILE_MONEY', 'CARD', 'BANK_TRANSFER']).optional(),
});
export type MethodListQuery = z.infer<typeof methodListQuerySchema>;

export const catalogStatusBodySchema = z.object({
  status: z.enum(CATALOG_STATUSES),
  reason: reasonSchema,
});
export type CatalogStatusBody = z.infer<typeof catalogStatusBodySchema>;

/** Prix du crédit et bornes d'un achat libre dans la devise d'un pays (hors franc CFA, réglé dans les paramètres). */
export const currencyPricingSchema = z
  .object({
    creditValue: z.number().int().min(1).max(100_000_000),
    minAmount: z.number().int().min(1).max(1_000_000_000).nullable(),
    maxAmount: z.number().int().min(1).max(1_000_000_000).nullable(),
    active: z.boolean(),
    reason: reasonSchema,
  })
  .refine((v) => (v.minAmount === null) === (v.maxAmount === null), {
    message: 'Indiquez le minimum et le maximum, ou aucun des deux.',
    path: ['maxAmount'],
  })
  .refine((v) => v.minAmount === null || v.maxAmount === null || v.minAmount <= v.maxAmount, {
    message: 'Le minimum doit être inférieur ou égal au maximum.',
    path: ['maxAmount'],
  });
export type CurrencyPricingInput = z.infer<typeof currencyPricingSchema>;

export interface AdminCountryRow {
  iso: string;
  name: string;
  currency: string;
  /** Avec « + » ; vide pour la zone International. */
  dialCode: string;
  status: CatalogStatus;
  feeNote: string | null;
  methodCount: number;
  activeMethodCount: number;
  /** Faux : la devise n'a ni prix du crédit ni pack, le pays ne peut pas être ouvert. */
  sellable: boolean;
}

export interface AdminCountryMethodView {
  id: string;
  methodCode: string;
  name: string;
  type: 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER';
  status: CatalogStatus;
  saspayNetwork: string | null;
  feeNote: string | null;
  note: string | null;
  /** Non null : le moyen ne peut pas être activé (raison lisible). */
  blocker: string | null;
}

export interface AdminCountryDetail extends AdminCountryRow {
  methods: AdminCountryMethodView[];
  pricing: {
    /** Franc CFA : prix du crédit réglé dans « Paramètres » (creditValueFcfa), non modifiable ici. */
    cfa: boolean;
    creditValue: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    active: boolean;
    packs: number;
  };
}

export interface AdminMethodRow {
  code: string;
  name: string;
  type: 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER';
  countries: number;
  activeCountries: number;
}
