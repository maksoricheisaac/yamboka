import { TEST_ENV } from './test-env';

/** À importer AVANT les helpers : la suite de réconciliation force l'état du fournisseur simulé, donc elle a sa propre base. */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_reconciliation_test',
);
