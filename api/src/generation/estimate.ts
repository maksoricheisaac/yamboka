/**
 * Lecture du prix annoncé par le fournisseur (POST /estimate/{modèle}).
 *
 * La forme de la réponse n'est PAS garantie par la documentation : on ne parie donc sur aucune structure.
 * On cherche, dans tout l'objet, le premier nombre porté par une clé qui désigne un prix en dollars, et on
 * refuse de conclure si on n'en trouve pas — mieux vaut « non lisible » qu'un prix inventé.
 */

/** Clés acceptées comme prix en dollars, de la plus explicite à la plus générale. */
const USD_KEYS = [
  'cost_usd',
  'price_usd',
  'amount_usd',
  'total_usd',
  'usd',
  'cost',
  'price',
  'amount',
  'total',
  'credits',
];

export interface ParsedEstimate {
  /** Prix total annoncé, en micro-dollars. */
  microUsd: bigint;
  /** Clé d'où vient le nombre, pour pouvoir expliquer la lecture. */
  readFrom: string;
}

/** Convertit un nombre de dollars en micro-dollars, arrondi AU-DESSUS (jamais sous le coût réel). */
function toMicro(usd: number): bigint {
  return BigInt(Math.ceil(usd * 1_000_000));
}

/**
 * Prix total lu dans une réponse /estimate, ou null si elle n'est pas lisible. Parcourt l'objet en largeur
 * et retient la clé la plus explicite trouvée.
 */
export function parseEstimateUsd(body: unknown): ParsedEstimate | null {
  const found = new Map<string, number>();
  const visit = (node: unknown, depth: number): void => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>,
    )) {
      const lower = key.toLowerCase();
      const num =
        typeof value === 'number'
          ? value
          : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
            ? Number(value)
            : null;
      if (num !== null && Number.isFinite(num) && num >= 0) {
        if (!found.has(lower)) found.set(lower, num);
      }
      visit(value, depth + 1);
    }
  };
  visit(body, 0);

  for (const key of USD_KEYS) {
    const value = found.get(key);
    // Un prix nul n'est pas une information exploitable : on ne tarife pas sur « 0 ».
    if (value !== undefined && value > 0) {
      return { microUsd: toMicro(value), readFrom: key };
    }
  }
  return null;
}
