import type { Page } from '@playwright/test';
import { APP_URL } from '../playwright.config';
import { PASSWORD, expect, logIn, menuLink, openMenuIfHidden, signUpVerified, test, uniqueEmail } from './helpers';

const origin = { origin: APP_URL };
const payButton = (page: Page) => page.getByRole('button', { name: /^Payer/ });
const balance = (page: Page, credits: number) => page.getByLabel(`Solde : ${credits} crédits`);
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Achat du pack Starter par l'API (paiement simulé) : donne 500 crédits + 100 de bonus de premier achat. */
async function buyStarter(page: Page) {
  const { packs } = await (await page.request.get('/api/catalog/packs')).json();
  const starter = packs.find((p: { name: string }) => p.name === 'Starter');
  const created = await page.request.post('/api/payments', { data: { packId: starter.id, operator: 'MTN', phone: '+242061234567' }, headers: origin });
  expect(created.status()).toBe(201);
  const { payment } = await created.json();
  const done = await page.request.post(`/api/payments/${payment.id}/simulate`, { data: { outcome: 'success', callbacks: 1 }, headers: origin });
  expect(done.ok()).toBeTruthy();
  return payment.id as string;
}

test.describe('Navigation de l’espace client', () => {
  test('trois rubriques, six entrées : plus d’Idées, d’Achats, de Notifications ni de Mon profil', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('nav'));
    await openMenuIfHidden(page, menuLink(page, 'Crédits'));
    const sidebar = page.locator('[data-slot="sidebar"]');
    for (const group of ['Mon espace', 'Crédits et transactions', 'Compte']) {
      await expect(sidebar.locator('[data-slot="sidebar-group-label"]', { hasText: group })).toBeVisible();
    }
    // Six entrées de navigation + « Voir le site » en bas.
    await expect(sidebar.getByRole('link', { name: /^(Tableau de bord|Créer|Mes créations|Crédits|Historique|Paramètres)$/ })).toHaveCount(6);
    for (const name of ['Idées', 'Achats', 'Notifications', 'Mon profil']) {
      await expect(menuLink(page, name)).toHaveCount(0);
    }
    await expect(sidebar.getByRole('link', { name: 'Voir le site' })).toBeVisible();
  });

  test('les anciennes adresses mènent au bon onglet, filtre ou page', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('redir'));
    const cases: [string, RegExp][] = [
      ['/app/profil', /\/app\/parametres\?onglet=profil$/],
      ['/app/notifications', /\/app\/parametres\?onglet=notifications$/],
      ['/app/achats', /\/app\/historique\?filtre=achats$/],
      ['/app/credits/historique?filtre=bonus', /\/app\/historique\?filtre=bonus$/],
      ['/app/tendances', /\/app\/creer$/],
    ];
    for (const [from, to] of cases) {
      await page.goto(from);
      await expect(page).toHaveURL(to);
    }
  });

  test('sur mobile : la barre du bas propose Accueil, Créer, Créations, Crédits et Compte', async ({ page, request, isMobile }) => {
    test.skip(!isMobile, 'La barre du bas ne concerne que les petits écrans.');
    await signUpVerified(page, request, uniqueEmail('tabs'));
    const tabs = page.getByRole('navigation', { name: 'Navigation principale' });
    for (const name of ['Accueil', 'Créer', 'Créations', 'Crédits', 'Compte']) {
      await expect(tabs.getByRole('link', { name })).toBeVisible();
    }
    await expect(tabs.getByRole('link', { name: 'Idées' })).toHaveCount(0);
    await tabs.getByRole('link', { name: 'Compte' }).click();
    await expect(page).toHaveURL(/\/app\/parametres/);
  });
});

test.describe('Tableau de bord et Créer : deux rôles distincts', () => {
  test('le tableau de bord résume l’activité et ne contient pas le studio ; Créer ne contient que la création', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('roles'), { firstName: 'Awa' });
    await buyStarter(page);

    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Awa');
    await expect(page.getByText(/600/).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Activité du compte' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Mes dernières créations' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Dernières transactions' })).toBeVisible();
    // Un accès rapide à la création, mais aucun studio ici : ni champ photo ni bouton « Générer ».
    await expect(page.getByRole('link', { name: 'Créer une vidéo' })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Générer/ })).toHaveCount(0);
    // Les dernières transactions sont les vraies : l'achat et son bonus.
    const tx = page.getByRole('heading', { level: 2, name: 'Dernières transactions' }).locator('xpath=ancestor::section[1]');
    await expect(tx.getByText('Achat de crédits')).toBeVisible();
    await expect(tx.getByText('Bonus de premier achat')).toBeVisible();

    await page.getByRole('link', { name: 'Créer une vidéo' }).click();
    await expect(page).toHaveURL(/\/app\/creer$/);
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Activité du compte' })).toHaveCount(0);
  });

  test('un compte neuf voit des états vides utiles, pas de tableau vide', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('vide'));
    await page.goto('/app');
    await expect(page.getByText('Aucune transaction pour le moment.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Acheter des crédits' }).first()).toBeVisible();
  });
});

test.describe('Paramètres : un espace de gestion du compte', () => {
  const tabLink = (page: Page, name: string) => page.getByRole('navigation', { name: 'Sections des paramètres' }).getByRole('link', { name });

  test('quatre onglets, chacun avec son contenu, atteignables par leur adresse', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('onglets'), { firstName: 'Marie' });
    await page.goto('/app/parametres');
    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();
    for (const name of ['Profil', 'Notifications', 'Sécurité', 'Préférences']) {
      await expect(tabLink(page, name)).toBeVisible();
    }
    // Profil (par défaut)
    await expect(tabLink(page, 'Profil')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByLabel('Prénom')).toHaveValue('Marie');

    await tabLink(page, 'Notifications').click();
    await expect(page).toHaveURL(/onglet=notifications$/);
    await expect(page.getByRole('switch', { name: 'E-mail : Création terminée' })).toBeChecked();
    await expect(page.getByRole('heading', { level: 2, name: 'Mes notifications' })).toBeVisible();

    await tabLink(page, 'Sécurité').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Mot de passe' })).toBeVisible();
    await expect(page.getByLabel('Mot de passe actuel')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Appareils connectés' })).toBeVisible();
    await expect(page.getByText('Cet appareil')).toBeVisible();
    await expect(page.getByText('Aucun autre appareil n’est connecté.')).toBeVisible();

    await tabLink(page, 'Préférences').click();
    await expect(page.getByRole('heading', { level: 2, name: 'Langue' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Apparence' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Pays de paiement' })).toBeVisible();
  });

  test('le profil et une préférence de notification s’enregistrent depuis les paramètres', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('maj'), { firstName: 'Marie' });
    await page.goto('/app/parametres?onglet=profil');
    await page.getByLabel('Prénom').fill('Mariam');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Profil enregistré.')).toBeVisible();

    await page.goto('/app/parametres?onglet=notifications');
    const sw = page.getByRole('switch', { name: 'E-mail : Crédits remboursés' });
    await expect(async () => {
      await sw.click();
      await expect(page.getByText('Préférence enregistrée.')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole('switch', { name: 'E-mail : Crédits remboursés' })).not.toBeChecked();
  });

  test('sécurité : « Déconnecter mes autres appareils » demande confirmation et ferme les autres sessions', async ({ page, request, browser, baseURL }) => {
    const email = uniqueEmail('appareils');
    await signUpVerified(page, request, email);
    // Seconde session : le même compte sur un autre navigateur.
    const other = await browser.newContext({ baseURL: baseURL! });
    const second = await other.newPage();
    await second.context().setExtraHTTPHeaders({ 'x-forwarded-for': '10.88.88.88' });
    await logIn(second, email, PASSWORD);
    await expect(second).toHaveURL(/\/app/);

    await page.goto('/app/parametres?onglet=securite');
    const revoke = page.getByRole('button', { name: 'Déconnecter mes autres appareils' });
    await expect(revoke).toBeEnabled();
    await revoke.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Déconnecter les autres appareils ?');
    // Annuler ne change rien.
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toBeHidden();
    await expect((await second.request.get('/api/auth/me')).status()).toBe(200);

    await revoke.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Déconnecter', exact: true }).click();
    await expect(page.getByText('Aucun autre appareil n’est connecté.')).toBeVisible();
    await expect((await second.request.get('/api/auth/me')).status()).toBe(401);
    await expect((await page.request.get('/api/auth/me')).status()).toBe(200);
    await other.close();
  });

  test('préférences : le pays choisi est retenu pour l’achat de crédits', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('pays'));
    await page.goto('/app/parametres?onglet=preferences');
    await page.getByRole('combobox', { name: 'Pays de paiement' }).selectOption('CM');
    await expect(page.getByText('Pays enregistré.')).toBeVisible();
    await page.goto('/app/credits');
    await expect(page.getByLabel('Je paie depuis')).toHaveValue('CM');
  });
});

test.describe('Historique unifié', () => {
  const filter = (page: Page, name: string) => page.getByRole('navigation', { name: 'Filtrer l’historique' }).getByRole('link', { name });

  test('filtres : toutes les opérations, achats, générations, remboursements, bonus — avec reçu pour chaque achat', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('hist'));
    const paymentId = await buyStarter(page);

    await page.goto('/app/historique');
    for (const name of ['Toutes les opérations', 'Achats', 'Générations', 'Remboursements', 'Bonus et ajustements']) {
      await expect(filter(page, name)).toBeVisible();
    }
    await expect(filter(page, 'Toutes les opérations')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('listitem').filter({ hasText: 'Achat de crédits' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Bonus de premier achat' })).toBeVisible();

    await filter(page, 'Achats').click();
    await expect(page).toHaveURL(/filtre=achats$/);
    const purchase = page.getByRole('listitem').filter({ hasText: 'Starter' });
    await expect(purchase.getByText('Réussi')).toBeVisible();
    await expect(purchase).toContainText('MTN MoMo');
    await expect(purchase).toContainText(/5\s?000 FCFA/);
    await purchase.getByRole('link', { name: /Voir le reçu/ }).click();
    await expect(page).toHaveURL(new RegExp(`/app/credits/recu/${paymentId}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('YAM-');
    await expect(page.getByText('République du Congo').or(page.getByText('Congo'))).toBeVisible();

    await page.goto('/app/historique?filtre=bonus');
    await expect(page.getByRole('listitem').filter({ hasText: 'Bonus de premier achat' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Achat de crédits' })).toHaveCount(0);

    await page.goto('/app/historique?filtre=generations');
    await expect(page.getByText('Aucune création n’a encore utilisé de crédits.')).toBeVisible();
    await page.goto('/app/historique?filtre=remboursements');
    await expect(page.getByText(/Aucun remboursement/)).toBeVisible();
  });

  test('un reçu depuis l’ancienne adresse /app/achats/:id continue de fonctionner', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('recu'));
    const id = await buyStarter(page);
    await page.goto(`/app/achats/${id}`);
    await expect(page).toHaveURL(new RegExp(`/app/credits/recu/${id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('YAM-');
  });
});

test.describe('Achat de crédits : quantité libre et pays', () => {
  test('achat à la carte : le montant se calcule en direct, le serveur le recalcule, aucun bonus', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('carte'));
    await page.goto('/app/credits');
    await expect(payButton(page)).toBeEnabled();
    await page.getByText('Choisir la quantité').click();

    const credits = page.getByLabel('Nombre de crédits');
    // Sous le minimum : message clair, paiement impossible.
    await credits.fill('10');
    await expect(page.getByText(/Choisissez entre 50 et 50\s?000 crédits/)).toBeVisible();
    await expect(payButton(page)).toBeDisabled();

    await credits.fill('100');
    await expect(page.getByText(/100 crédits.*à payer : 1\s?000 FCFA/)).toBeVisible();
    await expect(page.getByText(/Solde : 0 → 100 crédits/)).toBeVisible();

    await page.getByLabel('MTN MoMo').check();
    await page.getByLabel('Numéro qui paie').fill('242061234567');
    await payButton(page).click();
    await expect(page).toHaveURL(/\/app\/credits\/paiement\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Crédits sur mesure')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer le paiement', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement confirmé');
    // Exactement la quantité achetée : pas de bonus de premier achat sur un achat à la carte.
    await expect(balance(page, 100)).toBeVisible();
  });

  test('un montant envoyé par le navigateur n’est jamais cru : le serveur facture sa propre valeur', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('serveur'));
    const res = await page.request.post('/api/payments', {
      headers: origin,
      data: { credits: 100, amount: 1, amountFcfa: 1, network: 'mtn_cg', phone: '+242061234567' },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).payment).toMatchObject({ amountFcfa: 1000, credits: 100, custom: true });
    const tooLow = await page.request.post('/api/payments/quote', { headers: origin, data: { credits: 1, network: 'mtn_cg' } });
    expect(tooLow.status()).toBe(422);
  });

  test('autre pays : les moyens de paiement et l’indicatif suivent le pays, jusqu’au suivi du paiement', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('cameroun'));
    await page.goto('/app/credits');
    await expect(payButton(page)).toBeEnabled();
    await expect(page.getByLabel('MTN MoMo')).toBeVisible();
    await expect(page.getByLabel('Airtel Money')).toBeVisible();

    await page.getByLabel('Je paie depuis').selectOption('CM');
    await expect(page.getByLabel('Orange Money')).toBeVisible();
    await expect(page.getByLabel('MTN MoMo')).toBeVisible();
    await expect(page.getByLabel('Airtel Money')).toHaveCount(0);
    await expect(page.getByText(/Numéro Cameroun \(\+237\)/)).toBeVisible();

    await page.locator('label', { hasText: 'Starter' }).first().click();
    await page.getByLabel('Orange Money').check();
    await page.getByLabel('Numéro qui paie').fill('670123456');
    await payButton(page).click();
    await expect(page).toHaveURL(/\/app\/credits\/paiement\/[0-9a-f-]{36}$/);
    await expect(page.getByText(/\(Orange Money\)/)).toBeVisible();
    await page.getByRole('button', { name: 'Confirmer le paiement', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement confirmé');
    await expect(balance(page, 600)).toBeVisible();

    // L'historique et le reçu portent le pays et le moyen de paiement réels.
    await page.goto('/app/historique?filtre=achats');
    await expect(page.getByRole('listitem').filter({ hasText: 'Starter' })).toContainText('Orange Money');
  });
});

test.describe('Responsive : aucun débordement sur les écrans de l’espace client', () => {
  test('tableau de bord, crédits, historique et paramètres (tous onglets)', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('resp'));
    await buyStarter(page);
    const paths = [
      '/app',
      '/app/credits',
      '/app/historique',
      '/app/historique?filtre=achats',
      '/app/parametres?onglet=profil',
      '/app/parametres?onglet=notifications',
      '/app/parametres?onglet=securite',
      '/app/parametres?onglet=preferences',
    ];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await overflow(page), `${path} déborde`).toBeLessThanOrEqual(0);
    }
  });
});
