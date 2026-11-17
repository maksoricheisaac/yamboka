/**
 * Frais d'encaissement RÉELLEMENT constatés sur un paiement, comparés à ceux qu'on attendait.
 *
 * Pourquoi c'est nécessaire : la grille publique de l'encaisseur n'est qu'un plancher (« dès X % »), et le
 * palier réellement appliqué dépend du pays, du moyen de paiement et du montant. Seule la comparaison
 * paiement par paiement dit ce qu'on paie vraiment — et donc ce que `fees.ts` doit retenir.
 *
 * Convention de pourcentage, la même que `fees.ts` : les frais valent `A × p ÷ (1 − p)` où A est le net
 * envoyé, donc `p = frais ÷ prix affiché`. Les deux côtés se comparent ainsi sur la même base.
 */

/** Échelle des pourcentages observés : 4 décimales de point. */
const PERCENT_DECIMALS = 4;

/** Au-delà de cet écart (en POINTS de pourcentage), la grille retenue est fausse : il faut alerter. */
export const FEE_DEVIATION_ALERT_POINTS = 0.5;

export interface ObservedFeeInput {
  /** Prix affiché au client, en FCFA entiers. C'est lui que le client paie. */
  displayedAmount: number;
  /** Net attendu sur le compte de l'encaisseur (calculé par `fees.ts` au moment du paiement). */
  expectedNet: number | null;
  /** Frais réellement constatés par la vérification du fournisseur, ou null s'il ne les dit pas. */
  observedFee: number | null;
}

export interface ObservedFees {
  /** Net RÉELLEMENT reçu : prix affiché moins les frais observés. null si les frais sont inconnus. */
  netReceived: number | null;
  /** Frais observés en % du prix affiché, texte décimal, ou null. */
  observedFeePercent: string | null;
  /** Frais attendus en % du prix affiché, texte décimal, ou null. */
  expectedFeePercent: string | null;
  /** Écart en points (observé − attendu), ou null si l'un des deux manque. */
  deviationPoints: number | null;
  /** true = l'écart dépasse le seuil d'alerte vers le haut (on paie plus que prévu). */
  alert: boolean;
}

/** Pourcentage à 4 décimales, en texte. */
function percent(part: number, whole: number): string {
  if (whole <= 0) return (0).toFixed(PERCENT_DECIMALS);
  return ((part / whole) * 100).toFixed(PERCENT_DECIMALS);
}

/**
 * Net reçu, frais observés, frais attendus et écart. Ne devine rien : quand le fournisseur ne donne pas
 * ses frais, tout ce qui en dépend reste null plutôt que d'être estimé.
 */
export function observedFees(input: ObservedFeeInput): ObservedFees {
  const { displayedAmount, expectedNet, observedFee } = input;
  const expectedFee =
    expectedNet === null ? null : Math.max(0, displayedAmount - expectedNet);
  const expectedFeePercent =
    expectedFee === null ? null : percent(expectedFee, displayedAmount);

  if (observedFee === null) {
    return {
      // Sans frais observés, le net attendu est la meilleure information disponible, et elle est datée :
      // on l'enregistre comme net reçu, sans prétendre qu'il a été constaté.
      netReceived: expectedNet,
      observedFeePercent: null,
      expectedFeePercent,
      deviationPoints: null,
      alert: false,
    };
  }

  const netReceived = Math.max(0, displayedAmount - observedFee);
  const observedFeePercent = percent(observedFee, displayedAmount);
  const deviationPoints =
    expectedFeePercent === null
      ? null
      : Number(
          (Number(observedFeePercent) - Number(expectedFeePercent)).toFixed(
            PERCENT_DECIMALS,
          ),
        );

  return {
    netReceived,
    observedFeePercent,
    expectedFeePercent,
    deviationPoints,
    alert:
      deviationPoints !== null && deviationPoints > FEE_DEVIATION_ALERT_POINTS,
  };
}
