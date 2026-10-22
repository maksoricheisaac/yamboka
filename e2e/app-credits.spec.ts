import type { APIRequestContext, Page } from '@playwright/test';
import { APP_URL } from '../playwright.config';
import { appAlerts, expect, signUp, test, tokenFor, uniqueEmail } from './helpers';

/** Inscrit un compte, confirme son e-mail (lien lu dans l'outbox de l'API de test) et ouvre la page des crédits. */
async function verifiedOnCreditsPage(page: Page, request: APIRequestContext, firstName = 'Marie') {
  const email = uniqueEmail('credits');
  await signUp(page, email, { firstName });
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(`/verifier-email?token=${await tokenFor(request, email)}`);
  await page.getByRole('button', { name: 'Confirmer mon adresse e-mail' }).click();
  await expect(page.getByText('Votre adresse e-mail est confirmée')).toBeVisible();
  await page.goto('/app/credits');
  await expect(page.getByRole('heading', { level: 1, name: 'Mes crédits' })).toBeVisible();
  return email;
}

async function choosePack(page: Page, pack: string, phone = '242061234567') {
  await expect(page.getByRole('button', { name: /^Payer/ })).toBeEnabled();
  await page.locator('label', { hasText: pack }).first().click();
  await page.getByLabel('MTN Mobile Money').check();
  await page.getByLabel('Numéro qui paie').fill(phone);
}

async function startPayment(page: Page, pack = 'Créateur') {
  await choosePack(page, pack);
  await page.getByRole('button', { name: /^Payer/ }).click();
  await expect(page).toHaveURL(/\/app\/credits\/paiement\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('En attente de votre confirmation');
}

const balance = (page: Page, credits: number) => page.getByLabel(`Solde : ${credits} crédits`);
const simulate = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

test.describe('Achat de crédits (paiement simulé)', () => {
  test('parcours complet : choix du pack, attente, confirmation, solde, historique, reçu', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await expect(balance(page, 4)).toBeVisible();
    // 4 crédits × 25 FCFA. Le texte existe aussi dans l'en-tête, masqué sur mobile : on cible l'élément visible.
    await expect(page.getByText('≈ 100 FCFA').filter({ visible: true }).first()).toBeVisible();

    // Le prix et les crédits sont annoncés avant de payer.
    await choosePack(page, 'Créateur');
    await expect(page.getByText(/Vous payez\s*2\s?500 FCFA et recevez\s*103 crédits/)).toBeVisible();
    await page.getByRole('button', { name: /^Payer/ }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('En attente de votre confirmation');
    await expect(page.getByText('Mode simulation')).toBeVisible();
    await expect(balance(page, 4)).toBeVisible(); // rien n'est crédité avant confirmation

    await simulate(page, 'Confirmer le paiement').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement confirmé');
    await expect(page.getByText(/103 crédits/).first()).toBeVisible();
    await expect(balance(page, 107)).toBeVisible();

    await page.getByRole('link', { name: 'Retour à mes crédits' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mes crédits' })).toBeVisible();
    const ledger = page.getByRole('table', { name: 'Historique des mouvements de crédits' });
    await expect(ledger.getByRole('row', { name: /Achat de crédits.*\+100/ })).toBeVisible();
    await expect(ledger.getByRole('row', { name: /Bonus du pack.*\+3/ })).toBeVisible();
    await expect(ledger.getByRole('row', { name: /Crédits de bienvenue.*\+4/ })).toBeVisible();

    await page.getByRole('link', { name: 'Achats', exact: true }).click();
    const row = page.getByRole('row', { name: /Créateur/ });
    await expect(row.getByText('Réussi')).toBeVisible();
    await row.getByRole('link', { name: /Reçu/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('YAM-');
    await expect(page.getByText(/2\s500 FCFA/).first()).toBeVisible();
    await expect(page.getByText(/Reçu de\s*démonstration/)).toBeVisible();
  });

  test('paiement refusé : message clair, aucun crédit, possibilité de réessayer', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await startPayment(page);
    await simulate(page, 'Refuser').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement échoué');
    await expect(page.getByText(/Aucun crédit n’a été ajouté/)).toBeVisible();
    await expect(balance(page, 4)).toBeVisible();
    await page.getByRole('link', { name: 'Réessayer' }).click();
    await expect(page).toHaveURL(/\/app\/credits$/);
  });

  test('paiement annulé : aucun crédit', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await startPayment(page);
    await simulate(page, 'Annuler').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement annulé');
    await expect(balance(page, 4)).toBeVisible();
  });

  test('callbacks dupliqués : les crédits ne sont ajoutés qu’une fois (recette)', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await startPayment(page);
    await simulate(page, 'Succès avec 3 callbacks').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement confirmé');
    await expect(balance(page, 107)).toBeVisible();
    await page.reload();
    await expect(balance(page, 107)).toBeVisible();
  });

  test('faux callback : rien n’est crédité tant que le fournisseur ne confirme pas (recette)', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await startPayment(page);
    await simulate(page, 'Faux callback').click();
    await expect(page.getByText(/Simulation envoyée/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('En attente de votre confirmation');
    await expect(balance(page, 4)).toBeVisible();
    // Le vrai paiement aboutit ensuite normalement.
    await simulate(page, 'Confirmer le paiement').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement confirmé');
    await expect(balance(page, 107)).toBeVisible();
  });

  test('panne du fournisseur : le paiement reste en attente, puis aboutit au retour du service', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await startPayment(page);
    await simulate(page, 'Panne du fournisseur').click();
    await expect(page.getByText(/Simulation envoyée/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('En attente de votre confirmation');
    await simulate(page, 'Confirmer le paiement').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement confirmé');
  });

  test('l’écran se met à jour tout seul quand la confirmation arrive sans action sur la page (UF-23)', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await startPayment(page);
    const id = page.url().split('/').pop()!;
    // La confirmation arrive « du dehors » : on la déclenche par l'API, sans toucher à la page.
    const res = await page.request.post(`${APP_URL}/api/payments/${id}/simulate`, {
      headers: { origin: APP_URL },
      data: { outcome: 'success', callbacks: 1 },
    });
    expect(res.ok()).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement confirmé', { timeout: 15_000 });
    await expect(balance(page, 107)).toBeVisible();
  });

  test('fournisseur indisponible dès le départ : message clair, aucun paiement ouvert', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await choosePack(page, 'Mini', '242099999999');
    await page.getByRole('button', { name: /^Payer/ }).click();
    await expect(appAlerts(page)).toContainText('momentanément indisponible');
    await expect(appAlerts(page)).toContainText('Aucun montant n’a été débité');
    await expect(page).toHaveURL(/\/app\/credits$/);
    await expect(balance(page, 4)).toBeVisible();
  });

  test('les erreurs de saisie s’affichent en français', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await expect(page.getByRole('button', { name: /^Payer/ })).toBeEnabled();
    await page.getByLabel('Numéro qui paie').fill('0612345678');
    await page.getByRole('button', { name: /^Payer/ }).click();
    await expect(page.getByText('Choisissez MTN ou Airtel.')).toBeVisible();
    await expect(page.getByText(/Numéro invalide/)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/credits$/);
  });

  test('un compte dont l’e-mail n’est pas vérifié ne peut pas payer', async ({ page }) => {
    await signUp(page, uniqueEmail('nonverifie'));
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/app/credits');
    await expect(page.getByText(/Confirmez d’abord votre adresse e-mail/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Payer/ })).toBeDisabled();
  });

  test('le paiement d’un autre utilisateur est introuvable', async ({ page, request, browser }) => {
    await verifiedOnCreditsPage(page, request);
    await startPayment(page);
    const url = page.url();

    const other = await browser.newContext({ baseURL: APP_URL });
    const stranger = await other.newPage();
    await stranger.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.99.99.99' });
    await signUp(stranger, uniqueEmail('intrus'));
    await expect(stranger).toHaveURL(/\/app$/);
    // La page est diffusée en streaming : le statut HTTP est déjà parti (200) quand le serveur découvre que
    // le paiement n'est pas à lui. Ce qui compte : aucune donnée du paiement ne doit apparaître.
    await stranger.goto(url);
    await expect(stranger.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
    const html = await stranger.content();
    expect(html).not.toContain('MOCK-');
    expect(html).not.toContain('2 500');
    expect(html).not.toContain('242061234567');
    await other.close();
  });

  test('un visiteur est renvoyé vers la connexion depuis les pages d’achat', async ({ page }) => {
    for (const path of ['/app/credits', '/app/achats']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/connexion/);
    }
  });

  test('historique des achats vide : message et lien pour acheter', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await page.goto('/app/achats');
    await expect(page.getByText('Vous n’avez encore rien acheté.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Acheter des crédits' })).toBeVisible();
  });
});

test.describe('Responsive et accessibilité des écrans de crédits', () => {
  test('crédits, paiement et achats : aucun défilement horizontal, un seul h1', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await expect(page.locator('h1:visible')).toHaveCount(1);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await startPayment(page);
    await expect(page.locator('h1:visible')).toHaveCount(1);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await simulate(page, 'Confirmer le paiement').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement confirmé');
    await page.goto('/app/achats');
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test('le choix du pack et de l’opérateur se fait au clavier', async ({ page, request }) => {
    await verifiedOnCreditsPage(page, request);
    await expect(page.getByRole('button', { name: /^Payer/ })).toBeEnabled();
    await page.getByRole('radio', { name: /Mini/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('radio', { name: /Mini/ })).toBeChecked();
    await page.getByLabel('Airtel Money').focus();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('Airtel Money')).toBeChecked();
    await expect(page.getByText(/Vous payez\s*500 FCFA et recevez\s*20 crédits/)).toBeVisible();
  });
});
