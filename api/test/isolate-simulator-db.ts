import { TEST_ENV } from './test-env';

/**
 * À importer AVANT les helpers : cette suite modifie les tarifs des produits pour vérifier qu'un relèvement
 * repasse au-dessus du coût. Base dédiée, pour ne gêner aucune autre suite.
 */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_simulator_test',
);
