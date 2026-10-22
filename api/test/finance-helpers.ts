import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Client, prismaOf, tokenFromEmail } from './helpers';

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

/** Ajoute un lot de crédits (PURCHASE) avec une échéance et une date de création au choix. */
export async function addLot(
  app: INestApplication,
  userId: string,
  amount: number,
  opts: {
    expiresInDays?: number;
    type?: 'PURCHASE' | 'WELCOME' | 'BONUS';
  } = {},
) {
  const days = opts.expiresInDays ?? 365;
  return prismaOf(app).creditLedger.create({
    data: {
      userId,
      amount,
      type: opts.type ?? 'PURCHASE',
      reference: `test:${randomUUID()}`,
      expiresAt: new Date(Date.now() + days * 86_400_000),
    },
  });
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

/** Compte inscrit ET vérifié par l'API (reçoit donc les 4 crédits de bienvenue). */
export async function verifiedClient(app: INestApplication) {
  const client = new Client(app);
  const { email } = await client.register();
  await client
    .post('/v1/auth/verify-email', { token: tokenFromEmail(app, email) })
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
