/**
 * Expiration FIFO des crédits (RG-08) : « premier acheté, premier consommé ».
 *
 * Le registre est en ajout seul et ne dit pas, ligne par ligne, quel lot une consommation a entamé.
 * On le déduit : la consommation nette totale est répartie sur les lots dans l'ordre d'échéance, et ce
 * qui reste d'un lot échu est expiré. Fonction pure : aucune base de données, donc testable seule.
 */

export interface CreditLot {
  /** Identifiant de la ligne du registre qui a créé le lot (PURCHASE, BONUS, WELCOME…). */
  id: string;
  amount: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface Expiration {
  lotId: string;
  amount: number;
}

/**
 * @param lots lots de l'utilisateur (montants positifs, avec échéance)
 * @param expiredAmounts montant déjà expiré par lot (lignes EXPIRE existantes, en valeur positive)
 * @param netConsumption crédits consommés net des remboursements : −Σ(RESERVE) − Σ(REFUND) − Σ(ajustements négatifs)
 * @param now date de référence
 * @returns les expirations à écrire maintenant (jamais celles déjà écrites)
 */
export function computeExpirations(
  lots: CreditLot[],
  expiredAmounts: ReadonlyMap<string, number>,
  netConsumption: number,
  now: Date,
): Expiration[] {
  const ordered = [...lots].sort(
    (a, b) =>
      a.expiresAt.getTime() - b.expiresAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );

  let pool = Math.max(0, netConsumption);
  const result: Expiration[] = [];

  for (const lot of ordered) {
    const alreadyExpired = expiredAmounts.get(lot.id);
    if (alreadyExpired !== undefined) {
      // Lot déjà traité : sa part consommée est figée (montant − expiré). Ne pas la réallouer évite
      // d'expirer deux fois la même chose et d'envoyer le solde sous zéro plus tard.
      pool = Math.max(0, pool - Math.max(0, lot.amount - alreadyExpired));
      continue;
    }
    const consumed = Math.min(lot.amount, pool);
    pool -= consumed;
    const remaining = lot.amount - consumed;
    if (remaining > 0 && lot.expiresAt.getTime() <= now.getTime()) {
      result.push({ lotId: lot.id, amount: remaining });
    }
  }
  return result;
}
