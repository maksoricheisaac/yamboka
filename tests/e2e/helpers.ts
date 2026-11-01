import { expect, test as base, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API_URL } from '../playwright.config';

/**
 * Test Playwright dont chaque page présente sa propre adresse IP (via X-Forwarded-For).
 * Sans cela, tous les comptes créés viendraient de la même IP et la règle ancienne règle RG-09 (pas de crédits de
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

/** Lit le dernier code à usage unique envoyé par e-mail (outbox de développement de l'API de test). */
export async function codeFor(request: APIRequestContext, email: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${API_URL}/v1/dev/outbox`, { params: { to: email } });
        const { messages } = (await res.json()) as { messages: { text: string }[] };
        code = messages.at(-1)?.text.match(/^(\d{6})$/m)?.[1];
        return code;
      },
      { message: `code pour ${email}` },
    )
    .toBeTruthy();
  return code!;
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

const MENU_TOGGLE = 'Afficher ou masquer le menu';

/** Lien du menu latéral (barre sur ordinateur, tiroir sur mobile) : exclut le fil d'Ariane, dont la page courante est aussi un role="link". */
export const menuLink = (page: Page, name: string) =>
  page.locator('[data-slot="sidebar"]').getByRole('link', { name, exact: true });

/** Ouvre le menu latéral s'il est masqué (sur mobile, il s'ouvre en tiroir). */
export async function openMenuIfHidden(page: Page, probe: Locator) {
  // On décide selon la taille de l'écran, jamais selon « le lien n'est pas encore affiché » : la page est diffusée
  // en streaming, et cliquer le bouton du menu sur ordinateur pendant le chargement REPLIERAIT la barre.
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;
  if (!mobile) {
    await expect(probe).toBeVisible();
    return;
  }
  await expect(page.getByRole('button', { name: MENU_TOGGLE }).first()).toBeVisible();
  if (await probe.isVisible()) return;
  await page.getByRole('button', { name: MENU_TOGGLE }).first().click();
  await expect(probe).toBeVisible();
}

/** Déconnexion par le menu du compte (barre du haut) : c'est le seul endroit où elle se trouve. */
export async function logOut(page: Page) {
  await page.getByRole('button', { name: /^Menu du compte/ }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
}

/** Clique un lien du menu latéral (en ouvrant le tiroir sur mobile). */
export async function goToNav(page: Page, name: string) {
  const link = menuLink(page, name);
  await openMenuIfHidden(page, link);
  await link.click();
}

/** Connexion de l'administrateur du seed : accepte les textes légaux s'il ne l'a pas encore fait, puis arrive dans /admin. */
export async function adminLogin(page: Page) {
  await logIn(page, ADMIN.email, ADMIN.password);
  const title = page.getByRole('heading', { level: 1 });
  // Le compte du seed est partagé entre projets Playwright : si deux exécutions acceptent les conditions au même
  // instant, l'écran peut disparaître sous nos doigts. Tout le bloc est donc rejoué jusqu'à l'état final attendu.
  await expect(async () => {
    await expect(title).toHaveText(/Un dernier pas|Tableau de bord/, { timeout: 4000 });
    if ((await title.textContent())?.includes('Un dernier pas')) {
      await page.getByRole('checkbox').click({ timeout: 3000 });
      await page.getByRole('button', { name: 'Continuer' }).click({ timeout: 3000 });
    }
    await expect(title).toHaveText('Tableau de bord', { timeout: 4000 });
  }).toPass({ timeout: 25_000 });
  await expect(page).toHaveURL(/\/admin$/);
}

/** Saisit le code reçu par e-mail sur la page de vérification, puis attend l'arrivée dans l'espace client. */
export async function verifyWithCode(page: Page, request: APIRequestContext, email: string) {
  await expect(page).toHaveURL(/\/verifier-email/);
  await page.getByLabel('Code de vérification').fill(await codeFor(request, email));
  await page.getByRole('button', { name: 'Valider le code' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

/** Inscription + vérification de l'adresse : arrive sur le tableau de bord d'un compte vérifié (solde nul : aucun crédit offert). */
export async function signUpVerified(
  page: Page,
  request: APIRequestContext,
  email: string,
  overrides: Partial<Record<'firstName' | 'password', string>> = {},
) {
  await signUp(page, email, overrides);
  await verifyWithCode(page, request, email);
}
