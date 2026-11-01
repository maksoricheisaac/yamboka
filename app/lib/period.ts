/**
 * Périodes du tableau de bord. Les jours sont des jours calendaires de Brazzaville (UTC+1, sans heure d'été),
 * quel que soit le fuseau du navigateur : l'API utilise la même référence pour ses bornes et ses séries.
 */
const OFFSET_MS = 3600_000;
const DAY_MS = 24 * OFFSET_MS;

export type PeriodKey = "today" | "7d" | "30d" | "month" | "prev-month" | "custom";

export const PERIOD_LABELS: Record<Exclude<PeriodKey, "custom">, string> = {
  today: "Aujourd’hui",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  month: "Ce mois-ci",
  "prev-month": "Mois précédent",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Date calendaire (AAAA-MM-JJ) de Brazzaville pour un instant donné. */
export function brazzavilleDay(at: Date = new Date()): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

function shift(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Bornes (incluses) d'une période prédéfinie. */
export function presetRange(key: Exclude<PeriodKey, "custom">, at: Date = new Date()): { from: string; to: string } {
  const today = brazzavilleDay(at);
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: shift(today, -6), to: today };
    case "30d":
      return { from: shift(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "prev-month": {
      const firstOfMonth = `${today.slice(0, 8)}01`;
      const lastPrev = shift(firstOfMonth, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
  }
}

/** Retrouve la période prédéfinie correspondant à des bornes, ou « custom ». */
export function detectPreset(from: string, to: string, at: Date = new Date()): PeriodKey {
  for (const key of Object.keys(PERIOD_LABELS) as Exclude<PeriodKey, "custom">[]) {
    const r = presetRange(key, at);
    if (r.from === from && r.to === to) return key;
  }
  return "custom";
}

export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
