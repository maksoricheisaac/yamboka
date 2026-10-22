import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: WEB_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } },
  ],
  // Site public servi en production (build requis) pour refléter le comportement réel.
  webServer: {
    command: 'pnpm --filter web start',
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
