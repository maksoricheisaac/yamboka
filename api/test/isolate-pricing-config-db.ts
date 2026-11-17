import { TEST_ENV } from './test-env';

/**
 * À importer AVANT les helpers : cette suite APPLIQUE des versions de configuration, ce qui change les
 * prix de toute la plateforme. Base dédiée, pour ne gêner aucune autre suite.
 */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_pricing_config_test',
);
