import { TEST_ENV } from './test-env';

/**
 * À importer AVANT les helpers : cette suite écrit le journal du solde fournisseur, qui est GLOBAL (il n'est
 * pas rattaché à un utilisateur). Elle a donc sa propre base, sinon elle fausserait les statistiques des autres.
 */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_provider_test',
);
