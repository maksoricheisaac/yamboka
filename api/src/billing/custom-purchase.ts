import { customPurchaseAmount } from '@yamboka/shared';
import { computePackMargin } from './margin';

/**
 * Achat de crédits à la quantité. Le serveur est le SEUL à fixer le montant : il vaut
 * ⌈ crédits × prix d'un crédit ⌉ dans la devise, calculé en entiers (jamais en flottants).
 * Un achat sur mesure ne donne droit à aucun bonus : ceux-ci sont réservés aux packs.
 */

/** Prix d'un crédit avec au plus 2 décimales, en centièmes (4,5 → 450) ; évite 4.1 × 3 = 12.299999. */
function toHundredths(unitPrice: number): number {
  return Math.round(unitPrice * 100);
}

/**
 * Montant à payer pour une quantité de crédits (entier, arrondi au supérieur : jamais en dessous du prix).
 * Même formule que l'affichage en direct du navigateur (@yamboka/shared).
 */
export const customAmount = customPurchaseAmount;

export interface PaymentLimits {
  min: number;
  max: number;
}

/** Bornes en crédits d'un achat sur mesure, déduites des bornes de montant du pays. */
export function customBounds(
  unitPrice: number,
  limits: PaymentLimits,
): { minCredits: number; maxCredits: number } {
  const cents = toHundredths(unitPrice);
  if (!(cents > 0)) throw new RangeError('Prix du crédit invalide.');
  const minCredits = Math.ceil((limits.min * 100) / cents);
  // Plus grand nombre de crédits dont le montant ne dépasse pas le plafond.
  const maxCredits = Math.floor((limits.max * 100) / cents);
  return { minCredits, maxCredits };
}

export interface LossGuardInput {
  displayedPrice: number;
  /** Montant réellement envoyé au fournisseur (prix moins les frais absorbés). */
  sentAmount: number;
  credits: number;
  circuitLossPercent: number;
  /** Coût fournisseur d'un crédit en FCFA. */
  fcfaPerCredit: number;
}

/**
 * Garde « jamais à perte » : après les frais d'encaissement absorbés et la perte du circuit, l'argent
 * restant doit couvrir le coût fournisseur des crédits vendus. Réservé aux devises à parité avec le FCFA
 * (XAF, XOF) : pour une autre devise, aucun taux de change n'est connu, on ne devine pas.
 */
export function isSoldAtLoss(input: LossGuardInput): boolean {
  const m = computePackMargin({
    displayedPrice: input.displayedPrice,
    sentAmount: input.sentAmount,
    credits: input.credits,
    bonusCredits: 0,
    circuitLossPercent: input.circuitLossPercent,
    fcfaPerCredit: input.fcfaPerCredit,
  });
  return m.withoutBonus.marginFcfa < 0;
}
