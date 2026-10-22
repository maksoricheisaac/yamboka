/**
 * File de tâches asynchrones (paiements, expiration des crédits, plus tard générations).
 * Deux implémentations : BullMQ + Redis en fonctionnement normal, exécution directe sans Redis en test.
 * Toutes les tâches sont idempotentes : rejouer une tâche ne peut pas créditer ou débiter deux fois.
 */
export abstract class JobQueue {
  /** Vrai si les tâches passent par une vraie file (sinon l'appelant les exécute lui-même, tout de suite). */
  abstract readonly enabled: boolean;

  /** Demande la vérification d'un paiement auprès du fournisseur (déclenchée par un callback). */
  abstract enqueueVerifyPayment(paymentId: string): Promise<void>;
}

export const QUEUE_PAYMENTS = 'payments';
export const QUEUE_CREDITS = 'credits';
