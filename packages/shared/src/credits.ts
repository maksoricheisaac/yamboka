/** Contrats des crédits. Le solde est toujours la somme du registre : aucune valeur n'est modifiable par le client. */

export interface BalanceView {
  credits: number;
  creditValueFcfa: number;
  valueFcfa: number;
}

export type LedgerEntryType =
  | 'PURCHASE'
  | 'FIRST_PURCHASE_BONUS'
  | 'WELCOME'
  | 'RESERVE'
  | 'CAPTURE'
  | 'RELEASE'
  | 'ADMIN_ADJUST'
  | 'EXPIRE';

export interface LedgerEntryView {
  id: string;
  type: LedgerEntryType;
  amount: number;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Achat à l'origine du mouvement (reçu disponible). */
  paymentId: string | null;
  /** Création à l'origine du mouvement. */
  generationId: string | null;
}

/** Filtres de l'historique : chaque famille d'opérations regroupe des types du registre. */
export const LEDGER_FILTERS = ['all', 'purchases', 'generations', 'refunds', 'bonuses'] as const;
export type LedgerFilter = (typeof LEDGER_FILTERS)[number];

export const LEDGER_FILTER_TYPES: Record<Exclude<LedgerFilter, 'all'>, LedgerEntryType[]> = {
  purchases: ['PURCHASE'],
  generations: ['RESERVE', 'CAPTURE'],
  refunds: ['RELEASE'],
  bonuses: ['FIRST_PURCHASE_BONUS', 'WELCOME', 'ADMIN_ADJUST', 'EXPIRE'],
};

/** Synthèse d'activité du compte (tableau de bord). */
export interface ActivitySummary {
  generationsTotal: number;
  generations30d: number;
  creditsSpent30d: number;
  creditsPurchased30d: number;
}

export interface LedgerPage {
  items: LedgerEntryView[];
  nextCursor: string | null;
}
