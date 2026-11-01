import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';

/** Crédite un compte de la base jetable (_e2e) pour l'inspection visuelle : pnpm tsx scripts/grant-e2e.ts <email> <crédits> */
const url = process.env.DATABASE_URL ?? '';
if (!url.endsWith('_e2e')) throw new Error('Base _e2e uniquement');
const [email, amount] = [process.argv[2], Number(process.argv[3])];

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const expiresAt = new Date(Date.now() + 365 * 86_400_000);
  await prisma.$transaction(async (tx) => {
    const l = await tx.creditLedger.create({
      data: { userId: user.id, amount, type: 'PURCHASE', reference: `visual:${randomUUID()}`, expiresAt },
    });
    await tx.creditLot.create({
      data: { userId: user.id, kind: 'PURCHASE', initialAmount: amount, remaining: amount, expiresAt, ledgerId: l.id },
    });
  });
  await prisma.$disconnect();
}
void main();
