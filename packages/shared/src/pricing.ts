/**
 * Tarification des vidéos : UNE seule fonction de calcul, partagée par l'affichage (client) et le débit réel (serveur).
 * Le serveur ne fait jamais confiance au coût envoyé par le client : il relit les tarifs en base et rappelle ce calcul.
 * Coût d'une vidéo = durée (secondes entières) × tarif de la résolution (crédits par seconde).
 */

export const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

/** Bornes de durée du modèle (Wan 3.0 image → vidéo : 2 à 30 s) et valeur par défaut. */
export const VIDEO_DURATION = { min: 2, max: 30, default: 5 } as const;
export const DEFAULT_RESOLUTION: VideoResolution = '480p';
/** Durée de référence des équivalences affichées (« ≈ 25 vidéos de 5 s »). */
export const REFERENCE_VIDEO_SECONDS = 5;

/** Libellés simples des résolutions, sans jargon. */
export const RESOLUTION_LABELS: Record<VideoResolution, string> = {
  '480p': 'Standard',
  '720p': 'HD',
  '1080p': 'Full HD',
};

/** Tarifs en crédits par seconde, pour chaque résolution (lus en base, modifiables dans l'administration). */
export type CreditRates = Record<VideoResolution, number>;

export function isValidDuration(seconds: number): boolean {
  return (
    Number.isInteger(seconds) &&
    seconds >= VIDEO_DURATION.min &&
    seconds <= VIDEO_DURATION.max
  );
}

/** Coût d'une vidéo, en crédits. Lève une erreur si la durée est hors bornes (le serveur l'a déjà refusée). */
export function videoCostCredits(
  rates: CreditRates,
  resolution: VideoResolution,
  seconds: number,
): number {
  if (!isValidDuration(seconds)) throw new RangeError('Durée invalide.');
  return seconds * rates[resolution];
}

export interface ConfirmGuard {
  /** Au-delà de ce coût (crédits), une confirmation est demandée. */
  credits: number;
  /** Au-delà de cette part du solde (%), une confirmation est demandée. */
  balancePercent: number;
}

/** Garde-fou : coût élevé en valeur absolue OU en part du solde. */
export function needsConfirmation(
  cost: number,
  balance: number,
  guard: ConfirmGuard,
): boolean {
  return cost > guard.credits || cost * 100 > balance * guard.balancePercent;
}

/** Secondes et nombre de vidéos de référence que permet un nombre de crédits, pour chaque résolution. */
export function packEquivalents(
  credits: number,
  rates: CreditRates,
  videoSeconds: number = REFERENCE_VIDEO_SECONDS,
): Record<VideoResolution, { seconds: number; videos: number }> {
  const out = {} as Record<VideoResolution, { seconds: number; videos: number }>;
  for (const r of VIDEO_RESOLUTIONS) {
    const seconds = rates[r] > 0 ? Math.floor(credits / rates[r]) : 0;
    out[r] = { seconds, videos: Math.floor(seconds / videoSeconds) };
  }
  return out;
}
