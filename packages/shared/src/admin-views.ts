/** Formes des réponses de l'API d'administration, partagées avec l'interface. */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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
