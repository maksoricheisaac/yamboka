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
}

export interface LedgerPage {
  items: LedgerEntryView[];
  nextCursor: string | null;
}
