import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedBaseData } from '../src/setup/base-data';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  await seedBaseData(prisma);

  // Administrateur de développement et de test uniquement. En production, le premier administrateur est créé
  // par le Setup Wizard (SETUP_SECRET) : ne pas définir ADMIN_PASSWORD.
  if (email && password) {
    const admin = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        firstName: 'Admin',
        lastName: 'Yamboka',
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
        passwordHash: await hash(password),
      },
    });
    await prisma.installState.upsert({ where: { id: 1 }, update: {}, create: { id: 1, adminUserId: admin.id } });
  }
  console.log('Seed terminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
