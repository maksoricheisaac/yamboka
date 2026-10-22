import { TEST_ENV } from './test-env';

// Les tests ne lisent jamais le .env de développement : tout est forcé ici.
Object.assign(process.env, TEST_ENV);
