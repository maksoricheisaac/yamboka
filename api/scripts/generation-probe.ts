import './load-env';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { validateEnv, type Env } from '../src/config/env';
import { createGenerationProvider } from '../src/generation/generation.module';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

/**
 * Sonde d'un modèle Higgsfield — PAYANTE (une génération). Dépose le fichier --image (et --video), remplace les
 * jetons @IMAGE@ et @VIDEO@ du JSON --input par les URL obtenues, soumet, attend, télécharge et décrit le résultat.
 *   tsx scripts/generation-probe.ts --model <chemin> --input '{"prompt":"…","image_urls":["@IMAGE@"]}'
 *       --image photo.webp [--video clip.mp4] --out resultat --yes
 * Ne montre jamais de secret ; sert à vérifier les paramètres RÉELS d'un modèle avant de les coder.
 */
async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('✘ Génération PAYANTE : ajoutez --yes.');
    process.exit(2);
  }
  const env = validateEnv(process.env);
  const provider = createGenerationProvider(new ConfigService<Env, true>(env));
  if (provider.name !== 'higgsfield')
    throw new Error('GENERATION_PROVIDER=higgsfield requis.');
  const model = arg('model')!;
  let json = arg('input')!;
  const up = async (path?: string) => {
    if (!path) return '';
    return provider.uploadInput(
      await readFile(path),
      MIME[extname(path).toLowerCase()] ?? 'application/octet-stream',
    );
  };
  json = json
    .replace('@IMAGE@', await up(arg('image')))
    .replace('@VIDEO@', await up(arg('video')));
  const input = JSON.parse(json) as Record<string, unknown>;
  console.log('modèle :', model);
  console.log(
    'paramètres envoyés :',
    JSON.stringify(input).replace(/https:\/\/[^"]+/g, '<url>'),
  );

  const t0 = Date.now();
  let sub;
  try {
    sub = await provider.submit({
      model,
      input,
      idempotencyKey: crypto.randomUUID(),
    });
  } catch (e) {
    console.log('✘ SOUMISSION REFUSÉE :', (e as Error).message);
    return;
  }
  console.log('soumis :', sub.requestId, sub.status);
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    let st;
    try {
      st = await provider.getStatus(sub.statusUrl);
    } catch (e) {
      console.log('… statut illisible :', (e as Error).message);
      continue;
    }
    if (st.status === 'queued' || st.status === 'processing') continue;
    console.log(
      `fin après ${Math.round((Date.now() - t0) / 1000)} s : ${st.status}`,
      st.error ?? '',
    );
    if (st.status !== 'completed' || !st.outputUrl) return;
    const res = await fetch(st.outputUrl);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type');
    console.log('résultat :', mime, buf.length, 'octets');
    const out = arg('out');
    if (out) {
      const ext = (mime ?? '').includes('mp4') ? 'mp4' : 'bin';
      await writeFile(`${out}.${ext}`, buf);
      console.log('enregistré :', `${out}.${ext}`);
    }
    return;
  }
  console.log('✘ pas de résultat après 10 min');
}
void main();
