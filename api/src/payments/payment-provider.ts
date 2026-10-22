/**
 * Abstraction d'un agrégateur de paiement mobile money. Aucune logique métier ici : le registre de crédits
 * et les paiements ne dépendent que de cette interface, ce qui permet d'ajouter un agrégateur par pays
 * sans toucher au reste. En phase 1, seule l'implémentation simulée existe (aucun appel réseau, aucun argent).
 */

export type ProviderStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface InitiatePaymentRequest {
  amount: number;
  currency: string;
  phone: string;
  operator: 'MTN' | 'AIRTEL';
  /** Identifiant de l'utilisateur côté Yamboka (customer_external_id). */
  customerId: string;
  metadata: Record<string, string>;
}

export interface InitiatePaymentResult {
  reference: string;
  status: ProviderStatus;
}

export interface PaymentStatusResult {
  status: ProviderStatus;
  amount: number;
  currency: string;
}

/** Le fournisseur est injoignable ou en erreur : on peut réessayer plus tard. */
export class ProviderUnavailableError extends Error {}
/** Le fournisseur a répondu quelque chose d'inexploitable : on n'en tire AUCUNE conclusion. */
export class ProviderInvalidResponseError extends Error {}

export abstract class PaymentProvider {
  /** Nom stocké dans Payment.gateway. */
  abstract readonly name: string;

  abstract initiate(
    request: InitiatePaymentRequest,
  ): Promise<InitiatePaymentResult>;

  /**
   * Statut réel de la transaction chez le fournisseur. C'est la SEULE source de vérité pour créditer :
   * un callback n'est jamais cru sur parole, il ne fait que déclencher cette vérification (RG-04).
   */
  abstract getStatus(reference: string): Promise<PaymentStatusResult>;
}
