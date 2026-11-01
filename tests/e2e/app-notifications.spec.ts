import type { APIRequestContext, Page } from '@playwright/test';
import { API_URL, APP_URL } from '../playwright.config';
import { adminLogin, expect, signUpVerified, test, uniqueEmail } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const origin = { origin: APP_URL };

/** Compte vérifié ; avec `credits`, un achat du pack Starter (paiement simulé) par l'API, comme le ferait l'écran. */
async function account(page: Page, request: APIRequestContext, credits = true) {
  const email = uniqueEmail('notif');
  await signUpVerified(page, request, email);
  if (credits) {
    const { packs } = await (await page.request.get('/api/catalog/packs')).json();
    const starter = packs.find((p: { name: string }) => p.name === 'Starter');
    const created = await page.request.post('/api/payments', { data: { packId: starter.id, operator: 'MTN', phone: '+242061234567' }, headers: origin });
    const { payment } = await created.json();
    await page.request.post(`/api/payments/${payment.id}/simulate`, { data: { outcome: 'success', callbacks: 1 }, headers: origin });
  }
  return email;
}

/** Lance une affiche par l'API (la mécanique de l'écran est testée ailleurs) ; renvoie la création. */
async function createAffiche(page: Page, prompt: string) {
  const res = await page.request.post('/api/creations', {
    headers: origin,
    multipart: { kind: 'affiche', format: '1:1', consent: 'true', prompt, photo: { name: 'p.png', mimeType: 'image/png', buffer: PNG } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).creation as { id: string; status: string };
}

/** Attend la fin de la création (le fournisseur simulé met quelques secondes ; la consultation fait avancer le suivi). */
async function waitFinished(page: Page, id: string, status: 'COMPLETED' | 'FAILED') {
  await expect(async () => {
    const res = await page.request.get(`/api/creations/${id}`);
    expect((await res.json()).creation.status).toBe(status);
  }).toPass({ timeout: 40_000 });
}

async function outboxSubjects(request: APIRequestContext, email: string): Promise<string[]> {
  const res = await request.get(`${API_URL}/v1/dev/outbox`, { params: { to: email } });
  return ((await res.json()) as { messages: { subject: string }[] }).messages.map((m) => m.subject);
}

const bell = (page: Page) => page.getByRole('button', { name: /^Notifications/ });

test.describe('Notifications', () => {
  test('la cloche : vide au départ, compteur, aperçu, lecture, page complète', async ({ page, request }) => {
    await account(page, request, false);
    await page.goto('/app');
    await expect(bell(page)).toBeVisible();
    await bell(page).click();
    await expect(page.getByText('Aucune notification pour le moment.')).toBeVisible();
    await page.keyboard.press('Escape');

    // Un vrai événement (paiement confirmé) crée la notification.
    const { packs } = await (await page.request.get('/api/catalog/packs')).json();
    const created = await page.request.post('/api/payments', { data: { packId: packs[0].id, operator: 'MTN', phone: '+242061234567' }, headers: origin });
    const { payment } = await created.json();
    await page.request.post(`/api/payments/${payment.id}/simulate`, { data: { outcome: 'success', callbacks: 3 }, headers: origin });

    await page.reload();
    await expect(page.getByRole('button', { name: 'Notifications : 1 non lue' })).toBeVisible();
    await page.getByRole('button', { name: 'Notifications : 1 non lue' }).click();
    // Rejoué 3 fois par le fournisseur : une seule notification.
    await expect(page.getByRole('button', { name: /Paiement confirmé/ })).toHaveCount(1);
    await page.getByRole('button', { name: /Paiement confirmé/ }).click();
    await expect(page).toHaveURL(/\/app\/credits$/);
    await expect(bell(page)).toHaveAccessibleName('Notifications');

    await bell(page).click();
    await page.getByRole('link', { name: 'Voir toutes les notifications' }).click();
    await expect(page).toHaveURL(/\/app\/notifications$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('Tout est lu')).toBeVisible();
  });

  test('une création échouée crée deux notifications (échec et remboursement), à marquer comme lues', async ({ page, request }) => {
    await account(page, request);
    const failed = await createAffiche(page, '__echec__');
    await waitFinished(page, failed.id, 'FAILED');
    await page.goto('/app/notifications');
    await expect(page.getByText('Création échouée')).toBeVisible();
    await expect(page.getByText('Crédits restitués')).toBeVisible();
    // Avec le paiement confirmé de l'achat des crédits : trois notifications non lues.
    await expect(page.getByText('3 non lues')).toBeVisible();

    await page.getByRole('button', { name: /^Marquer comme lue : Création échouée/ }).click();
    await expect(page.getByText('2 non lues')).toBeVisible();
    await page.getByRole('button', { name: 'Tout marquer comme lu' }).click();
    await expect(page.getByText('Tout est lu')).toBeVisible();
  });
});

test.describe('Paramètres et e-mails', () => {
  test('préférences enregistrées par le serveur, restaurées, et appliquées à l’envoi des e-mails', async ({ page, request }) => {
    const email = await account(page, request);
    await page.goto('/app/parametres');
    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();
    const ready = page.getByRole('switch', { name: 'E-mail : Création terminée' });
    // État initial des nouveaux comptes : tout est activé.
    for (const name of ['Création terminée', 'Création échouée', 'Paiement confirmé', 'Crédits remboursés']) {
      await expect(page.getByRole('switch', { name: `E-mail : ${name}` })).toBeChecked();
    }

    // L'interrupteur n'est bloqué qu'un instant, puis la préférence est confirmée par le serveur.
    await expect(async () => {
      await ready.click();
      await expect(page.getByText('Préférence enregistrée.')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15_000 });
    await expect(ready).not.toBeChecked();

    // Persistée : rechargement, autre page, retour.
    await page.reload();
    await expect(page.getByRole('switch', { name: 'E-mail : Création terminée' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'E-mail : Création échouée' })).toBeChecked();

    // Préférence désactivée : la création se termine, la notification interne existe, aucun e-mail « prête ».
    const first = await createAffiche(page, 'Affiche sans e-mail');
    await expect(async () => {
      const res = await page.request.get(`/api/creations/${first.id}`);
      expect((await res.json()).creation.status).toBe('COMPLETED');
    }).toPass({ timeout: 40_000 });
    await page.goto('/app/notifications');
    await expect(page.getByText('Votre création est prête')).toBeVisible();
    expect((await outboxSubjects(request, email)).filter((s) => /prête/.test(s))).toHaveLength(0);

    // Réactivée : l'e-mail part, avec le lien direct vers la création.
    await page.goto('/app/parametres');
    await expect(async () => {
      await page.getByRole('switch', { name: 'E-mail : Création terminée' }).click();
      await expect(page.getByText('Préférence enregistrée.')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15_000 });
    const second = await createAffiche(page, 'Affiche avec e-mail');
    await expect(async () => {
      expect((await page.request.get(`/api/creations/${second.id}`).then((r) => r.json())).creation.status).toBe('COMPLETED');
    }).toPass({ timeout: 40_000 });
    await expect.poll(async () => (await outboxSubjects(request, email)).filter((s) => /prête/.test(s)).length, { timeout: 15_000 }).toBe(1);
  });

  test('l’adresse non confirmée est signalée, et le compte est résumé', async ({ page, request }) => {
    await account(page, request, false);
    await page.goto('/app/parametres');
    await expect(page.getByRole('heading', { level: 2, name: 'Compte' })).toBeVisible();
    await expect(page.getByText('Confirmée')).toBeVisible();
    await expect(page.getByRole('link', { name: /Modifier mon profil/ })).toHaveAttribute('href', '/app/profil');
    // Accessible depuis le menu du compte.
    await page.getByRole('button', { name: /^Menu du compte/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Paramètres' })).toBeVisible();
  });
});

test.describe('Historique des crédits', () => {
  test('vide au départ, puis alimenté par le registre réel (+ en vert, − en rouge)', async ({ page, request }) => {
    await account(page, request, false);
    await page.goto('/app/credits/historique');
    await expect(page.getByRole('heading', { level: 1, name: 'Historique' })).toBeVisible();
    await expect(page.getByText('Aucun mouvement pour le moment.')).toBeVisible();

    const { packs } = await (await page.request.get('/api/catalog/packs')).json();
    const created = await page.request.post('/api/payments', { data: { packId: packs[0].id, operator: 'MTN', phone: '+242061234567' }, headers: origin });
    const { payment } = await created.json();
    await page.request.post(`/api/payments/${payment.id}/simulate`, { data: { outcome: 'success', callbacks: 1 }, headers: origin });
    const failed = await createAffiche(page, '__echec__');
    await waitFinished(page, failed.id, 'FAILED');

    await page.reload();
    const ledger = page.getByRole('table', { name: 'Historique des mouvements de crédits' });
    await expect(ledger.getByRole('row', { name: /Achat de crédits.*\+1\s?250/ })).toBeVisible();
    await expect(ledger.getByRole('row', { name: /Réservé pour une création.*−2/ })).toBeVisible();
    await expect(ledger.getByRole('row', { name: /Crédits restitués.*\+2/ })).toBeVisible();
    // Aucun faux solde : le solde de l'en-tête correspond à la somme des mouvements (1 250 + 250 de bonus).
    await expect(page.getByText(/Solde actuel : 1\s?500 crédits/)).toBeVisible();
  });
});

test.describe('Tendances à la une (décision de l’administrateur)', () => {
  test('mise en avant depuis l’administration, visible côté client, puis retirée', async ({ page, request, browser }, info) => {
    // Un preset par projet : les projets desktop et mobile tournent en parallèle sur la même base.
    const name = info.project.name.includes('mobile') ? 'Pub e2e' : 'Tendance e2e';
    await account(page, request, false);

    const adminCtx = await browser.newContext({ baseURL: APP_URL });
    const admin = await adminCtx.newPage();
    await adminLogin(admin);
    try {
      await admin.goto('/admin/presets');
      const row = admin.getByRole('row').filter({ hasText: name });
      await row.getByRole('button', { name: `Actions pour le preset ${name}` }).click();
      await admin.getByRole('menuitem', { name: 'Mettre à la une' }).click();
      await admin.getByRole('dialog').getByLabel(/Motif/).fill('Sélection éditoriale de test');
      await admin.getByRole('dialog').locator('button[type=submit]').click();
      await expect(admin.getByRole('status').filter({ hasText: 'Modification enregistrée' }).first()).toBeVisible();
      await expect(row.getByText('À la une')).toBeVisible();

      // Côté client : la section « À la une » contient exactement ce choix.
      await page.goto('/app/tendances');
      const featured = page.getByRole('region', { name: 'À la une' });
      await expect(featured.getByRole('link', { name: new RegExp(name) })).toBeVisible();
      // Le même contenu reste dans le catalogue général.
      await expect(page.getByRole('region', { name: 'Toutes les tendances' }).getByRole('link', { name: new RegExp(name) })).toBeVisible();

      // Retrait : publié, mais plus à la une.
      await row.getByRole('button', { name: `Actions pour le preset ${name}` }).click();
      await admin.getByRole('menuitem', { name: 'Retirer de la une' }).click();
      await admin.getByRole('dialog').getByLabel(/Motif/).fill('Fin de la sélection de test');
      await admin.getByRole('dialog').locator('button[type=submit]').click();
      await expect(admin.getByRole('status').filter({ hasText: 'Modification enregistrée' }).first()).toBeVisible();
      await page.reload();
      await expect(page.getByRole('region', { name: 'À la une' }).getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
      await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
    } finally {
      await adminCtx.close();
    }
  });

  test('le serveur refuse la mise à la une à un client', async ({ page, request }) => {
    await account(page, request, false);
    const res = await page.request.patch('/api/admin/presets/00000000-0000-4000-8000-000000000000/featured', {
      data: { featured: true, reason: 'sans droit' },
      headers: origin,
    });
    expect(res.status()).toBe(403);
  });
});
