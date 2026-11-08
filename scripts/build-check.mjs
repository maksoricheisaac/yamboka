/**
 * Build de production de tous les projets pour la vérification locale (pnpm check, hook pre-push).
 * Les applications Next.js compilent dans un dossier à part (.next-check) : un serveur de développement
 * (`pnpm dev:app`, `pnpm dev:web`) ouvert pendant ce temps garde son propre dossier .next intact.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['-r', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_DIST_DIR: '.next-check' },
});
process.exit(result.status ?? 1);
