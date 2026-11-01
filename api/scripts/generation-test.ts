import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { validateEnv, type Env } from '../src/config/env';
import { createGenerationProvider } from '../src/generation/generation.module';
import { createStorageDriver } from '../src/storage/storage.module';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/**
 * Vérifie le fournisseur de génération configuré dans .env (GENERATION_PROVIDER).
 *   pnpm --filter api generation:test
 *       → vérifie les identifiants, SANS générer ni payer.
 *   pnpm --filter api generation:test -- --video clip.mp4 --image ref.jpg --yes [--resolution 480p] [--prompt "…"]
 *       → lance UNE vraie génération (PAYANTE), attend le résultat et l'enregistre dans le stockage configuré.
 * Les fichiers locaux sont déposés chez Higgsfield pour obtenir une URL publique. Aucun secret n'est affiché.
 */
async function main() {
  const env = validateEnv(process.env);
  const config = new ConfigService<Env, true>(
    env as unknown as Record<string, unknown>,
  );
  const provider = createGenerationProvider(config);
  console.log(`Fournisseur de génération : ${provider.name}`);

  const diag = await provider.diagnose();
  console.log(`${diag.ok ? '✔' : '✘'} ${diag.detail}`);
  if (!diag.ok) {
    process.exitCode = 1;
    return;
  }

  const videoPath = arg('video');
  const imagePath = arg('image');
  if (!videoPath || !imagePath) {
    console.log(
      '– Aucune génération lancée (ajoutez --video, --image et --yes pour un essai réel, payant).',
    );
    return;
  }
  if (!process.argv.includes('--yes')) {
    console.error(
      '✘ Une génération réelle est PAYANTE : ajoutez --yes pour confirmer.',
    );
    process.exitCode = 2;
    return;
  }
  if (provider.name === 'mock') {
    console.error('✘ GENERATION_PROVIDER=mock : rien de réel à lancer.');
    process.exitCode = 2;
    return;
  }

  const upload = async (path: string) => {
    const type = MIME[extname(path).toLowerCase()];
    if (!type) throw new Error(`Type de fichier non pris en charge : ${path}`);
    return provider.uploadInput(await readFile(path), type);
  };
  const videoUrl = await upload(videoPath);
  const imageUrl = await upload(imagePath);
  console.log('✔ Fichiers d’entrée déposés chez le fournisseur.');

  const model = arg('model') ?? 'higgsfield/genjutsu/motion-transfer/v1.0';
  const submitted = await provider.submit({
    model,
    input: {
      video_url: videoUrl,
      image_urls: [imageUrl],
      resolution: arg('resolution') ?? '480p',
      ...(arg('prompt') ? { prompt: arg('prompt') } : {}),
    },
    idempotencyKey: randomUUID(),
  });
  console.log(`✔ Demande acceptée : ${submitted.requestId}`);

  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    const st = await provider.getStatus(submitted.statusUrl);
    console.log(`  statut : ${st.status}`);
    if (st.status === 'completed' && st.outputUrl) {
      const res = await fetch(st.outputUrl);
      if (!res.ok)
        throw new Error(`Téléchargement impossible (${res.status}).`);
      const storage = createStorageDriver(config);
      const key = `outputs/test-${submitted.requestId}.mp4`;
      await storage.put(
        key,
        Buffer.from(await res.arrayBuffer()),
        res.headers.get('content-type') ?? 'video/mp4',
      );
      console.log(`✔ Résultat enregistré (${storage.name}) : ${key}`);
      return;
    }
    if (['failed', 'rejected', 'canceled'].includes(st.status)) {
      console.error(
        `✘ Génération terminée en « ${st.status} » : ${st.error ?? ''}`,
      );
      process.exitCode = 1;
      return;
    }
    if (Date.now() > deadline) {
      console.error(
        '✘ Délai de 15 minutes dépassé (la demande continue chez le fournisseur).',
      );
      process.exitCode = 1;
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

void main().catch((e: Error) => {
  console.error(`✘ ${e.message}`);
  process.exitCode = 1;
});
