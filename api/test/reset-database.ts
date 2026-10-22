import { execSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * Recrée une base de test jetable, migrée et seedée. Le registre de crédits est volontairement impossible
 * à vider : on repart donc d'une base neuve.
 * Garde-fou : refuse de toucher à toute base dont le nom ne se termine pas par `_test` ou `_e2e`.
 */
export async function resetDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.slice(1);
  if (!/_(test|e2e)$/.test(dbName)) {
    throw new Error(
      `Refus de réinitialiser la base « ${dbName} » : le nom doit se terminer par _test ou _e2e.`,
    );
  }

  const admin = new URL(databaseUrl);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, DATABASE_URL: databaseUrl };
  execSync('pnpm exec prisma migrate deploy', { stdio: 'ignore', env });
  execSync('pnpm exec prisma db seed', { stdio: 'ignore', env });
}
