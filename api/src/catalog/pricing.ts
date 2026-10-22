import { BadRequestException } from '@nestjs/common';

/**
 * Calculs de prix et de marge. Fonctions pures : le coût d'une génération est TOUJOURS calculé côté
 * serveur à partir du produit en base, jamais d'une valeur envoyée par le navigateur.
 */

export interface ProductPricing {
  code: string;
  billingUnit: 'SECOND' | 'IMAGE';
  creditsPerUnit: number;
  providerCostUsdPerUnit: number;
  /** Genjutsu Light facture sortie + entrée : multiplicateur 2 sur le COÛT fournisseur (pas sur les crédits). */
  billableMultiplier: number;
  minSeconds: number | null;
  maxSeconds: number | null;
  active: boolean;
}

export interface Quote {
  credits: number;
  /** Durée facturée, arrondie à la seconde supérieure (vidéo uniquement). */
  billableSeconds: number | null;
}

/** Tolérance sur la durée mesurée (ffprobe renvoie parfois 10.0000001 pour une vidéo de 10 s). */
const DURATION_EPSILON = 0.001;

export function quoteCredits(
  product: ProductPricing,
  durationSeconds?: number,
): Quote {
  if (!product.active) {
    throw new BadRequestException({
      code: 'PRODUCT_UNAVAILABLE',
      message: 'Ce type de création n’est pas disponible pour le moment.',
    });
  }

  if (product.billingUnit === 'IMAGE') {
    return { credits: product.creditsPerUnit, billableSeconds: null };
  }

  if (durationSeconds === undefined || !Number.isFinite(durationSeconds)) {
    throw new BadRequestException({
      code: 'DURATION_REQUIRED',
      message: 'La durée de la vidéo est requise.',
    });
  }
  if (
    product.minSeconds !== null &&
    durationSeconds + DURATION_EPSILON < product.minSeconds
  ) {
    throw new BadRequestException({
      code: 'DURATION_TOO_SHORT',
      message: `La vidéo doit durer au moins ${product.minSeconds} secondes.`,
    });
  }
  if (
    product.maxSeconds !== null &&
    durationSeconds - DURATION_EPSILON > product.maxSeconds
  ) {
    throw new BadRequestException({
      code: 'DURATION_TOO_LONG',
      message: `La vidéo ne doit pas dépasser ${product.maxSeconds} secondes.`,
    });
  }

  const billableSeconds = Math.ceil(durationSeconds - DURATION_EPSILON);
  return { credits: billableSeconds * product.creditsPerUnit, billableSeconds };
}

export interface MarginSettings {
  usdToXafRate: number;
  fxFeePercent: number;
  openpayCommissionPercent: number;
  regenOverheadPercent: number;
  minMarginPercent: number;
}

export interface PackPricing {
  price: number;
  baseCredits: number;
  bonusPercent: number;
}

export interface Margin {
  revenueFcfa: number;
  providerCostFcfa: number;
  commissionFcfa: number;
  marginFcfa: number;
  marginPercent: number;
  belowThreshold: boolean;
}

export function packTotalCredits(pack: PackPricing): number {
  return Math.floor((pack.baseCredits * (100 + pack.bonusPercent)) / 100);
}

/**
 * Marge brute d'un produit pour un pack donné (AD-32) :
 *   (crédits × valeur perçue du crédit − coût fournisseur × taux × (1 + frais) × (1 + surcoût) − commission) / revenu
 * La valeur perçue d'un crédit dépend du pack : prix payé ÷ crédits obtenus, bonus compris.
 * `units` : nombre d'unités facturées (secondes de vidéo, ou 1 image).
 */
export function computeMargin(
  product: ProductPricing,
  pack: PackPricing,
  units: number,
  s: MarginSettings,
): Margin {
  const perceivedCreditValue = pack.price / packTotalCredits(pack);
  const credits = units * product.creditsPerUnit;
  const revenueFcfa = credits * perceivedCreditValue;

  const providerCostUsd =
    product.providerCostUsdPerUnit * units * product.billableMultiplier;
  const providerCostFcfa =
    providerCostUsd *
    s.usdToXafRate *
    (1 + s.fxFeePercent / 100) *
    (1 + s.regenOverheadPercent / 100);
  const commissionFcfa = (revenueFcfa * s.openpayCommissionPercent) / 100;
  const marginFcfa = revenueFcfa - providerCostFcfa - commissionFcfa;
  const marginPercent = revenueFcfa > 0 ? (marginFcfa / revenueFcfa) * 100 : 0;

  return {
    revenueFcfa,
    providerCostFcfa,
    commissionFcfa,
    marginFcfa,
    marginPercent,
    belowThreshold: marginPercent < s.minMarginPercent,
  };
}
