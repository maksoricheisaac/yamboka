/**
 * Charge le catalogue des pays et moyens de paiement. Lancé à chaque déploiement, juste après `prisma migrate deploy`
 * (service `migrate` des docker-compose) : idempotent, il ne modifie jamais un statut choisi par l'administrateur.
 * Seul le catalogue est chargé ici ; les autres données de base viennent du Setup Wizard.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { seedCountryCatalog } from './catalog-seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const r = await seedCountryCatalog(prisma);
    console.log(
      `Catalogue des paiements : ${r.countries} pays, ${r.methods} moyens, ${r.associations} associations ` +
        `(créés : ${r.created.countries} pays, ${r.created.associations} associations).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
