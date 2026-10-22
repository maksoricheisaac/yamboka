import { resetDatabase } from '../test/reset-database';

/** Prépare la base jetable des tests de navigateur (Playwright) : DATABASE_URL doit finir par _e2e. */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL requis');

resetDatabase(url)
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
