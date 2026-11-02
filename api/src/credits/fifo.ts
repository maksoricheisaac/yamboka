/**
 * Consommation FIFO des lots de crédits : on dépense d'abord le lot qui expire le plus tôt.
 * Fonction pure, sans base de données, donc testable seule. Un lot déjà échu n'est jamais dépensé.
 */

export interface SpendableLot {
  id: string;
  remaining: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface LotTake {
  lotId: string;
  amount: number;
}

export interface FifoResult {
  takes: LotTake[];
  /** Crédits qu'aucun lot ne peut fournir (0 si la demande est couverte). */
  shortfall: number;
}

export function sortByExpiry<T extends SpendableLot>(lots: T[]): T[] {
  return [...lots].sort(
    (a, b) =>
      a.expiresAt.getTime() - b.expiresAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/** Crédits réellement dépensables à `now` : lots non échus uniquement. */
export function spendableTotal(lots: SpendableLot[], now: Date): number {
  return lots
    .filter((l) => l.expiresAt.getTime() > now.getTime() && l.remaining > 0)
    .reduce((sum, l) => sum + l.remaining, 0);
}

export function allocateFifo(
  lots: SpendableLot[],
  amount: number,
  now: Date,
): FifoResult {
  const takes: LotTake[] = [];
  let left = amount;
  for (const lot of sortByExpiry(lots)) {
    if (left <= 0) break;
    if (lot.remaining <= 0 || lot.expiresAt.getTime() <= now.getTime())
      continue;
    const take = Math.min(lot.remaining, left);
    takes.push({ lotId: lot.id, amount: take });
    left -= take;
  }
  return { takes, shortfall: Math.max(0, left) };
}
