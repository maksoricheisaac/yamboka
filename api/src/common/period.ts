const DAY = 24 * 3600 * 1000;

/**
 * Bornes d'une période demandée en dates ISO : début à minuit UTC, fin EXCLUE (le jour « to » est inclus en entier).
 * Sans dates, la période couvre les `defaultDays` derniers jours.
 */
export function range(
  q: { from?: string; to?: string },
  defaultDays: number,
): { from: Date; end: Date } {
  const to = q.to ? new Date(`${q.to}T00:00:00Z`) : new Date();
  const end = q.to ? new Date(to.getTime() + DAY) : to;
  const from = q.from
    ? new Date(`${q.from}T00:00:00Z`)
    : new Date(end.getTime() - defaultDays * DAY);
  return { from, end };
}

/** Minuit UTC du jour courant. */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
