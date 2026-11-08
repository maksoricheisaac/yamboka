/**
 * Active les hooks Git (Husky) à l'installation des dépendances (script « prepare » de la racine).
 * Multiplateforme (pas de « || true » : cmd.exe ne le comprend pas) et sans effet là où Git n'existe pas :
 * installation de production, image Docker, archive sans dossier .git. Ce n'est PAS un contournement des
 * hooks : lorsqu'un dépôt Git est présent, ils sont installés ; sinon il n'y a rien à contrôler.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('.git')) {
  console.log('Hooks Git ignorés : aucun dossier .git (installation hors dépôt).');
  process.exit(0);
}

const result = spawnSync('husky', { stdio: 'inherit', shell: true });
if (result.status !== 0) {
  console.warn('Husky n’a pas pu s’installer (dépendances de développement absentes ?). Les hooks Git ne sont pas actifs.');
}
