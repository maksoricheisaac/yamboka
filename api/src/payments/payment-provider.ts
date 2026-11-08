/**
 * Abstraction d'un agrégateur de paiement mobile money. Aucune logique métier ici : le registre de crédits
 * et les paiements ne dépendent que de cette interface, ce qui permet d'ajouter un agrégateur par pays
 * sans toucher au reste. En phase 1, seule l'implémentation simulée existe (aucun appel réseau, aucun argent).
 */

import type { FeeTier } from '../billing/fees';

export type ProviderStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface InitiatePaymentRequest {
  /** Montant envoyé au fournisseur (entier, dans la devise). Peut être inférieur au prix affiché (frais absorbés). */
  amount: number;
  currency: string;
  phone: string;
  operator: 'MTN' | 'AIRTEL' | 'OTHER';
  /** Identifiant de l'utilisateur côté Yamboka (customer_external_id). */
  customerId: string;
  metadata: Record<string, string>;
  /** Code du réseau chez le fournisseur (ex. « mtn_cg »). Par défaut : déduit de l'opérateur. */
  network?: string;
  /** Pays du paiement (ISO 3166-1). Par défaut : CG. */
  country?: string;
  /** Unique par intention de paiement, réutilisée à CHAQUE nouvel envoi de la même intention (timeout, reprise). */
  idempotencyKey?: string;
  customer?: { email: string; firstName: string; lastName: string };
  description?: string;
  /** Page de retour du client après une page hébergée. Ne prouve jamais un paiement. */
  returnUrl?: string;
}

export interface InitiatePaymentResult {
  reference: string;
  status: ProviderStatus;
  /** Non vide : le client doit être redirigé ici, sinon le paiement n'aura jamais lieu. */
  checkoutUrl?: string | null;
  /** Texte à montrer au client quand il doit valider sur son téléphone. */
  instructions?: string | null;
}

export interface PaymentStatusResult {
  status: ProviderStatus;
  /** Montant demandé au fournisseur (celui de l'initiation), pas le total débité au client. */
  amount: number;
  currency: string;
  /** Frais facturés au client et total réellement débité, quand le fournisseur les donne. */
  clientFee?: number | null;
  debitedAmount?: number | null;
  netAmount?: number | null;
}

/** Le fournisseur est injoignable ou en erreur : on peut réessayer plus tard. */
export class ProviderUnavailableError extends Error {}
/** Le fournisseur a répondu quelque chose d'inexploitable : on n'en tire AUCUNE conclusion. */
export class ProviderInvalidResponseError extends Error {}
/**
 * Le fournisseur refuse la demande de façon définitive (réseau inactif, client invalide, aucune route…).
 * Contrairement à une panne, rien n'a été débité et réessayer à l'identique ne servira à rien.
 */
export class ProviderRejectedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
/** Clé API refusée ou compte restreint : aucune conclusion sur le paiement, mais à signaler à l'administrateur. */
export class ProviderAuthError extends ProviderUnavailableError {}

export abstract class PaymentProvider {
  /** Nom stocké dans Payment.gateway. */
  abstract readonly name: string;

  /**
   * Vrai quand rejouer `initiate` avec la même `idempotencyKey` et le même corps renvoie la réponse du premier
   * appel au lieu de créer un 2e paiement. Alors, une panne ou un délai dépassé à l'initiation ne prouve pas
   * l'échec : le paiement reste INITIATED et sera rejoué puis vérifié, jamais déclaré échoué ni recréé.
   */
  readonly idempotent: boolean = false;

  /** Au-delà, un paiement jamais confirmé est déclaré échoué (un succès tardif confirmé reste crédité). */
  readonly pendingTtlMs: number = 24 * 3600 * 1000;

  /** Vrai quand le fournisseur facture des frais d'encaissement par réseau (le montant envoyé est alors réduit). Faux pour le simulé. */
  readonly chargesFees: boolean = false;

  /** Paliers de frais d'encaissement d'un réseau, ou null quand le fournisseur n'en facture pas (simulé). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getPayinTiers(_country: string, _network: string): Promise<FeeTier[] | null> {
    return Promise.resolve(null);
  }

  abstract initiate(
    request: InitiatePaymentRequest,
  ): Promise<InitiatePaymentResult>;

  /**
   * Statut réel de la transaction chez le fournisseur. C'est la SEULE source de vérité pour créditer :
   * un callback n'est jamais cru sur parole, il ne fait que déclencher cette vérification (RG-04).
   */
  abstract getStatus(reference: string): Promise<PaymentStatusResult>;
}
