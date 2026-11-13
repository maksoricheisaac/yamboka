/**
 * Tri d'une liste paginée : colonne choisie dans une LISTE BLANCHE (jamais un nom de champ venu du client tel quel),
 * puis l'identifiant comme critère secondaire. Sans lui, deux lignes de même valeur peuvent changer de place d'une
 * page à l'autre : doublons et lignes manquantes.
 */
export function orderBy<K extends string>(
  q: { sort?: string; dir?: 'asc' | 'desc' },
  allowed: readonly K[],
  fallback: { field: K; dir: 'asc' | 'desc' },
  /** Champ qui départage les égalités : la clé primaire de la table (« iso » pour les pays). */
  tiebreaker = 'id',
): Array<Record<string, 'asc' | 'desc'>> {
  const field = allowed.find((a) => a === q.sort) ?? fallback.field;
  const dir = allowed.some((a) => a === q.sort)
    ? (q.dir ?? 'asc')
    : fallback.dir;
  return [{ [field]: dir }, { [tiebreaker]: dir }];
}
