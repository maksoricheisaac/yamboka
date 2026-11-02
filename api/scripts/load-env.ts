import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Charge le .env.local centralisé à la racine du dépôt (les commandes s'exécutent depuis api/ via pnpm --filter).
 * Les variables déjà définies (shell, CI, Docker Compose) l'emportent ; sans fichier, rien n'est chargé.
 */
config({ path: resolve(process.cwd(), '..', '.env.local'), quiet: true });
