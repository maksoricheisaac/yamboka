import { ceilDiv, toScaled } from './decimal';

/**
 * Frais d'encaissement SasPay et montant à envoyer pour que le client paie exactement le prix affiché.
 * Fonctions pures. Format des paliers = celui de GET /pricing/my-rates/ (`tiers`), en pourcentage « humain » :
 * percent 2.5 = 2,5 %.
 *
 *   frais(A) = min(cap, max(floor, A × percent + fixed))   — arrondi à l'entier supérieur
 *   montant envoyé = le plus grand A entier tel que A + frais(A) ≤ prix affiché
 *
 * Hypothèses à confirmer en bac à sable (la doc ne les précise pas) : bornes de palier inclusives, frais arrondis
 * par excès (le client ne paie jamais plus que le prix affiché).
 */

export interface FeeTier {
  minAmount: string | number;
  /** null = sans plafond de palier. */
  maxAmount: string | number | null;
  /** Pourcentage humain : 5.7 = 5,7 %. */
  percent: string | number;
  fixed?: string | number | null;
  floorAmount?: string | number | null;
  capAmount?: string | number | null;
  /** SasPay ajoute ses frais (ADD_ON) ou les déduit (DEDUCTED). Seul ADD_ON est pris en charge. */
  feeChargeMode?: 'ADD_ON' | 'DEDUCTED';
}

export class FeeComputationError extends Error {
  constructor(
    readonly code:
      'NO_TIER' | 'AMOUNT_TOO_LOW' | 'UNSUPPORTED_FEE_MODE' | 'INVALID_PRICE',
    message: string,
  ) {
    super(message);
  }
}

// Échelles : pourcentage à 4 décimales, montants à 2 décimales (SasPay : "50.00").
const PERCENT_DECIMALS = 4;
const MONEY_DECIMALS = 2;
/** Un pourcentage à 4 décimales appliqué à un entier : ×10^4 pour l'échelle, ×100 pour « % » → 10^6 ; les montants fixes (10^2) sont ramenés à la même échelle. */
const FEE_SCALE = 10n ** 6n;
const MONEY_TO_FEE_SCALE = 10n ** 4n;

interface ParsedTier {
  min: bigint;
  max: bigint | null;
  percent: bigint;
  fixed: bigint;
  floor: bigint | null;
  cap: bigint | null;
}

function parseMoneyToInt(v: string | number): bigint {
  // Bornes de palier : montants entiers en FCFA ; une borne décimale est arrondie à l'entier utile.
  const scaled = toScaled(v, MONEY_DECIMALS);
  return scaled / 100n;
}

function parseTier(tier: FeeTier): ParsedTier {
  const mode = tier.feeChargeMode ?? 'ADD_ON';
  if (mode !== 'ADD_ON') {
    throw new FeeComputationError(
      'UNSUPPORTED_FEE_MODE',
      `Mode de frais non pris en charge : ${mode}`,
    );
  }
  const opt = (v?: string | number | null) =>
    v === undefined || v === null ? null : toScaled(v, MONEY_DECIMALS);
  return {
    min: parseMoneyToInt(tier.minAmount),
    max: tier.maxAmount === null ? null : parseMoneyToInt(tier.maxAmount),
    percent: toScaled(tier.percent, PERCENT_DECIMALS),
    fixed: opt(tier.fixed) ?? 0n,
    floor: opt(tier.floorAmount),
    cap: opt(tier.capAmount),
  };
}

function feeOf(amount: bigint, t: ParsedTier): bigint {
  // Tout est ramené à l'échelle 10^6 (millionièmes de FCFA).
  let fee = amount * t.percent + t.fixed * MONEY_TO_FEE_SCALE;
  if (t.floor !== null && fee < t.floor * MONEY_TO_FEE_SCALE)
    fee = t.floor * MONEY_TO_FEE_SCALE;
  if (t.cap !== null && fee > t.cap * MONEY_TO_FEE_SCALE)
    fee = t.cap * MONEY_TO_FEE_SCALE;
  return ceilDiv(fee, FEE_SCALE);
}

/** Frais d'encaissement (entier) pour un montant envoyé, selon le palier qui le couvre. */
export function computeFee(amount: number, tiers: FeeTier[]): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new FeeComputationError('INVALID_PRICE', 'Montant invalide.');
  }
  const a = BigInt(amount);
  for (const raw of tiers) {
    const t = parseTier(raw);
    if (a >= t.min && (t.max === null || a <= t.max))
      return Number(feeOf(a, t));
  }
  throw new FeeComputationError(
    'NO_TIER',
    `Aucun palier de frais ne couvre le montant ${amount}.`,
  );
}

export interface SendAmount {
  /** À envoyer au fournisseur. */
  sentAmount: number;
  /** Frais ajoutés par le fournisseur, payés par le client. */
  fee: number;
  /** Ce que le client paiera : sentAmount + fee, toujours ≤ prix affiché. */
  total: number;
  /** Ce que Yamboka absorbe par rapport au prix affiché (prix − sentAmount). */
  absorbed: number;
}

/**
 * Plus grand A entier tel que A + frais(A) ≤ prix affiché. Dans un palier, A + frais(A) est strictement
 * croissant (les frais ne diminuent jamais quand A augmente), donc une dichotomie donne la valeur exacte ;
 * entre deux paliers les frais peuvent chuter : on retient le meilleur résultat de tous les paliers.
 */
export function computeSendAmount(
  displayedPrice: number,
  tiers: FeeTier[],
): SendAmount {
  if (!Number.isInteger(displayedPrice) || displayedPrice <= 0) {
    throw new FeeComputationError('INVALID_PRICE', 'Prix affiché invalide.');
  }
  if (tiers.length === 0) {
    throw new FeeComputationError('NO_TIER', 'Aucun palier de frais fourni.');
  }
  const price = BigInt(displayedPrice);
  let best: { a: bigint; fee: bigint } | null = null;

  for (const raw of tiers) {
    const t = parseTier(raw);
    let lo = t.min < 1n ? 1n : t.min;
    let hi = t.max === null || t.max > price ? price : t.max;
    if (lo > hi) continue;
    if (lo + feeOf(lo, t) > price) continue; // même le plus petit montant du palier est trop cher
    while (lo < hi) {
      const mid = (lo + hi + 1n) / 2n;
      if (mid + feeOf(mid, t) <= price) lo = mid;
      else hi = mid - 1n;
    }
    if (best === null || lo > best.a) best = { a: lo, fee: feeOf(lo, t) };
  }

  if (best === null) {
    throw new FeeComputationError(
      'AMOUNT_TOO_LOW',
      `Le prix ${displayedPrice} ne couvre pas les frais minimaux.`,
    );
  }
  const sentAmount = Number(best.a);
  const fee = Number(best.fee);
  return {
    sentAmount,
    fee,
    total: sentAmount + fee,
    absorbed: displayedPrice - sentAmount,
  };
}
