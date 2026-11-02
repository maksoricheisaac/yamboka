import { BadRequestException } from '@nestjs/common';
import { ceilDiv, toScaled } from './decimal';

/**
 * Tarification des générations en crédits. Règle : 1 crédit = `fcfaPerCredit` FCFA de coût fournisseur
 * (2,5 au lancement). Le prix fournisseur est en dollars par seconde ; le taux FCFA/$ et le coût du crédit sont
 * des réglages administrables. Les packs ne dépendent jamais du modèle : seule la consommation en dépend.
 *
 *   crédits par seconde = ⌈ prix $/s × taux FCFA/$ ÷ fcfaPerCredit ⌉
 */

export interface RateSettings {
  /** Taux FCFA pour 1 $ (réglage usdToXafRate). */
  fcfaPerUsd: number | string;
  /** Coût fournisseur d'un crédit en FCFA (réglage hfCostFcfaPerCredit). */
  fcfaPerCredit: number | string;
}

export interface ModelPrice {
  code: string;
  active: boolean;
  usdPerSecond: number | string;
  /** null = pas d'option audio natif pour ce modèle. */
  usdPerSecondWithAudio: number | string | null;
  minSeconds: number;
  maxSeconds: number;
}

const USD_DECIMALS = 5;
const RATE_DECIMALS = 4;

/** Crédits par seconde pour un prix donné, arrondi au supérieur, en arithmétique exacte. */
export function creditsPerSecond(
  usdPerSecond: number | string,
  rates: RateSettings,
): number {
  const usd = toScaled(usdPerSecond, USD_DECIMALS);
  const fx = toScaled(rates.fcfaPerUsd, RATE_DECIMALS);
  const unit = toScaled(rates.fcfaPerCredit, RATE_DECIMALS);
  if (usd <= 0n || fx <= 0n || unit <= 0n) {
    throw new RangeError('Prix, taux et coût du crédit doivent être positifs.');
  }
  // (usd/10^5 × fx/10^4) / (unit/10^4) = usd × fx / (unit × 10^5)
  return Number(ceilDiv(usd * fx, unit * 10n ** BigInt(USD_DECIMALS)));
}

/** Prix par seconde du modèle, avec ou sans audio natif. */
export function usdPerSecondFor(
  model: ModelPrice,
  audio: boolean,
): string | number {
  if (!audio) return model.usdPerSecond;
  if (model.usdPerSecondWithAudio === null) {
    throw new BadRequestException({
      code: 'AUDIO_UNAVAILABLE',
      message: 'Ce modèle ne propose pas l’audio natif.',
    });
  }
  return model.usdPerSecondWithAudio;
}

export interface VideoQuote {
  credits: number;
  creditsPerSecond: number;
  billableSeconds: number;
}

/** Tolérance sur la durée mesurée (ffprobe renvoie parfois 10.0000001 pour 10 s). */
const DURATION_EPSILON = 0.001;

/** Coût en crédits d'une vidéo : durée arrondie à la seconde supérieure × crédits par seconde. */
export function quoteVideoCredits(
  model: ModelPrice,
  durationSeconds: number,
  rates: RateSettings,
  opts: { audio?: boolean } = {},
): VideoQuote {
  if (!model.active) {
    throw new BadRequestException({
      code: 'PRODUCT_UNAVAILABLE',
      message: 'Ce modèle n’est pas disponible pour le moment.',
    });
  }
  if (!Number.isFinite(durationSeconds)) {
    throw new BadRequestException({
      code: 'DURATION_REQUIRED',
      message: 'La durée de la vidéo est requise.',
    });
  }
  if (durationSeconds + DURATION_EPSILON < model.minSeconds) {
    throw new BadRequestException({
      code: 'DURATION_TOO_SHORT',
      message: `La vidéo doit durer au moins ${model.minSeconds} secondes.`,
    });
  }
  if (durationSeconds - DURATION_EPSILON > model.maxSeconds) {
    throw new BadRequestException({
      code: 'DURATION_TOO_LONG',
      message: `La vidéo ne doit pas dépasser ${model.maxSeconds} secondes.`,
    });
  }
  const billableSeconds = Math.ceil(durationSeconds - DURATION_EPSILON);
  const perSecond = creditsPerSecond(
    usdPerSecondFor(model, opts.audio ?? false),
    rates,
  );
  return {
    credits: billableSeconds * perSecond,
    creditsPerSecond: perSecond,
    billableSeconds,
  };
}

/** « ≈ N vidéos » : nombre entier de vidéos que couvre un nombre de crédits (arrondi à l'inférieur). */
export function videoEquivalent(
  totalCredits: number,
  creditsPerVideo: number,
): number {
  if (creditsPerVideo <= 0) return 0;
  return Math.floor(totalCredits / creditsPerVideo);
}
