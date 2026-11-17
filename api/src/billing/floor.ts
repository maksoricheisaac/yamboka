import { ceilDiv, toScaled } from './decimal';
import { computeSendAmount, type FeeTier } from './fees';

/**
 * Valeur PLANCHER d'un crédit : combien de FCFA un crédit a rapporté NET, dans le cas le plus défavorable
 * parmi tout ce qui est en vente. C'est elle qui transforme un coût en FCFA en un nombre de crédits à
 * facturer, et c'est elle qui garantit qu'une vidéo ne se vend jamais sous son coût.
 *
 *   plancher(pack, moyen de paiement) = net réellement reçu ÷ crédits reçus par le client (bonus compris)
 *   plancher                          = le plus petit de tous
 *   crédits à facturer                = ⌈ net attendu en FCFA ÷ plancher ⌉
 *
 * Le net reçu vient de `fees.ts` : le prix affiché moins les frais d'encaissement (qui portent sur le montant
 * débité). Les crédits reçus comprennent le bonus de premier achat, sinon un client qui achète son premier
 * pack paierait chaque crédit moins cher que ce que la tarification suppose.
 *
 * Deux façons de compter le bonus, réglées par `bonusValuationPercent` :
 *   100 % (au lancement, prudent) : le bonus compte sur CHAQUE crédit, comme si tous les achats en profitaient ;
 *   moins (plus tard, mesuré)     : la part réellement observée sur les ventes, le bonus n'étant accordé
 *                                   qu'une fois par compte.
 *
 * Arrondis : le plancher est arrondi vers le BAS et les crédits facturés vers le HAUT. Les deux vont dans le
 * même sens, celui de la plateforme.
 */

/** Échelle du plancher : 4 décimales de FCFA par crédit. */
export const FLOOR_DECIMALS = 4;
const FLOOR_SCALE = 10n ** BigInt(FLOOR_DECIMALS);
const PERCENT_SCALE = 100n;

export interface FloorPack {
  /** Nom affiché, pour expliquer d'où vient le plancher. */
  name: string;
  /** Prix affiché, en FCFA entiers. */
  price: number;
  /** Crédits de base, hors bonus. */
  credits: number;
  /** Bonus de premier achat applicable à ce pack, en crédits (0 si aucun). */
  bonusCredits: number;
}

export interface FloorMethod {
  /** Libellé du moyen de paiement (pays + réseau), pour expliquer d'où vient le plancher. */
  label: string;
  /** Tarif d'encaissement applicable. Vide = aucun frais (fournisseur simulé). */
  tiers: FeeTier[];
}

export interface FloorCandidate {
  packName: string;
  methodLabel: string;
  /** Net réellement reçu pour ce pack avec ce moyen de paiement. */
  netFcfa: number;
  /** Crédits portés au compte du client (bonus valorisé compris). */
  credits: number;
  /** FCFA nets par crédit, à 4 décimales. */
  floorScaled: bigint;
}

export interface CreditFloor {
  /** Le plus petit plancher trouvé, à 4 décimales. */
  floorScaled: bigint;
  /** Combinaison qui le produit : c'est elle qui contraint toute la tarification. */
  worst: FloorCandidate;
  /** Toutes les combinaisons évaluées, pour l'affichage dans le simulateur. */
  candidates: FloorCandidate[];
}

/** Crédits à compter pour un pack, bonus valorisé selon le réglage. */
export function valuedCredits(
  pack: FloorPack,
  bonusValuationPercent: string | number,
): number {
  const share = toScaled(bonusValuationPercent, 0);
  if (share < 0n || share > PERCENT_SCALE) {
    throw new RangeError('Part du bonus à valoriser hors de 0–100 %.');
  }
  // Arrondi au SUPÉRIEUR : compter plus de crédits abaisse le plancher, donc protège la plateforme.
  const bonus = Number(
    ceilDiv(BigInt(pack.bonusCredits) * share, PERCENT_SCALE),
  );
  return pack.credits + bonus;
}

/**
 * Plancher de valeur du crédit sur l'ensemble des packs en vente et des moyens de paiement ouverts.
 * Lève si aucune combinaison n'est exploitable (aucun pack, ou prix ne couvrant pas les frais).
 */
export function creditFloorValue(
  packs: readonly FloorPack[],
  methods: readonly FloorMethod[],
  bonusValuationPercent: string | number,
): CreditFloor {
  if (packs.length === 0) {
    throw new RangeError('Aucun pack en vente : plancher incalculable.');
  }
  if (methods.length === 0) {
    throw new RangeError(
      'Aucun moyen de paiement ouvert : plancher incalculable.',
    );
  }
  const candidates: FloorCandidate[] = [];
  for (const pack of packs) {
    const credits = valuedCredits(pack, bonusValuationPercent);
    if (credits <= 0) continue;
    for (const method of methods) {
      // Sans frais (fournisseur simulé), le net reçu est le prix affiché.
      const netFcfa =
        method.tiers.length === 0
          ? pack.price
          : computeSendAmount(pack.price, method.tiers).sentAmount;
      candidates.push({
        packName: pack.name,
        methodLabel: method.label,
        netFcfa,
        credits,
        // Arrondi vers le BAS : on ne surestime jamais ce qu'un crédit a rapporté.
        floorScaled: (BigInt(netFcfa) * FLOOR_SCALE) / BigInt(credits),
      });
    }
  }
  const usable = candidates.filter((c) => c.floorScaled > 0n);
  if (usable.length === 0) {
    throw new RangeError(
      'Aucune combinaison pack / moyen de paiement exploitable.',
    );
  }
  const worst = usable.reduce((a, b) =>
    b.floorScaled < a.floorScaled ? b : a,
  );
  return { floorScaled: worst.floorScaled, worst, candidates };
}

/** Plancher à 4 décimales → texte décimal, pour l'affichage et les API. */
export function formatFloor(floorScaled: bigint): string {
  const whole = floorScaled / FLOOR_SCALE;
  const frac = (floorScaled % FLOOR_SCALE)
    .toString()
    .padStart(FLOOR_DECIMALS, '0');
  return `${whole}.${frac}`;
}

/**
 * Crédits à facturer pour un net attendu en FCFA, au plancher donné. Arrondi AU-DESSUS, et jamais moins
 * d'un crédit : une création gratuite n'existe pas.
 */
export function creditsToCharge(
  netNeededFcfa: number,
  floorScaled: bigint,
): number {
  if (!Number.isInteger(netNeededFcfa) || netNeededFcfa <= 0) {
    throw new RangeError('Net attendu invalide.');
  }
  if (floorScaled <= 0n) {
    throw new RangeError('Plancher de valeur du crédit invalide.');
  }
  const credits = Number(
    ceilDiv(BigInt(netNeededFcfa) * FLOOR_SCALE, floorScaled),
  );
  return Math.max(1, credits);
}
