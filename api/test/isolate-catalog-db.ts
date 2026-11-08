import { TEST_ENV } from './test-env';

/** À importer AVANT les helpers : la suite du catalogue international modifie pays et moyens de paiement, donc elle a sa propre base. */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_catalog_test',
);
