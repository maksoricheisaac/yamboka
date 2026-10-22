/** Variables d'environnement des tests : base dédiée, fournisseurs simulés, aucun secret réel. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://yamboka:yamboka_dev_password@localhost:5433/yamboka_test',
  SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
  APP_URL: 'http://localhost:3001',
  WEB_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:4000',
  TRUST_PROXY: '1',
  LOG_LEVEL: 'silent',
  ADMIN_EMAIL: 'admin@yamboka.test',
  ADMIN_PASSWORD: 'Admin-Test-Password-2026!',
  // Identifiants factices : le client Google est simulé dans les tests, aucun appel réseau.
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_CALLBACK_URL: 'http://localhost:3001/api/auth/google/callback',
};
