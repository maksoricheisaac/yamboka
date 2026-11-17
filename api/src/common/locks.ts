import type { Prisma } from '../generated/prisma/client';

/**
 * Verrou de ligne sur un utilisateur (SELECT … FOR UPDATE) : sérialise, dans une transaction, toutes les
 * opérations financières d'un même utilisateur (réservation, remboursement, création de paiement…).
 */
export async function lockUserRow(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}

/**
 * Verrou consultatif GLOBAL, le temps de la transaction : sérialise les opérations sur le solde prépayé du
 * fournisseur, qui est partagé par tous les utilisateurs (le verrou par utilisateur n'y suffit pas — deux
 * clients différents peuvent engager le même dollar en même temps).
 *
 * `pg_advisory_xact_lock` attend son tour et se libère à la fin de la transaction, même en cas d'erreur.
 * La clé est une constante arbitraire propre à ce verrou.
 */
const PROVIDER_BALANCE_LOCK_KEY = 827_314_501;

export async function lockProviderBalance(
  tx: Prisma.TransactionClient,
): Promise<void> {
  // `$executeRaw` et non `$queryRaw` : la fonction ne renvoie rien, et Prisma ne sait pas lire un `void`.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PROVIDER_BALANCE_LOCK_KEY}::bigint)`;
}
