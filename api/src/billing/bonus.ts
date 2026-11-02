export interface BonusSettings {
  enabled: boolean;
  /** Pourcentage par défaut, utilisé quand le pack n'en définit pas. */
  defaultPercent: number;
}

/** Pourcentage de bonus applicable à un pack : le sien s'il existe (0 = aucun bonus), sinon le défaut global. */
export function firstPurchaseBonusPercent(
  packPercent: number | null,
  settings: BonusSettings,
): number {
  if (!settings.enabled) return 0;
  const percent = packPercent ?? settings.defaultPercent;
  if (!Number.isFinite(percent)) return 0;
  return Math.min(Math.max(Math.trunc(percent), 0), 100);
}

/** Crédits de bonus (lot distinct du pack), arrondis à l'inférieur. */
export function firstPurchaseBonusCredits(
  baseCredits: number,
  percent: number,
): number {
  return Math.floor((baseCredits * percent) / 100);
}
