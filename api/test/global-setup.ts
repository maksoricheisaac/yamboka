import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { TEST_ENV } from './test-env';

/**
 * Recrée la base de test (`yamboka_test`) avant chaque exécution des tests d'intégration :
 * le registre de crédits est volontairement impossible à vider, on repart donc d'une base neuve.
 * Garde-fou : refuse de toucher à toute base dont le nom ne se termine pas par `_test`.
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(TEST_ENV.DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refus de réinitialiser la base « ${dbName} » : le nom doit se terminer par _test.`,
    );
  }

  const admin = new URL(TEST_ENV.DATABASE_URL);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, ...TEST_ENV };
  execSync('pnpm exec prisma migrate deploy', { stdio: 'ignore', env });
  execSync('pnpm exec prisma db seed', { stdio: 'ignore', env });
}
