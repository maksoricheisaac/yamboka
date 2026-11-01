import { TEST_ENV } from './test-env';

/** À importer AVANT les helpers : le Setup Wizard exige une base vierge, donc la suite a sa propre base. */
process.env.DATABASE_URL = TEST_ENV.DATABASE_URL.replace(
  /yamboka_test$/,
  'yamboka_setup_test',
);
