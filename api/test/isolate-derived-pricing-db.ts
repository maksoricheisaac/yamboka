import { TEST_ENV } from './test-env';

/**
 * À importer AVANT les helpers : cette suite parcourt tout le catalogue et peut activer des modèles pour
 * vérifier la garantie « jamais sous le coût ». Base dédiée, pour ne gêner aucune autre suite.
 */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_derived_test',
);
