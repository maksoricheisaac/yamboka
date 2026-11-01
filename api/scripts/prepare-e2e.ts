import { PrismaPg } from '@prisma/adapter-pg';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { resetDatabase } from '../test/reset-database';

/**
 * Prépare la base jetable des tests de navigateur (Playwright) : DATABASE_URL doit finir par _e2e.
 * Publie aussi un style par type de création (affiche, pub, fun), avec une vignette, pour que le parcours
 * de création soit testable : sans eux, la page « Créer » n'aurait rien à proposer.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL requis');

const STORAGE_DIR = process.env.LOCAL_STORAGE_DIR ?? './storage';
const THUMB = join(__dirname, '..', '..', 'web', 'public', 'demos', 'danse-apres.webp');

const STYLES = [
  { name: 'Affiche e2e', category: 'affiche', type: 'LOOK', product: 'IMAGE_SOUL2' },
  { name: 'Pub e2e', category: 'pub', type: 'LOOK', product: 'VIDEO_LIGHT_480' },
  { name: 'Tendance e2e', category: 'danse', type: 'MOTION', product: 'VIDEO_LIGHT_480' },
] as const;

async function seedStyles() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const thumb = await readFile(THUMB);
    for (const [i, s] of STYLES.entries()) {
      const product = await prisma.generationProduct.findUniqueOrThrow({ where: { code: s.product } });
      const preset = await prisma.preset.create({
        data: { name: s.name, category: s.category, type: s.type, productId: product.id, sortOrder: 100 + i, visible: true },
      });
      const key = `presets/${preset.id}/thumbnail.webp`;
      const file = join(STORAGE_DIR, key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, thumb);
      await prisma.mediaFile.create({
        data: { role: 'PRESET_THUMBNAIL', bucket: 'PRESETS', key, mimeType: 'image/webp', sizeBytes: thumb.length, presetId: preset.id, verifiedAt: new Date() },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

resetDatabase(url)
  .then(seedStyles)
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
