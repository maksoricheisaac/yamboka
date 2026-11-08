/**
 * Contrôles avant commit (hook .husky/pre-commit). Seuls les fichiers indexés sont lintés ; le typage porte sur
 * les projets touchés (TypeScript ne sait pas vérifier « quelques fichiers » sans perdre leur contexte).
 *
 * Ordre (séquentiel, un seul groupe) :
 *   1. ESLint --fix par projet. Dans l'API, le plugin Prettier est dans ESLint : le formatage est donc corrigé
 *      automatiquement, et les fichiers corrigés sont remis dans l'index par lint-staged.
 *   2. Construction du paquet partagé s'il est touché (api, app et web lisent son code compilé).
 *   3. Vérification TypeScript des projets touchés (tous, si le paquet partagé change).
 *
 * Aucune règle n'est désactivée : une erreur non corrigeable automatiquement bloque le commit.
 */
import path from 'node:path';

const ROOT = process.cwd();
const WORKSPACES = ['api', 'app', 'web'];
const quote = (files) => files.map((f) => JSON.stringify(f)).join(' ');
const workspaceOf = (file) => path.relative(ROOT, file).split(path.sep)[0];

export default {
  '{api,app,web,packages/shared}/**/*.{ts,tsx}': (files) => {
    const touched = new Set(files.map(workspaceOf));
    const sharedTouched = touched.has('packages');
    const commands = [];

    for (const ws of WORKSPACES) {
      const own = files.filter((f) => workspaceOf(f) === ws);
      if (own.length > 0) {
        commands.push(
          `pnpm --filter ${ws} exec eslint --fix --max-warnings=0 --no-warn-ignored ${quote(own)}`,
        );
      }
    }
    if (sharedTouched) commands.push('pnpm build:shared');
    for (const ws of WORKSPACES) {
      if (touched.has(ws) || sharedTouched) commands.push(`pnpm --filter ${ws} typecheck`);
    }
    return commands;
  },
};
