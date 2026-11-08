/**
 * Types et règles pures des pays et moyens de paiement. Les pays, devises, indicatifs, réseaux et statuts vivent
 * en BASE (tables Country / PaymentMethod / CountryPaymentMethod, voir CountryCatalogService) : ni l'interface ni
 * la logique de paiement ne codent un pays, un opérateur, un indicatif ou une devise. Le catalogue initial est
 * dans catalog/catalog-data.ts (seed idempotent).
 *
 * Un pays n'est PROPOSÉ à l'achat que si sa devise est activée à la vente (table CurrencySetting) : sans prix
 * du crédit dans cette devise, il serait impossible de facturer sans inventer un taux de change.
 */

export interface NetworkConfig {
  /** Code envoyé au fournisseur (« mtn_cm »). */
  code: string;
  /** Nom affiché au client. */
  name: string;
  /** Code du moyen de paiement du catalogue (« MTN_MOMO »). */
  methodCode: string;
}

export interface CountryConfig {
  /** ISO 3166-1 alpha-2. */
  iso: string;
  name: string;
  /** ISO 4217. */
  currency: string;
  /** Indicatif sans « + ». */
  dial: string;
  /** Moyens ACTIVÉS par l'administrateur ET réellement utilisables avec notre intégration SasPay. */
  networks: NetworkConfig[];
}

/**
 * Bornes d'un paiement par devise. Le fournisseur ne publie pas de minimum : la valeur ci-dessous est un
 * MINIMUM COMMERCIAL prudent, à confirmer avec SasPay. Une devise absente de cette table n'a pas d'achat à la
 * quantité (les packs, eux, restent vendables) : on ne devine pas une borne.
 */
export const PAYMENT_LIMITS: Readonly<
  Record<string, { min: number; max: number }>
> = {
  XAF: { min: 500, max: 500_000 },
  XOF: { min: 500, max: 500_000 },
};

/** Réseau équivalent à l'ancien champ « operator » (MTN / AIRTEL) dans un pays. */
export function legacyNetworkCode(
  operator: 'MTN' | 'AIRTEL',
  countryIso: string,
): string {
  return `${operator.toLowerCase()}_${countryIso.toLowerCase()}`;
}

/** Opérateur historique d'un réseau (pour la colonne Payment.operator) ; OTHER pour tous les autres. */
export function operatorOf(networkCode: string): 'MTN' | 'AIRTEL' | 'OTHER' {
  if (networkCode.startsWith('mtn_')) return 'MTN';
  if (networkCode.startsWith('airtel_')) return 'AIRTEL';
  return 'OTHER';
}
