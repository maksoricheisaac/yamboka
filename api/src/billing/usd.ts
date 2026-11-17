import { ceilDiv, toScaled } from './decimal';

/**
 * Arithmétique du solde prépayé du fournisseur de génération et du taux de change SORTANT (`r_out`).
 *
 * Deux échelles, toutes deux en entiers BigInt :
 *  - les dollars en MICRO-dollars (6 décimales, 1 $ = 1 000 000) ;
 *  - les taux FCFA/$ à 4 décimales (`620` → `6_200_000n`).
 *
 * Deux sources de frais à ne JAMAIS mélanger : les frais ENTRANTS (encaissement SasPay) sont traités par
 * `fees.ts` seul ; les frais SORTANTS (retrait SasPay → MoMo → carte → dollars) sont captés par `r_out` seul.
 *
 * Tout arrondi se fait du côté sûr pour la plateforme : un coût ou un taux de tarification est arrondi
 * AU-DESSUS, de sorte qu'aucun calcul de prix ne puisse passer sous le coût réel.
 */

export const MICRO_USD_DECIMALS = 6;
export const MICRO_PER_USD = 10n ** BigInt(MICRO_USD_DECIMALS);
export const RATE_DECIMALS = 4;
export const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);
const PERCENT_SCALE = 100n * RATE_SCALE;

/** « 0.23 », 0.23 → micro-dollars (230000n). Refuse une valeur plus précise que le micro-dollar. */
export function toMicroUsd(usd: string | number): bigint {
  return toScaled(usd, MICRO_USD_DECIMALS);
}

/** Taux FCFA/$ « 620 » ou 681.3187 → entier à 4 décimales. */
export function toRate(fcfaPerUsd: string | number): bigint {
  return toScaled(fcfaPerUsd, RATE_DECIMALS);
}

/** Micro-dollars → texte décimal, pour l'affichage et les API (jamais de flottant intermédiaire). */
export function formatMicroUsd(micro: bigint, decimals = 2): string {
  if (decimals < 0 || decimals > MICRO_USD_DECIMALS) {
    throw new RangeError('Nombre de décimales invalide.');
  }
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = abs / MICRO_PER_USD;
  const frac = (abs % MICRO_PER_USD)
    .toString()
    .padStart(MICRO_USD_DECIMALS, '0')
    .slice(0, decimals);
  const text = decimals > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${text}` : text;
}

/** Taux à 4 décimales → texte décimal (pour Prisma Decimal et l'affichage). */
export function formatRate(scaled: bigint): string {
  const whole = scaled / RATE_SCALE;
  const frac = (scaled % RATE_SCALE).toString().padStart(RATE_DECIMALS, '0');
  return `${whole}.${frac}`;
}

/**
 * `r_out` d'une recharge : FCFA NETS sortis du portefeuille SasPay ÷ dollars RÉELLEMENT arrivés chez le
 * fournisseur. Arrondi au-dessus : mieux vaut croire la recharge un peu plus chère qu'elle ne l'a été.
 */
export function measureROut(netWithdrawnXaf: number, microUsd: bigint): bigint {
  if (!Number.isInteger(netWithdrawnXaf) || netWithdrawnXaf <= 0) {
    throw new RangeError('FCFA nets retirés invalides.');
  }
  if (microUsd <= 0n) {
    throw new RangeError('Dollars reçus invalides.');
  }
  // (xaf / (micro/1e6)) × 1e4 = xaf × 1e6 × 1e4 / micro
  return ceilDiv(
    BigInt(netWithdrawnXaf) * MICRO_PER_USD * RATE_SCALE,
    microUsd,
  );
}

export interface TopUpLot {
  /** Dollars arrivés chez le fournisseur lors de cette recharge, en micro-dollars. */
  microUsd: bigint;
  /** `r_out` mesuré de cette recharge, à 4 décimales. */
  rOut: bigint;
}

/**
 * Ce qui RESTE de chaque recharge après `consumedMicroUsd` dépensés, consommés de la plus ancienne à la plus
 * récente (FIFO, comme les lots de crédits). Les recharges doivent être passées du plus ancien au plus récent.
 */
export function remainingPerTopUp(
  lots: readonly TopUpLot[],
  consumedMicroUsd: bigint,
): bigint[] {
  let left = consumedMicroUsd > 0n ? consumedMicroUsd : 0n;
  return lots.map((lot) => {
    const taken = left >= lot.microUsd ? lot.microUsd : left;
    left -= taken;
    return lot.microUsd - taken;
  });
}

/**
 * `r_out` moyen pondéré du solde encore disponible : chaque recharge pèse les dollars qu'il en reste.
 * Arrondi au-dessus. null quand il ne reste rien de mesuré (solde épuisé ou aucune recharge mesurée).
 */
export function weightedROutOfBalance(
  lots: readonly TopUpLot[],
  consumedMicroUsd: bigint,
): bigint | null {
  const remaining = remainingPerTopUp(lots, consumedMicroUsd);
  let weight = 0n;
  let total = 0n;
  for (const [i, left] of remaining.entries()) {
    if (left <= 0n) continue;
    weight += left;
    total += left * lots[i].rOut;
  }
  return weight === 0n ? null : ceilDiv(total, weight);
}

export interface PricingRateInput {
  /** `r_out` de la dernière recharge mesurée (4 décimales), ou null. */
  lastROut: bigint | null;
  /** `r_out` moyen pondéré du solde (4 décimales), ou null. */
  weightedROut: bigint | null;
  /**
   * Taux de repli quand AUCUNE recharge n'a été mesurée : construit à partir des réglages provisoires
   * (taux carte et perte de circuit). L'administration l'affiche « non mesuré ».
   */
  fallbackROut: bigint;
  /** Marge de sécurité sur le change, en pourcentage « humain » (2.5 = 2,5 %). */
  fxBufferPercent: string | number;
}

export interface PricingRate {
  /** Taux retenu pour tarifer, à 4 décimales. */
  rate: bigint;
  /** false = construit sur des valeurs provisoires, à afficher comme « non mesuré ». */
  measured: boolean;
}

/**
 * Taux de tarification : le PLUS DÉFAVORABLE entre la dernière recharge et la moyenne pondérée du solde,
 * majoré de la marge de change. Prendre le maximum évite de tarifer sur une recharge exceptionnellement
 * favorable ; la majoration couvre la dérive entre deux recharges.
 */
export function rPricing(p: PricingRateInput): PricingRate {
  const buffer = toScaled(p.fxBufferPercent, RATE_DECIMALS);
  if (buffer < 0n) throw new RangeError('Marge de change négative.');
  const measured = p.lastROut !== null || p.weightedROut !== null;
  const base = measured
    ? bigMax(p.lastROut ?? 0n, p.weightedROut ?? 0n)
    : p.fallbackROut;
  if (base <= 0n) throw new RangeError('Taux de tarification invalide.');
  // base × (1 + buffer/100), arrondi au-dessus.
  return {
    rate: ceilDiv(base * (PERCENT_SCALE + buffer), PERCENT_SCALE),
    measured,
  };
}

/**
 * Taux de repli provisoire tant qu'aucune recharge n'est mesurée : le taux de la carte, alourdi de la perte
 * estimée du circuit de retrait. `r_out` mesuré le REMPLACE ensuite, il ne s'y ajoute jamais.
 *
 *   repli = taux carte ÷ (1 − perte du circuit)
 */
export function provisionalROut(
  cardFcfaPerUsd: string | number,
  circuitLossPercent: string | number,
): bigint {
  const rate = toRate(cardFcfaPerUsd);
  const loss = toScaled(circuitLossPercent, RATE_DECIMALS);
  if (rate <= 0n) throw new RangeError('Taux carte invalide.');
  if (loss < 0n || loss >= PERCENT_SCALE) {
    throw new RangeError('Perte de circuit invalide (0 ≤ perte < 100 %).');
  }
  return ceilDiv(rate * PERCENT_SCALE, PERCENT_SCALE - loss);
}

/** Coût en FCFA de dollars donnés, au taux donné, arrondi AU-DESSUS (côté sûr pour la plateforme). */
export function microUsdToFcfa(microUsd: bigint, rate: bigint): number {
  if (microUsd < 0n) throw new RangeError('Montant négatif.');
  if (rate <= 0n) throw new RangeError('Taux invalide.');
  return Number(ceilDiv(microUsd * rate, MICRO_PER_USD * RATE_SCALE));
}

/**
 * Valeur FCFA qu'une génération doit rapporter NET : coût fournisseur valorisé au taux de tarification, puis
 * majoré de la marge commerciale. Arrondi AU-DESSUS, donc jamais sous le coût réel.
 *
 *   net attendu = coût $ × r_pricing × (1 + marge)
 */
export function netNeededFcfa(
  microUsd: bigint,
  rate: bigint,
  marginPercent: string | number,
): number {
  if (microUsd <= 0n) throw new RangeError('Coût invalide.');
  if (rate <= 0n) throw new RangeError('Taux invalide.');
  const margin = toScaled(marginPercent, RATE_DECIMALS);
  if (margin < 0n) throw new RangeError('Marge négative.');
  return Number(
    ceilDiv(
      microUsd * rate * (PERCENT_SCALE + margin),
      MICRO_PER_USD * RATE_SCALE * PERCENT_SCALE,
    ),
  );
}

function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
