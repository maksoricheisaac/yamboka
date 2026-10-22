import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API_URL } from '../playwright.config';

/**
 * Test Playwright dont chaque page présente sa propre adresse IP (via X-Forwarded-For).
 * Sans cela, tous les comptes créés viendraient de la même IP et la règle RG-09 (pas de crédits de
 * bienvenue au-delà de 3 comptes par IP en 24 h) priverait les derniers tests de leurs crédits.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const ip = `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': ip });
    await use(page);
  },
});
export { expect };

export const PASSWORD = 'Motdepasse-2026!';
export const ADMIN = { email: 'admin@yamboka.test', password: 'Admin-E2E-Password-2026!' };

export const uniqueEmail = (prefix = 'e2e') => `${prefix}.${randomUUID().slice(0, 8)}@example.com`;

/** Lit le dernier jeton envoyé par e-mail (outbox de développement de l'API de test). */
export async function tokenFor(request: APIRequestContext, email: string): Promise<string> {
  let token: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${API_URL}/v1/dev/outbox`, { params: { to: email } });
        const { messages } = (await res.json()) as { messages: { text: string }[] };
        token = messages.at(-1)?.text.match(/token=([A-Za-z0-9_%-]+)/)?.[1];
        return token;
      },
      { message: `e-mail pour ${email}` },
    )
    .toBeTruthy();
  return decodeURIComponent(token!);
}

export async function signUp(page: Page, email: string, overrides: Partial<Record<'firstName' | 'password', string>> = {}) {
  await page.goto('/inscription');
  await page.getByLabel('Prénom').fill(overrides.firstName ?? 'Marie');
  await page.getByLabel('Nom', { exact: true }).fill('Ndinga');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(overrides.password ?? PASSWORD);
  await page.getByLabel('Confirmer le mot de passe').fill(overrides.password ?? PASSWORD);
  await page.getByRole('checkbox', { name: /J’accepte/ }).click();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Alertes affichées par l'application (exclut l'annonceur de routes de Next, qui est aussi un role="alert" vide). */
export const appAlerts = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });
