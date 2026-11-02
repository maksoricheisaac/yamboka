/**
 * Marge d'un pack. Yamboka absorbe les frais d'encaissement (on envoie un montant réduit) et supporte la perte
 * du circuit de retrait et de change (SasPay → MTN → carte → dollars), estimée par `circuitLossPercent`.
 *
 *   reçu         = montant envoyé à SasPay (le prix affiché moins les frais absorbés)
 *   net          = reçu × (1 − perte du circuit)
 *   coût         = crédits × coût fournisseur d'un crédit
 *   marge        = net − coût
 *
 * Deux scénarios : sans bonus (cas normal) et avec le bonus de premier achat entièrement consommé (pire cas,
 * valable une seule fois par compte). Le seuil de publication s'applique au scénario sans bonus.
 */

export interface PackMarginInput {
  displayedPrice: number;
  sentAmount: number;
  credits: number;
  /** Bonus de premier achat de ce pack, en crédits (0 si aucun). */
  bonusCredits: number;
  circuitLossPercent: number;
  /** Coût fournisseur d'un crédit en FCFA. */
  fcfaPerCredit: number;
}

export interface MarginScenario {
  hfCostFcfa: number;
  marginFcfa: number;
  /** Rapportée à l'argent réellement reçu (montant envoyé). */
  marginPercent: number;
}

export interface PackMargin {
  receivedFcfa: number;
  netAfterCircuitFcfa: number;
  withoutBonus: MarginScenario;
  withBonus: MarginScenario;
}

export function computePackMargin(p: PackMarginInput): PackMargin {
  const received = p.sentAmount;
  const net = received * (1 - p.circuitLossPercent / 100);
  const scenario = (credits: number): MarginScenario => {
    const hfCostFcfa = credits * p.fcfaPerCredit;
    const marginFcfa = net - hfCostFcfa;
    return {
      hfCostFcfa,
      marginFcfa,
      marginPercent: received > 0 ? (marginFcfa / received) * 100 : 0,
    };
  };
  return {
    receivedFcfa: received,
    netAfterCircuitFcfa: net,
    withoutBonus: scenario(p.credits),
    withBonus: scenario(p.credits + p.bonusCredits),
  };
}
