import { TEST_ENV } from './test-env';

/**
 * À importer AVANT les helpers : cette suite écrit les versions de tarifs et de paramètres, qui sont globales.
 * Base dédiée, pour ne pas croiser la suite du solde fournisseur (qui réinitialise aussi sa base).
 */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_pricing_test',
);
