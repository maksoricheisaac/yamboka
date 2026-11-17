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

/** Au-delà de ce nombre d'essais, on renonce : aucun montant raisonnable n'est rentable. */
const MIN_AMOUNT_SEARCH_STEPS = 5000;

export interface MinProfitableInput {
  /** Prix d'un crédit dans la devise (ex. 10 F). */
  unitPrice: number;
  /** Coût fournisseur d'un crédit, en FCFA. */
  fcfaPerCredit: number;
  circuitLossPercent: number;
  /** Net reçu pour un prix affiché donné : vient de `fees.ts` (frais pourcentage ET frais fixes). */
  netFor: (displayedPrice: number) => number;
  /** Plancher imposé par ailleurs (minimum du pays, minimum de la configuration). */
  hardFloor: number;
  /** Plafond de recherche : au-delà, on considère qu'aucun montant n'est rentable. */
  ceiling: number;
}

/**
 * Montant minimum d'un achat à la quantité qui laisse une marge nette POSITIVE, frais fixes compris.
 *
 * Pourquoi ce n'est pas qu'un seuil écrit à la main : un frais fixe pèse d'autant plus que le montant est
 * petit, donc le seuil dépend du palier d'encaissement réellement appliqué. On part d'une estimation
 * fermée, puis on vérifie montant par montant avec la MÊME fonction que le refus à l'achat
 * (`isSoldAtLoss`) : le client ne voit donc jamais un minimum qui serait ensuite refusé.
 *
 * Renvoie null si aucun montant sous le plafond n'est rentable (il faut alors revoir les prix, pas le seuil).
 */
export function minProfitableAmount(input: MinProfitableInput): number | null {
  const { unitPrice, fcfaPerCredit, netFor, hardFloor, ceiling } = input;
  if (!(unitPrice > 0)) throw new RangeError('Prix du crédit invalide.');

  const profitable = (amount: number): boolean => {
    const credits = Math.floor((amount * 100) / Math.round(unitPrice * 100));
    if (credits <= 0) return false;
    return !isSoldAtLoss({
      displayedPrice: amount,
      sentAmount: netFor(amount),
      credits,
      circuitLossPercent: input.circuitLossPercent,
      fcfaPerCredit,
    });
  };

  // Estimation fermée : part fixe des frais ÷ marge unitaire restante. Elle évite de balayer depuis 1 F.
  const sample = Math.max(hardFloor, 1000);
  const feeAtSample = sample - netFor(sample);
  const percentPart = feeAtSample / sample;
  const marginPerFranc = 1 - percentPart - fcfaPerCredit / unitPrice;
  let start = hardFloor;
  if (marginPerFranc > 0) {
    const fixedPart = Math.max(0, feeAtSample - percentPart * sample);
    start = Math.max(hardFloor, Math.ceil(fixedPart / marginPerFranc));
  }

  for (let i = 0; i < MIN_AMOUNT_SEARCH_STEPS; i += 1) {
    const amount = start + i;
    if (amount > ceiling) return null;
    if (profitable(amount)) return amount;
  }
  return null;
}
