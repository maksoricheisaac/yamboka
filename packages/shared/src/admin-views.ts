/** Formes des réponses de l'API d'administration, partagées avec l'interface. */

/**
 * Réponse paginée côté serveur (convention du projet : `items` + méta). `page` est la page RÉELLEMENT servie
 * (ramenée à la dernière page valide si la demandée dépasse le total).
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Page valide la plus proche : au moins 1, au plus la dernière (une liste vide a une seule page). */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(page, 1), Math.max(Math.ceil(total / pageSize), 1));
}

export function buildPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  return { items, total, page, pageSize, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}

export interface AdminAlert {
  key: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  href?: string;
}

export interface DailyPoint {
  day: string;
  value: number;
}

export interface AdminStats {
  periodDays: number;
  /** Bornes réelles de la période (ISO ; fin exclue). */
  periodFrom: string;
  periodTo: string;
  /** Vrai si la période vient de dates saisies (et non d'un nombre de jours glissants). */
  custom: boolean;
  users: { total: number; newInPeriod: number; activeInPeriod: number; suspended: number; banned: number };
  payments: {
    revenueFcfa: number;
    successCount: number;
    pendingCount: number;
    failedCount: number;
    volumeFcfa: number;
  };
  generations: { pending: number; processing: number; completed: number; failed: number };
  credits: { sold: number; consumed: number };
  providerBalance: {
    /** Vrai tant qu'aucune recharge n'a été saisie : le solde n'est alors pas calculable. */
    known: boolean;
    topUpsUsd: number;
    estimatedConsumedUsd: number;
    estimatedBalanceUsd: number;
  };
  series: { revenue: DailyPoint[]; signups: DailyPoint[] };
  alerts: AdminAlert[];
}

export interface AdminUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  emailVerified: boolean;
  credits: number;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  phone: string | null;
  deletedAt: string | null;
  payments: {
    id: string;
    amount: number;
    currency: string;
    credits: number;
    status: string;
    operator: string;
    createdAt: string;
    /** Pack acheté (ou achat sur mesure) et référence fournisseur : servent au récapitulatif d'une régularisation. */
    packName: string;
    externalReference: string | null;
    creditState: PaymentCreditState;
  }[];
  generations: { id: string; status: string; creditsCost: number; product: string; createdAt: string }[];
  ledger: { id: string; type: string; amount: number; note: string | null; createdAt: string }[];
  moderation: { id: string; action: string; reason: string; actor: string; createdAt: string }[];
}

export interface MarginCell {
  product: string;
  marginPercent: number;
  belowThreshold: boolean;
}

export interface AdminPack {
  id: string;
  name: string;
  priceFcfa: number;
  baseCredits: number;
  bonusPercent: number;
  totalCredits: number;
  active: boolean;
  featured: boolean;
  publicVisible: boolean;
  sortOrder: number;
  margins: MarginCell[];
  /** Pire marge parmi les produits actifs. */
  worstMarginPercent: number | null;
  belowThreshold: boolean;
}

/** Page de packs + synthèse calculée sur TOUS les packs (la page affichée n'en montre qu'une partie). */
export type AdminPackPage = Page<AdminPack> & {
  summary: {
    total: number;
    active: number;
    publicVisible: number;
    belowMargin: number;
    /** Les packs affichés sur les pages publiques (3 au plus), quelle que soit la page consultée. */
    publicPacks: { id: string; name: string; priceFcfa: number; featured: boolean }[];
  };
};

export interface AdminProduct {
  id: string;
  code: string;
  name: string;
  billingUnit: 'SECOND' | 'IMAGE';
  creditsPerUnit: number;
  providerCostUsdPerUnit: number;
  phase: 'MVP' | 'PHASE_2';
  active: boolean;
}

export interface AdminPreset {
  id: string;
  name: string;
  category: string;
  type: string;
  productCode: string;
  visible: boolean;
  /** Mise en avant éditoriale (« à la une »), distincte de la publication. */
  featured: boolean;
}

export interface AdminPaymentRow {
  id: string;
  user: { id: string; email: string };
  packName: string;
  amount: number;
  credits: number;
  operator: string;
  status: string;
  externalReference: string | null;
  failureReason: string | null;
  createdAt: string;
  /** Date de confirmation (crédit des crédits), null tant que le paiement n'a pas abouti. */
  confirmedAt: string | null;
  /** Instantané pris à la création : pays, devise et moyen de paiement, figés pour l'historique. */
  country: string;
  countryName: string | null;
  currency: string;
  methodCode: string | null;
  methodName: string | null;
  /** Fournisseur de paiement (Payment.gateway). */
  provider: string;
  /** Réseau chez le fournisseur (ex. « mtn_cg »). */
  network: string | null;
  /** Montant réellement envoyé au fournisseur (prix affiché moins les frais absorbés). */
  sentAmount: number | null;
  clientFee: number | null;
  debitedAmount: number | null;
  /** Dernière vérification auprès du fournisseur (ISO), connue ou non. */
  lastCheckedAt: string | null;
  /** Problème de traitement constaté (fournisseur injoignable, clé refusée, refus…), sinon null. */
  issue: string | null;
  /** État de l'attribution des crédits, indépendant du statut du paiement. */
  creditState: PaymentCreditState;
  /** Origine de l'attribution : vérification automatique ou régularisation administrative. */
  creditOrigin: 'AUTO' | 'MANUAL' | null;
  /** Vrai quand le paiement demande une intervention (confirmé non crédité, bloqué, montant incohérent). */
  needsAttention: boolean;
}

/**
 * - `CREDITED` : les crédits sont au registre.
 * - `NOT_CREDITED` : le paiement est confirmé mais aucun crédit n'a été attribué — anomalie à régulariser.
 * - `NONE` : rien à attribuer (paiement en attente, échoué ou annulé).
 */
export type PaymentCreditState = 'CREDITED' | 'NOT_CREDITED' | 'NONE';

/** Anomalies filtrables dans le journal des paiements. */
export const PAYMENT_ANOMALIES = [
  { value: 'pending', label: 'En attente' },
  { value: 'uncredited', label: 'Confirmés non crédités' },
  { value: 'settled', label: 'Régularisés manuellement' },
  { value: 'attention', label: 'Nécessitent une intervention' },
] as const;
export type PaymentAnomaly = (typeof PAYMENT_ANOMALIES)[number]['value'];

/** Compteurs du journal des paiements, calculés sur les MÊMES filtres que la liste affichée. */
export interface AdminPaymentStats {
  total: number;
  success: number;
  pending: number;
  failed: number;
  /** Paiements confirmés par le fournisseur dont les crédits n'ont jamais été attribués. */
  confirmedNotCredited: number;
  /** Paiements dont les crédits ont été attribués par un administrateur. */
  manuallySettled: number;
}

/** Une tentative de vérification d'un paiement, en ajout seul : jamais modifiée, jamais supprimée. */
export interface AdminPaymentCheck {
  at: string;
  kind: 'PROVIDER' | 'MANUAL';
  source: string;
  outcome: string;
  amount: number | null;
  currency: string | null;
  proofReference: string | null;
  detail: string | null;
  /** E-mail de l'administrateur à l'origine de la vérification, quand elle n'est pas automatique. */
  actor: string | null;
}

export type AdminPaymentEventKind =
  | 'created'
  | 'webhook'
  | 'verification'
  | 'credited'
  | 'failed'
  | 'settled';

/** Une ligne de la chronologie d'un paiement, reconstituée sans stocker de secret ni de donnée personnelle. */
export interface AdminPaymentEvent {
  at: string;
  kind: AdminPaymentEventKind;
  label: string;
  detail: string | null;
}

export interface AdminPaymentDetail extends AdminPaymentRow {
  country: string;
  currency: string;
  payerPhone: string;
  bonusCredits: number;
  creditedAt: string | null;
  /** Frais calculés à la création : source du tarif, frais, total payé par le client. */
  fee: { source: string; fee: number; total: number; absorbed: number } | null;
  timeline: AdminPaymentEvent[];
  /** Administrateur ayant régularisé le paiement, le cas échéant. */
  creditedBy: string | null;
  /** Historique des vérifications auprès du fournisseur et des validations administratives. */
  checks: AdminPaymentCheck[];
  /** Tentatives de traitement automatique : combien, quand, et la dernière erreur rencontrée. */
  reconcileAttempts: number;
  lastReconcileAt: string | null;
  lastReconcileError: string | null;
  /** Vrai quand l'action « Régulariser » est possible : paiement non crédité avec une référence fournisseur. */
  canSettle: boolean;
}

export interface AdminGenerationRow {
  id: string;
  user: { id: string; email: string };
  product: string;
  preset: string | null;
  status: string;
  creditsCost: number;
  hidden: boolean;
  createdAt: string;
}

export interface AdminReportRow {
  id: string;
  generationId: string | null;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  reporter: string | null;
  createdAt: string;
}

export interface FinanceSummary {
  from: string;
  to: string;
  collectedFcfa: number;
  paymentsCount: number;
  creditsSold: number;
  creditsConsumed: number;
  topUpsUsd: number;
  topUpsXaf: number;
  payoutsXaf: number;
  payoutCommissionXaf: number;
  /** Crédits offerts sur la période (bonus de premier achat) : jamais payés par le client. */
  bonusCreditsGranted: number;
  /** Ce que ces crédits offerts coûteront chez le fournisseur, valorisé au taux sortant retenu. */
  bonusCostFcfa: number;
  /** Part du net encaissé que représente le coût du bonus (information). */
  bonusCostPercentOfCollected: number;
}

export interface TopUpRow {
  id: string;
  /** Dollars arrivés chez le fournisseur, en texte décimal. */
  receivedUsd: string;
  /** FCFA nets sortis de SasPay, ou null pour une recharge saisie avant la mesure de `r_out`. */
  netWithdrawnXaf: number | null;
  /** FCFA débités de la carte. */
  cardAmountXaf: number;
  /** Taux sortant mesuré (FCFA/$), en texte décimal, ou null si la recharge n'est pas mesurée. */
  rOut: string | null;
  /** false = saisie incomplète : l'affichage le signale « non mesuré » et la tarification ne s'y fie pas. */
  measured: boolean;
  occurredAt: string;
  note: string | null;
  createdAt: string;
}

/** Une ligne du simulateur : une résolution et une durée, chiffrées de bout en bout. */
export interface VideoSimulationRow {
  resolution: string;
  durationSeconds: number;
  /** Coût fournisseur en dollars, texte décimal. */
  costUsd: string;
  /** Ce coût valorisé en FCFA au taux retenu. */
  costFcfa: number;
  /** Ce que la vidéo doit rapporter net, marge comprise. */
  netNeededFcfa: number;
  /** Crédits qu'il FAUDRAIT facturer pour ne pas vendre sous le coût. */
  requiredCredits: number;
  /** Crédits que la grille facture aujourd'hui. */
  chargedCredits: number;
  /** Écart en FCFA entre ce que les crédits facturés rapportent et le coût. Négatif = vente à perte. */
  marginFcfa: number;
  belowCost: boolean;
  missingCredits: number;
  /** Origine du tarif fournisseur utilisé : saisie ou estimation. */
  priceSource: 'MANUAL' | 'ESTIMATE';
}

/** Marge d'un pack, au moyen de paiement le moins favorable. */
export interface PackMarginRow {
  name: string;
  priceFcfa: number;
  credits: number;
  bonusCredits: number;
  /** Net réellement reçu après frais d'encaissement. */
  netFcfa: number;
  /** Crédits comptés dans la valeur du crédit (bonus valorisé selon le réglage). */
  valuedCredits: number;
  /** FCFA nets par crédit pour ce pack, texte décimal. */
  fcfaPerCredit: string;
  /** Ce que les crédits offerts coûteront en FCFA (coût fournisseur estimé). */
  bonusCostFcfa: number;
}

/** Résultat complet du simulateur, pour un scénario donné. */
export interface SimulationView {
  /** Taux sortant retenu (FCFA/$), texte décimal. */
  pricingRate: string;
  /** false = taux provisoire (aucune recharge mesurée). */
  rateMeasured: boolean;
  marginPercent: string;
  circuitLossPercent: string;
  bonusValuationPercent: string;
  fxBufferPercent: string;
  /** true = les paramètres en vigueur ne reposent pas encore sur des mesures. */
  configProvisional: boolean;
  /** Valeur plancher d'un crédit (FCFA nets), texte décimal. */
  creditFloorFcfa: string;
  floorFromPack: string;
  floorFromMethod: string;
  floorNetFcfa: number;
  floorCredits: number;
  videos: VideoSimulationRow[];
  packs: PackMarginRow[];
  /** true = au moins une vidéo du catalogue se vend sous son coût. */
  anyBelowCost: boolean;
}

/** Une lecture du solde dans la console du fournisseur, avec l'écart constaté avec l'estimation. */
export interface CalibrationRow {
  id: string;
  readUsd: string;
  estimatedUsd: string;
  /** Négatif = on avait dépensé plus que ce que le journal savait. */
  deltaUsd: string;
  readAt: string;
  note: string | null;
  createdAt: string;
}

/** Solde prépayé du fournisseur tel que le journal le connaît. */
export interface ProviderBalanceRow {
  balanceUsd: string;
  /** Part du solde engagée par des créations en cours. */
  reservedUsd: string;
  /** Taux sortant retenu pour tarifer (FCFA/$), en texte décimal. */
  pricingRate: string;
  /** false = aucune recharge mesurée : le taux affiché est provisoire. */
  measured: boolean;
  lastCalibrationAt: string | null;
  lastCalibrationDeltaUsd: string | null;
}

export interface PayoutRow {
  id: string;
  amountXaf: number;
  commissionXaf: number;
  date: string;
  note: string | null;
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

/** Page du journal + synthèse calculée sur TOUT le journal (la page affichée n'en montre qu'une partie). */
export type AdminAuditPage = Page<AuditRow> & {
  summary: {
    total: number;
    /** Entrées écrites depuis minuit (UTC). */
    today: number;
    /** Entrées écrites par un administrateur identifié. */
    byAdmin: number;
    /** Entrées écrites par le système, sans administrateur (webhooks, tâches). */
    bySystem: number;
    /** Types d'entités réellement présents dans le journal, pour alimenter le filtre. */
    entityTypes: string[];
  };
};

export interface AdminAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

export interface LegalVersionRow {
  id: string;
  type: 'CGU' | 'CHARTE' | 'CONFIDENTIALITE';
  version: number;
  major: boolean;
  publishedAt: string;
  content: string;
}

export interface SettingsView {
  values: Record<string, string | number | boolean>;
  email: { provider: 'console' | 'smtp' };
}
