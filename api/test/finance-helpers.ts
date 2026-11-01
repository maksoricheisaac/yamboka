import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Client, otpFromEmail, prismaOf } from './helpers';

/** Utilisateur de test avec un solde donné, créé directement en base (sans passer par l'inscription). */
export async function userWithBalance(app: INestApplication, credits = 0) {
  const prisma = prismaOf(app);
  const user = await prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'Registre',
      email: `registre.${randomUUID().slice(0, 8)}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
  if (credits > 0) await addLot(app, user.id, credits);
  return user;
}

/**
 * Ajoute un lot de crédits : un mouvement du journal ET le lot qui le porte, comme le fait le service.
 * Retourne le lot (son identifiant sert dans la référence `expire:<id>`).
 */
export async function addLot(
  app: INestApplication,
  userId: string,
  amount: number,
  opts: {
    expiresInDays?: number;
    type?: 'PURCHASE' | 'FIRST_PURCHASE_BONUS' | 'ADMIN_ADJUST';
    createdAt?: Date;
  } = {},
) {
  const days = opts.expiresInDays ?? 365;
  const type = opts.type ?? 'PURCHASE';
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  return prismaOf(app).$transaction(async (tx) => {
    const ledger = await tx.creditLedger.create({
      data: {
        userId,
        amount,
        type,
        reference: `test:${randomUUID()}`,
        expiresAt,
        createdAt: opts.createdAt,
      },
    });
    return tx.creditLot.create({
      data: {
        userId,
        kind: type,
        initialAmount: amount,
        remaining: amount,
        expiresAt,
        ledgerId: ledger.id,
        createdAt: opts.createdAt,
      },
    });
  });
}

/** Invariant central : la somme des lots égale le solde du journal. */
export async function lotsMatchLedger(
  app: INestApplication,
  userId: string,
): Promise<{ ledger: number; lots: number }> {
  const prisma = prismaOf(app);
  const ledger = await prisma.creditLedger.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  const lots = await prisma.creditLot.aggregate({
    where: { userId },
    _sum: { remaining: true },
  });
  return { ledger: ledger._sum.amount ?? 0, lots: lots._sum.remaining ?? 0 };
}

/** Crée une génération en attente (le registre référence une génération par clé étrangère). */
export async function makeGeneration(
  app: INestApplication,
  userId: string,
  creditsCost = 40,
) {
  const prisma = prismaOf(app);
  const product = await prisma.generationProduct.findUniqueOrThrow({
    where: { code: 'VIDEO_LIGHT_480' },
  });
  return prisma.generation.create({
    data: { userId, productId: product.id, creditsCost, consentAt: new Date() },
  });
}

/** Compte inscrit ET vérifié par l'API (solde nul : aucun crédit offert à l'inscription). */
export async function verifiedClient(app: INestApplication) {
  const client = new Client(app);
  const { email } = await client.register();
  await client
    .post('/v1/auth/verify-email', { code: otpFromEmail(app, email) })
    .expect(200);
  const user = await prismaOf(app).user.findUniqueOrThrow({ where: { email } });
  return { client, email, userId: user.id };
}

export async function ledgerOf(app: INestApplication, userId: string) {
  return prismaOf(app).creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}
