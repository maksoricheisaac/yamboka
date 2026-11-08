/**
 * Pays et moyens de paiement gérés par Yamboka : l'UNIQUE endroit où ils sont décrits.
 * Ni l'interface ni la logique de paiement ne codent un pays, un opérateur, un indicatif ou une devise.
 *
 * Source : catalogue SasPay du 1er novembre 2026 (docs/SASPAY_INTEGRATION_GUIDE.md §6.2). C'est une PHOTO de la
 * documentation, pas l'état en direct : l'état réel d'un réseau pour notre compte est donné par
 * GET /pricing/my-rates/ (un réseau absent ou indisponible fait refuser le paiement avant tout débit, voir
 * PaymentsService.planAmount). Ajouter un pays ou un réseau = ajouter une entrée ici ; aucun autre code à modifier.
 *
 * Un pays n'est PROPOSÉ à l'achat que si sa devise est activée à la vente (table CurrencySetting) : sans prix
 * du crédit dans cette devise, il serait impossible de facturer sans inventer un taux de change.
 */

export interface NetworkConfig {
  /** Code envoyé au fournisseur (« mtn_cm »). */
  code: string;
  /** Nom affiché au client. */
  name: string;
  /**
   * Réseau décrit mais NON proposé :
   * - `inactive`   : désactivé chez SasPay (aucune route) ;
   * - `otp-before` : exige un code généré par le client AVANT le paiement (non géré par notre intégration) ;
   * - `otp-after`  : exige un code reçu par SMS APRÈS le push (non géré par notre intégration).
   */
  unsupported?: 'inactive' | 'otp-before' | 'otp-after';
}

export interface CountryConfig {
  /** ISO 3166-1 alpha-2. */
  iso: string;
  name: string;
  /** ISO 4217. */
  currency: string;
  /** Indicatif sans « + ». */
  dial: string;
  networks: NetworkConfig[];
}

export const PAYMENT_COUNTRIES: readonly CountryConfig[] = [
  {
    iso: 'CG',
    name: 'Congo-Brazzaville',
    currency: 'XAF',
    dial: '242',
    networks: [
      { code: 'mtn_cg', name: 'MTN Mobile Money' },
      { code: 'airtel_cg', name: 'Airtel Money' },
    ],
  },
  {
    iso: 'CM',
    name: 'Cameroun',
    currency: 'XAF',
    dial: '237',
    networks: [
      { code: 'mtn_cm', name: 'MTN MoMo' },
      { code: 'orange_cm', name: 'Orange Money' },
      {
        code: 'eu_mobile_cm',
        name: 'EU Mobile Money',
        unsupported: 'inactive',
      },
    ],
  },
  {
    iso: 'BF',
    name: 'Burkina Faso',
    currency: 'XOF',
    dial: '226',
    networks: [
      { code: 'moov_bf', name: 'Moov Money' },
      { code: 'orange_bf', name: 'Orange Money', unsupported: 'otp-before' },
    ],
  },
  {
    iso: 'BJ',
    name: 'Bénin',
    currency: 'XOF',
    dial: '229',
    networks: [
      { code: 'celtiis_bj', name: 'Celtiis Cash' },
      { code: 'moov_bj', name: 'Moov Money' },
      { code: 'mtn_bj', name: 'MTN MoMo' },
    ],
  },
  {
    iso: 'CD',
    name: 'RD Congo',
    currency: 'CDF',
    dial: '243',
    networks: [
      { code: 'airtel_cd', name: 'Airtel Money' },
      { code: 'orange_cd', name: 'Orange Money' },
      { code: 'vodacom_cd', name: 'Vodacom M-Pesa' },
    ],
  },
  {
    iso: 'CI',
    name: 'Côte d’Ivoire',
    currency: 'XOF',
    dial: '225',
    networks: [
      { code: 'moov_ci', name: 'Moov Money' },
      { code: 'mtn_ci', name: 'MTN MoMo' },
      { code: 'wave_ci', name: 'Wave' },
      { code: 'orange_ci', name: 'Orange Money', unsupported: 'otp-before' },
    ],
  },
  {
    iso: 'GH',
    name: 'Ghana',
    currency: 'GHS',
    dial: '233',
    networks: [
      { code: 'mtn_gh', name: 'MTN MoMo' },
      { code: 'tigo_gh', name: 'AirtelTigo Money' },
      { code: 'vodafone_gh', name: 'Vodafone Cash' },
    ],
  },
  {
    iso: 'GN',
    name: 'Guinée',
    currency: 'GNF',
    dial: '224',
    networks: [
      { code: 'mtn_gn', name: 'MTN MoMo' },
      { code: 'orange_gn', name: 'Orange Money', unsupported: 'inactive' },
    ],
  },
  {
    iso: 'KE',
    name: 'Kenya',
    currency: 'KES',
    dial: '254',
    networks: [{ code: 'mpesa_ke', name: 'M-Pesa' }],
  },
  {
    iso: 'ML',
    name: 'Mali',
    currency: 'XOF',
    dial: '223',
    networks: [
      { code: 'mobi_cash_ml', name: 'Mobi Cash' },
      { code: 'moov_ml', name: 'Moov Money' },
      { code: 'orange_ml', name: 'Orange Money' },
    ],
  },
  {
    iso: 'MW',
    name: 'Malawi',
    currency: 'MWK',
    dial: '265',
    networks: [
      { code: 'airtel_mw', name: 'Airtel Money' },
      { code: 'tnm_mw', name: 'TNM Mpamba' },
    ],
  },
  {
    iso: 'NE',
    name: 'Niger',
    currency: 'XOF',
    dial: '227',
    networks: [{ code: 'airtel_ne', name: 'Airtel Money' }],
  },
  {
    iso: 'NG',
    name: 'Nigéria',
    currency: 'NGN',
    dial: '234',
    networks: [
      { code: 'airtel_ng', name: 'Airtel Money' },
      { code: 'mtn_ng', name: 'MTN MoMo' },
    ],
  },
  {
    iso: 'RW',
    name: 'Rwanda',
    currency: 'RWF',
    dial: '250',
    networks: [
      { code: 'airtel_rw', name: 'Airtel Money' },
      { code: 'mtn_rw', name: 'MTN MoMo' },
    ],
  },
  {
    iso: 'SN',
    name: 'Sénégal',
    currency: 'XOF',
    dial: '221',
    networks: [
      { code: 'freemoney_sn', name: 'Free Money' },
      { code: 'orange_sn', name: 'Orange Money' },
      { code: 'wave_sn', name: 'Wave' },
      { code: 'wizall_sn', name: 'Wizall', unsupported: 'otp-after' },
      { code: 'e_money_sn', name: 'E-Money', unsupported: 'inactive' },
    ],
  },
  {
    iso: 'TG',
    name: 'Togo',
    currency: 'XOF',
    dial: '228',
    networks: [
      { code: 'moov_tg', name: 'Moov Money' },
      { code: 'togocel', name: 'Togocel Money' },
    ],
  },
  {
    iso: 'TZ',
    name: 'Tanzanie',
    currency: 'TZS',
    dial: '255',
    networks: [
      { code: 'airtel_tz', name: 'Airtel Money' },
      { code: 'halopesa_tz', name: 'Halopesa' },
      { code: 'mpesa_tz', name: 'M-Pesa' },
      { code: 'tigo_tz', name: 'Tigo Pesa' },
    ],
  },
  {
    iso: 'UG',
    name: 'Ouganda',
    currency: 'UGX',
    dial: '256',
    networks: [
      { code: 'airtel_ug', name: 'Airtel Money' },
      { code: 'mtn_ug', name: 'MTN MoMo' },
    ],
  },
  {
    iso: 'ZM',
    name: 'Zambie',
    currency: 'ZMW',
    dial: '260',
    networks: [
      { code: 'airtel_zm', name: 'Airtel Money' },
      { code: 'mtn_zm', name: 'MTN MoMo' },
      { code: 'zamtel_zm', name: 'Zamtel Kwacha' },
    ],
  },
];

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

export function findCountry(iso: string): CountryConfig | undefined {
  return PAYMENT_COUNTRIES.find((c) => c.iso === iso);
}

/** Réseaux réellement proposés (hors inactifs et hors ceux qui exigent un code non géré). */
export function offeredNetworks(country: CountryConfig): NetworkConfig[] {
  return country.networks.filter((n) => !n.unsupported);
}

export function findNetwork(
  country: CountryConfig,
  code: string,
): NetworkConfig | undefined {
  return offeredNetworks(country).find((n) => n.code === code);
}

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

/** Nom d'un réseau à partir de son code, y compris pour un réseau qui n'est plus proposé (historique). */
export function networkLabel(
  networkCode: string | null,
  countryIso: string,
): string | null {
  if (!networkCode) return null;
  const country = findCountry(countryIso);
  const net = country?.networks.find((n) => n.code === networkCode);
  return net ? net.name : null;
}
