import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateEnv, type Env } from '../src/config/env';
import { PrismaClient } from '../src/generated/prisma/client';
import { createStorageDriver } from '../src/storage/storage.module';

/**
 * DONNÉES DE DÉMONSTRATION (développement uniquement) : publie des styles d'exemple, avec les vignettes du site
 * public (web/public). Ce ne sont pas de vrais styles de production : l'administrateur les remplace dans
 * « Presets » avec ses propres vignettes et vidéos de référence.
 *   pnpm --filter api seed:demo-presets
 */
const PUBLIC = join(__dirname, '..', '..', 'web', 'public');

interface Demo {
  name: string;
  description: string;
  category: string;
  type: 'LOOK' | 'MOTION';
  product: 'IMAGE_SOUL2' | 'VIDEO_LIGHT_480';
  thumb: string;
}

const DEMOS: Demo[] = [
  { name: 'Boutique en vitrine', description: 'Ton produit mis en scène dans une vitrine.', category: 'affiche', type: 'LOOK', product: 'IMAGE_SOUL2', thumb: 'demos/boutique-apres.webp' },
  { name: 'Affiche mode', description: 'Une affiche élégante pour tes vêtements.', category: 'affiche', type: 'LOOK', product: 'IMAGE_SOUL2', thumb: 'images/galerie-mode.webp' },
  { name: 'Portrait de marque', description: 'Un portrait soigné pour ta page.', category: 'affiche', type: 'LOOK', product: 'IMAGE_SOUL2', thumb: 'images/galerie-portrait.webp' },
  { name: 'Invitation fête', description: 'Une invitation prête à partager.', category: 'affiche', type: 'LOOK', product: 'IMAGE_SOUL2', thumb: 'images/galerie-invitation.webp' },
  { name: 'Produit qui tourne', description: 'Ton produit présenté sous tous les angles.', category: 'pub', type: 'LOOK', product: 'VIDEO_LIGHT_480', thumb: 'demos/boutique-avant.webp' },
  { name: 'Zoom dynamique', description: 'Un zoom qui attire le regard.', category: 'pub', type: 'LOOK', product: 'VIDEO_LIGHT_480', thumb: 'demos/hero-creation.webp' },
  { name: 'Mise en scène', description: 'Ton produit dans une petite scène.', category: 'pub', type: 'LOOK', product: 'VIDEO_LIGHT_480', thumb: 'demos/boutique-apres.webp' },
  { name: 'Annonce promo', description: 'Une annonce courte avec ton offre.', category: 'pub', type: 'LOOK', product: 'VIDEO_LIGHT_480', thumb: 'demos/fete-avant.webp' },
  { name: 'Danse afro', description: 'Fais danser ton selfie.', category: 'danse', type: 'MOTION', product: 'VIDEO_LIGHT_480', thumb: 'demos/danse-apres.webp' },
  { name: 'Anniversaire', description: 'Une vidéo d’anniversaire personnalisée.', category: 'anniversaire', type: 'MOTION', product: 'VIDEO_LIGHT_480', thumb: 'demos/fete-apres.webp' },
  { name: 'Selfie ndombolo', description: 'Ton selfie sur un rythme de ndombolo.', category: 'danse', type: 'MOTION', product: 'VIDEO_LIGHT_480', thumb: 'demos/danse-personnage.webp' },
  { name: 'Ambiance de fête', description: 'Toi, au milieu de la fête.', category: 'fête', type: 'MOTION', product: 'VIDEO_LIGHT_480', thumb: 'demos/fete-personnage-brut.webp' },
];

async function main() {
  const env = validateEnv(process.env);
  if (env.NODE_ENV === 'production') throw new Error('Données de démonstration : jamais en production.');
  const storage = createStorageDriver(new ConfigService<Env, true>(env as unknown as Record<string, unknown>));
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  try {
    for (const [i, d] of DEMOS.entries()) {
      const product = await prisma.generationProduct.findUniqueOrThrow({ where: { code: d.product } });
      const existing = await prisma.preset.findFirst({ where: { name: d.name } });
      const data = { description: d.description, category: d.category, type: d.type, productId: product.id, sortOrder: i, visible: true };
      const preset = existing
        ? await prisma.preset.update({ where: { id: existing.id }, data })
        : await prisma.preset.create({ data: { name: d.name, ...data } });
      const has = await prisma.mediaFile.findFirst({ where: { presetId: preset.id, role: 'PRESET_THUMBNAIL', purgedAt: null } });
      if (!has) {
        const body = await readFile(join(PUBLIC, d.thumb));
        const key = `presets/${preset.id}/thumbnail.webp`;
        await storage.put(key, body, 'image/webp');
        await prisma.mediaFile.create({
          data: { role: 'PRESET_THUMBNAIL', bucket: 'PRESETS', key, mimeType: 'image/webp', sizeBytes: body.length, presetId: preset.id, verifiedAt: new Date() },
        });
      }
      console.log(`✔ ${d.name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
