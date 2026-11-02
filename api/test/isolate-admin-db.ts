import { TEST_ENV } from './test-env';

/** À importer AVANT les helpers : la suite d'administration modifie packs et paramètres, donc elle a sa propre base. */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_admin_test',
);
