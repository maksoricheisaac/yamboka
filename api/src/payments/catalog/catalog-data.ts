/**
 * Catalogue initial des pays et moyens de paiement (captures de la page officielle SasPay, novembre 2026).
 * C'est une DONNÉE D'AMORÇAGE : une fois en base, seuls les statuts (ACTIVE / COMING_SOON / DISABLED) sont
 * pilotés par l'administrateur ; le seed ne les écrase jamais. Les champs techniques (code réseau SasPay,
 * limitation, nom) sont en revanche remis à jour à chaque exécution.
 *
 * `network` = code du réseau chez SasPay, relevé dans docs/SASPAY_INTEGRATION_GUIDE.md §6.2 ; null = pas de
 * réseau correspondant dans cette documentation (le moyen existe dans le catalogue mais ne peut pas être
 * activé : on n'invente aucun code).
 */
export type MethodType = 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER';

/** Raison technique pour laquelle un moyen ne peut pas être activé pour de vrais paiements. */
export type Limitation =
  | 'NOT_IN_SASPAY' // aucun réseau correspondant dans la documentation SasPay
  | 'OTP_BEFORE' // exige un code généré par le client avant le paiement (non géré)
  | 'OTP_AFTER' // exige un code reçu après le push (non géré)
  | 'INACTIVE_AT_SASPAY' // réseau désactivé chez SasPay
  | 'CARD_FLOW_NOT_INTEGRATED'; // carte : USD uniquement + page hébergée, parcours non encore intégré

export const LIMITATION_LABELS: Record<Limitation, string> = {
  NOT_IN_SASPAY:
    'Non pris en charge par SasPay d’après sa documentation (aucun réseau correspondant).',
  OTP_BEFORE:
    'Exige un code généré par le client avant le paiement : non géré par notre intégration.',
  OTP_AFTER:
    'Exige un code reçu après le paiement : non géré par notre intégration.',
  INACTIVE_AT_SASPAY: 'Réseau désactivé chez SasPay.',
  CARD_FLOW_NOT_INTEGRATED:
    'Paiement par carte (USD, page hébergée) pas encore intégré : prix en USD et parcours de retour à valider avec SasPay.',
};

export interface MethodSeed {
  code: string;
  name: string;
  type: MethodType;
}

export const METHODS: readonly MethodSeed[] = [
  { code: 'MTN_MOMO', name: 'MTN MoMo', type: 'MOBILE_MONEY' },
  { code: 'ORANGE_MONEY', name: 'Orange Money', type: 'MOBILE_MONEY' },
  { code: 'MOOV_MONEY', name: 'Moov Money', type: 'MOBILE_MONEY' },
  { code: 'AIRTEL_MONEY', name: 'Airtel Money', type: 'MOBILE_MONEY' },
  { code: 'WAVE', name: 'Wave', type: 'MOBILE_MONEY' },
  { code: 'YAS', name: 'YAS', type: 'MOBILE_MONEY' },
  { code: 'CELTIIS_CASH', name: 'Celtiis Cash', type: 'MOBILE_MONEY' },
  { code: 'MPESA', name: 'M-Pesa', type: 'MOBILE_MONEY' },
  { code: 'SAFARICOM_MPESA', name: 'Safaricom M-Pesa', type: 'MOBILE_MONEY' },
  { code: 'ETHIO_TELECOM', name: 'Ethio Telecom', type: 'MOBILE_MONEY' },
  { code: 'VODACOM', name: 'Vodacom M-Pesa', type: 'MOBILE_MONEY' },
  { code: 'MOVITEL', name: 'Movitel', type: 'MOBILE_MONEY' },
  { code: 'TNM', name: 'TNM Mpamba', type: 'MOBILE_MONEY' },
  { code: 'AIRTELTIGO', name: 'AirtelTigo Money', type: 'MOBILE_MONEY' },
  { code: 'TELECEL', name: 'Telecel Cash', type: 'MOBILE_MONEY' },
  { code: 'HALOTEL', name: 'HaloTel (Halopesa)', type: 'MOBILE_MONEY' },
  { code: 'CARD', name: 'Carte bancaire', type: 'CARD' },
  { code: 'VISA', name: 'Visa', type: 'CARD' },
  { code: 'MASTERCARD', name: 'Mastercard', type: 'CARD' },
  { code: 'SWIFT', name: 'Virement SWIFT', type: 'BANK_TRANSFER' },
];

/** [code du moyen, code réseau SasPay | null, limitation | null, note] */
export type Assoc = readonly [
  string,
  string | null,
  Limitation | null,
  (string | null)?,
];

export interface CountrySeed {
  iso: string;
  name: string;
  dialCode: string;
  currency: string;
  feePercent: number | null;
  feeNote: string;
  methods: readonly Assoc[];
}

const CARD: Assoc = ['CARD', 'card', 'CARD_FLOW_NOT_INTEGRATED'];
const NO: Limitation = 'NOT_IN_SASPAY';
/** Pays ouverts avant l'introduction du catalogue (ancien réglage paymentEnabledCountries : CG,CM). */
export const LEGACY_OPEN_COUNTRIES: readonly string[] = ['CG', 'CM'];

export const COUNTRIES: readonly CountrySeed[] = [
  {
    iso: 'CI',
    name: 'Côte d’Ivoire',
    dialCode: '225',
    currency: 'XOF',
    feePercent: 1.8,
    feeNote: 'Dès 1,8 %',
    methods: [
      ['ORANGE_MONEY', 'orange_ci', 'OTP_BEFORE'],
      ['MTN_MOMO', 'mtn_ci', null],
      ['WAVE', 'wave_ci', null],
      ['MOOV_MONEY', 'moov_ci', null],
      CARD,
    ],
  },
  {
    iso: 'SN',
    name: 'Sénégal',
    dialCode: '221',
    currency: 'XOF',
    feePercent: 2.25,
    feeNote: '2,25 %',
    methods: [
      ['ORANGE_MONEY', 'orange_sn', null],
      ['WAVE', 'wave_sn', null],
      [
        'YAS',
        'freemoney_sn',
        null,
        'SasPay liste « Free Money » ; correspondance avec la marque YAS à confirmer.',
      ],
      CARD,
    ],
  },
  {
    iso: 'TG',
    name: 'Togo',
    dialCode: '228',
    currency: 'XOF',
    feePercent: 2.25,
    feeNote: '2,25 %',
    methods: [['MOOV_MONEY', 'moov_tg', null], ['MTN_MOMO', null, NO], CARD],
  },
  {
    iso: 'BJ',
    name: 'Bénin',
    dialCode: '229',
    currency: 'XOF',
    feePercent: 2.2,
    feeNote: 'Dès 2,2 %',
    methods: [
      ['MTN_MOMO', 'mtn_bj', null],
      ['MOOV_MONEY', 'moov_bj', null],
      ['CELTIIS_CASH', 'celtiis_bj', null],
      CARD,
    ],
  },
  {
    iso: 'CM',
    name: 'Cameroun',
    dialCode: '237',
    currency: 'XAF',
    feePercent: 1.75,
    feeNote: 'Dès 1,75 %',
    methods: [
      ['MTN_MOMO', 'mtn_cm', null],
      ['ORANGE_MONEY', 'orange_cm', null],
      CARD,
    ],
  },
  {
    iso: 'BF',
    name: 'Burkina Faso',
    dialCode: '226',
    currency: 'XOF',
    feePercent: 3,
    feeNote: 'Dès 3 %',
    methods: [
      ['ORANGE_MONEY', 'orange_bf', 'OTP_BEFORE'],
      ['MOOV_MONEY', 'moov_bf', null],
      CARD,
    ],
  },
  {
    iso: 'LS',
    name: 'Lesotho',
    dialCode: '266',
    currency: 'LSL',
    feePercent: 2,
    feeNote: '2 %',
    methods: [['MPESA', null, NO], CARD],
  },
  {
    iso: 'SL',
    name: 'Sierra Leone',
    dialCode: '232',
    currency: 'SLE',
    feePercent: 3.3,
    feeNote: '3,3 %',
    methods: [['ORANGE_MONEY', null, NO], CARD],
  },
  {
    iso: 'ET',
    name: 'Éthiopie',
    dialCode: '251',
    currency: 'ETB',
    feePercent: 1.5,
    feeNote: 'Dès 1,5 %',
    methods: [['SAFARICOM_MPESA', null, NO], ['ETHIO_TELECOM', null, NO], CARD],
  },
  {
    iso: 'UG',
    name: 'Ouganda',
    dialCode: '256',
    currency: 'UGX',
    feePercent: 2.5,
    feeNote: 'Dès 2,5 %',
    methods: [
      ['MTN_MOMO', 'mtn_ug', null],
      ['AIRTEL_MONEY', 'airtel_ug', null],
      CARD,
    ],
  },
  {
    iso: 'RW',
    name: 'Rwanda',
    dialCode: '250',
    currency: 'RWF',
    feePercent: 2.5,
    feeNote: 'Dès 2,5 %',
    methods: [
      ['MTN_MOMO', 'mtn_rw', null],
      ['AIRTEL_MONEY', 'airtel_rw', null],
      CARD,
    ],
  },
  {
    iso: 'CD',
    name: 'République démocratique du Congo',
    dialCode: '243',
    currency: 'CDF',
    feePercent: 2.5,
    feeNote: 'Dès 2,5 %',
    methods: [
      ['VODACOM', 'vodacom_cd', null],
      ['AIRTEL_MONEY', 'airtel_cd', null],
      ['ORANGE_MONEY', 'orange_cd', null],
      CARD,
    ],
  },
  {
    iso: 'CG',
    name: 'Congo-Brazzaville',
    dialCode: '242',
    currency: 'XAF',
    feePercent: 4,
    feeNote: 'Dès 4 %',
    methods: [
      [
        'MTN_MOMO',
        'mtn_cg',
        null,
        'Réseau relevé dans GET /networks/ à l’intégration ; le guide du 1er nov. 2026 ne le liste pas : à confirmer par un paiement réel.',
      ],
      ['AIRTEL_MONEY', 'airtel_cg', null],
      CARD,
    ],
  },
  {
    iso: 'MZ',
    name: 'Mozambique',
    dialCode: '258',
    currency: 'MZN',
    feePercent: 4,
    feeNote: 'Dès 4 %',
    methods: [['MPESA', null, NO], ['MOVITEL', null, NO], CARD],
  },
  {
    iso: 'MW',
    name: 'Malawi',
    dialCode: '265',
    currency: 'MWK',
    feePercent: 3.33,
    feeNote: 'Dès 3,33 %',
    methods: [
      ['AIRTEL_MONEY', 'airtel_mw', null],
      ['TNM', 'tnm_mw', null],
      CARD,
    ],
  },
  {
    iso: 'ML',
    name: 'Mali',
    dialCode: '223',
    currency: 'XOF',
    feePercent: null,
    feeNote: 'Non indiqué',
    methods: [
      ['ORANGE_MONEY', 'orange_ml', null],
      ['MOOV_MONEY', 'moov_ml', null],
      CARD,
    ],
  },
  {
    iso: 'GA',
    name: 'Gabon',
    dialCode: '241',
    currency: 'XAF',
    feePercent: 2,
    feeNote: 'Dès 2 %',
    methods: [['AIRTEL_MONEY', null, NO], ['MOOV_MONEY', null, NO], CARD],
  },
  {
    iso: 'GH',
    name: 'Ghana',
    dialCode: '233',
    currency: 'GHS',
    feePercent: 2,
    feeNote: 'Dès 2 %',
    methods: [
      ['MTN_MOMO', 'mtn_gh', null],
      ['AIRTELTIGO', 'tigo_gh', null],
      [
        'TELECEL',
        'vodafone_gh',
        null,
        'SasPay liste « Vodafone Ghana » ; Telecel en est la nouvelle marque, à confirmer.',
      ],
      CARD,
    ],
  },
  {
    iso: 'KE',
    name: 'Kenya',
    dialCode: '254',
    currency: 'KES',
    feePercent: 1,
    feeNote: 'Dès 1 %',
    methods: [['MPESA', 'mpesa_ke', null], CARD],
  },
  {
    iso: 'NG',
    name: 'Nigeria',
    dialCode: '234',
    currency: 'NGN',
    feePercent: 3,
    feeNote: 'Dès 3 %',
    methods: [
      ['MTN_MOMO', 'mtn_ng', null],
      ['AIRTEL_MONEY', 'airtel_ng', null],
      CARD,
    ],
  },
  {
    iso: 'TZ',
    name: 'Tanzanie',
    dialCode: '255',
    currency: 'TZS',
    feePercent: 1,
    feeNote: 'Dès 1 %',
    methods: [
      ['VODACOM', 'mpesa_tz', null],
      [
        'YAS',
        'tigo_tz',
        null,
        'SasPay liste « Tigo Tanzania » ; YAS en est la nouvelle marque, à confirmer.',
      ],
      ['AIRTEL_MONEY', 'airtel_tz', null],
      ['HALOTEL', 'halopesa_tz', null],
      CARD,
    ],
  },
  {
    iso: 'XX',
    name: 'International',
    dialCode: '',
    currency: 'USD',
    feePercent: null,
    feeNote: 'Carte : 5 % ; SWIFT : aucun frais indiqué',
    methods: [
      ['VISA', 'card', 'CARD_FLOW_NOT_INTEGRATED'],
      ['MASTERCARD', 'card', 'CARD_FLOW_NOT_INTEGRATED'],
      ['SWIFT', null, NO],
    ],
  },
];

/** Frais indicatifs de la carte bancaire (captures SasPay). */
export const CARD_FEE_PERCENT = 5;
