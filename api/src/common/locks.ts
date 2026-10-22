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
