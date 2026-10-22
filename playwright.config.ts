import { defineConfig, devices } from '@playwright/test';

/**
 * Pile e2e isolée : ports et base de données dédiés, pour ne jamais toucher au développement en cours.
 *  - site public  : http://localhost:3000   (aucune dépendance à l'API)
 *  - application  : http://localhost:3101   → API http://localhost:4101 → base `yamboka_e2e` (recréée à chaque lancement)
 */
export const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
export const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:3101';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4101';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://yamboka:yamboka_dev_password@localhost:5433/yamboka_e2e';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  // Chaque worker pilote un Chromium ; en plus, trois serveurs Node et PostgreSQL tournent sur la même machine.
  // Au-delà de 4, la surcharge provoque des délais dépassés qui ne disent rien du code.
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'web-desktop',
      testMatch: /public-site\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
    },
    {
      name: 'web-mobile-360',
      testMatch: /public-site\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 }, baseURL: WEB_URL },
    },
    {
      name: 'app-desktop',
      testMatch: /app-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: APP_URL },
    },
    {
      name: 'app-mobile-360',
      testMatch: /app-.*\.spec\.ts/,
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 }, baseURL: APP_URL },
    },
  ],
  webServer: [
    {
      // Build dédié à l'e2e : NEXT_PUBLIC_* est figé à la compilation, avec un numéro WhatsApp factice.
      command: 'pnpm --filter web build && pnpm --filter web start',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { NEXT_PUBLIC_WHATSAPP_NUMBER: '242060000000' },
    },
    {
      // Compile l'API, recrée la base jetable (migrations + seed), puis démarre.
      command: 'pnpm --filter api e2e:serve',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: 'test', // désactive la limitation de débit et expose l'outbox e-mail de développement
        PORT: '4101',
        DATABASE_URL: E2E_DATABASE_URL,
        SESSION_SECRET: 'e2e-only-session-secret-0123456789abcdef',
        APP_URL,
        WEB_URL,
        API_URL,
        ADMIN_EMAIL: 'admin@yamboka.test',
        ADMIN_PASSWORD: 'Admin-E2E-Password-2026!',
        LOG_LEVEL: 'warn',
        // Navigateur → Next (réécriture /api/*) → API : 2 sauts de confiance pour lire l'IP du client (X-Forwarded-For).
        TRUST_PROXY: '2',
      },
    },
    {
      // L'adresse de l'API est figée à la compilation (réécriture /api/*) : build dédié à l'e2e.
      command: 'pnpm --filter app build && pnpm --filter app exec next start -p 3101',
      url: `${APP_URL}/connexion`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { API_INTERNAL_URL: API_URL, NEXT_PUBLIC_SITE_URL: WEB_URL },
    },
  ],
});
