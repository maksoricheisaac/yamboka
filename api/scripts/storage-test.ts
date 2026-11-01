import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from '../src/config/env';
import { createStorageDriver } from '../src/storage/storage.module';

/**
 * Vérifie le stockage configuré dans .env (STORAGE_DRIVER) sans démarrer l'API.
 *   pnpm --filter api storage:test   → écriture, lecture, suppression d'un petit fichier de contrôle
 * Avec R2, vérifie aussi qu'une URL signée est lisible depuis Internet. N'affiche jamais les identifiants.
 */
async function main() {
  const env = validateEnv(process.env);
  const storage = createStorageDriver(
    new ConfigService<Env, true>(env as unknown as Record<string, unknown>),
  );
  console.log(`Pilote de stockage : ${storage.name}`);

  const diag = await storage.diagnose();
  console.log(`${diag.ok ? '✔' : '✘'} ${diag.detail}`);
  if (!diag.ok) {
    process.exitCode = 1;
    return;
  }

  const key = `diagnostic/url-${Date.now()}.txt`;
  await storage.put(key, Buffer.from('yamboka-url'), 'text/plain');
  try {
    const url = await storage.signedUrl(key, 60);
    if (!url) {
      console.log(
        '– URL signée : non fournie par ce pilote (normal en local).',
      );
      return;
    }
    const res = await fetch(url);
    const text = await res.text();
    if (res.ok && text === 'yamboka-url') {
      console.log('✔ URL signée lisible depuis Internet (valable 60 s).');
    } else {
      console.error(`✘ URL signée refusée (HTTP ${res.status}).`);
      process.exitCode = 1;
    }
  } finally {
    await storage.delete(key);
  }
}

void main().catch((e: Error) => {
  console.error(`✘ ${e.message}`);
  process.exitCode = 1;
});
