import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

/** Avant chaque exécution des tests d'intégration : base `yamboka_test` neuve, migrée et seedée. */
export default async function globalSetup(): Promise<void> {
  // Le seed lit ADMIN_EMAIL / ADMIN_PASSWORD de l'environnement de test.
  Object.assign(process.env, TEST_ENV);
  await resetDatabase(TEST_ENV.DATABASE_URL);
}
