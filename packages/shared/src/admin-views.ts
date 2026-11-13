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
  payments: { id: string; amount: number; credits: number; status: string; operator: string; createdAt: string }[];
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
}

export type AdminPaymentEventKind = 'created' | 'webhook' | 'verification' | 'credited' | 'failed';

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
}

export interface TopUpRow {
  id: string;
  amountUsd: number;
  amountXaf: number;
  fxRate: number;
  note: string | null;
  createdAt: string;
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
