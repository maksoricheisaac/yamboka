import type { LedgerEntryType, PaymentStatus } from "@yamboka/shared";

export const LEDGER_LABELS: Record<LedgerEntryType, string> = {
  PURCHASE: "Achat de crédits",
  FIRST_PURCHASE_BONUS: "Bonus de premier achat",
  WELCOME: "Crédits de bienvenue",
  RESERVE: "Réservé pour une création",
  CAPTURE: "Création terminée",
  RELEASE: "Crédits restitués",
  ADMIN_ADJUST: "Ajustement",
  EXPIRE: "Crédits expirés",
};

export const PAYMENT_LABELS: Record<PaymentStatus, { text: string; tone: "pending" | "ok" | "error" }> = {
  INITIATED: { text: "En attente", tone: "pending" },
  PENDING: { text: "En attente", tone: "pending" },
  SUCCESS: { text: "Réussi", tone: "ok" },
  FAILED: { text: "Échoué", tone: "error" },
  CANCELLED: { text: "Annulé", tone: "error" },
};

/** Nom affiché du fournisseur de paiement (Payment.gateway). */
export function providerLabel(provider: string): string {
  return provider === "saspay" ? "SasPay" : provider === "mock" ? "Simulé" : provider;
}

export const OPERATOR_LABELS = { MTN: "MTN Mobile Money", AIRTEL: "Airtel Money" } as const;
