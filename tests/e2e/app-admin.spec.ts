import type { Browser, Page } from '@playwright/test';
import { PASSWORD, adminLogin, appAlerts, expect, logIn, signUpVerified, test, uniqueEmail } from './helpers';

/** Ouvre la fiche d'un client depuis la liste des utilisateurs, comme le ferait un administrateur. */
async function openCustomer(page: Page, email: string) {
  await page.goto(`/admin/utilisateurs?q=${encodeURIComponent(email)}`);
  await page.getByRole('link', { name: `Ouvrir la fiche de ${email}` }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Marie');
}

async function newCustomer(browser: Browser, baseURL: string, request: Parameters<typeof signUpVerified>[1]) {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.9` });
  const email = uniqueEmail('client-admin');
  await signUpVerified(page, request, email, { firstName: 'Marie' });
  return { ctx, page, email };
}

test.describe('Administration — actions réelles', () => {
  test('rechercher un client, ajuster ses crédits avec un motif, voir la trace dans le journal', async ({ page, browser, request, baseURL }) => {
    const customer = await newCustomer(browser, baseURL!, request);
    await adminLogin(page);
    await openCustomer(page, customer.email);
    await expect(page.getByText('0 crédit', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Ajuster les crédits' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Nombre de crédits/).fill('10');
    // Sans motif : refusé par le navigateur (champ requis) puis par l'API.
    await dialog.getByLabel(/Motif/).fill('Geste commercial après incident');
    await dialog.getByRole('button', { name: 'Appliquer l’ajustement' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('10 crédits')).toBeVisible();

    // Le client voit son nouveau solde.
    await customer.page.reload();
    await expect(customer.page.getByLabel('Solde : 10 crédits')).toBeVisible();

    await page.goto('/admin/audit?q=credits.adjust');
    await expect(page.getByRole('row', { name: /credits\.adjust.*Geste commercial après incident/ }).first()).toBeVisible();
    await customer.ctx.close();
  });

  test('suspendre un client : motif obligatoire, accès coupé, réactivation possible', async ({ page, browser, request, baseURL }) => {
    const customer = await newCustomer(browser, baseURL!, request);
    await adminLogin(page);
    await openCustomer(page, customer.email);

    await page.getByRole('button', { name: 'Suspendre' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Motif/).fill('ok');
    await dialog.getByRole('button', { name: 'Suspendre' }).click();
    await expect(appAlerts(dialog).or(dialog.getByText(/au moins 5 caractères/)).first()).toBeVisible();

    await dialog.getByLabel(/Motif/).fill('Signalement répété de contenu abusif');
    await dialog.getByRole('button', { name: 'Suspendre' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Suspendu').first()).toBeVisible();

    // Le client est déconnecté et ne peut plus se reconnecter.
    await customer.page.goto('/app');
    await expect(customer.page).toHaveURL(/\/connexion/);
    await logIn(customer.page, customer.email, PASSWORD);
    await expect(appAlerts(customer.page)).toContainText('suspendu');

    await page.getByRole('button', { name: 'Réactiver' }).click();
    await page.getByRole('dialog').getByLabel(/Motif/).fill('Erreur de modération corrigée');
    await page.getByRole('dialog').getByRole('button', { name: 'Réactiver' }).click();
    await expect(page.getByRole('button', { name: 'Suspendre' })).toBeVisible();
    await logIn(customer.page, customer.email, PASSWORD);
    await expect(customer.page).toHaveURL(/\/app$/);
    await customer.ctx.close();
  });

  test('offre publique limitée à trois packs : une quatrième publication est refusée avec un message clair', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/packs');
    await expect(page.getByRole('heading', { name: /Offre affichée sur les pages publiques \(3\/3\)/ })).toBeVisible();
    // Les trois packs de lancement sont publics : on crée un quatrième pack, on l'active, puis on tente de le publier.
    const packName = `Quatrième ${Date.now()}`; // les projets de test partagent la base : un nom par exécution
    await page.getByRole('button', { name: 'Nouveau pack' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Nom').fill(packName);
    await form.getByLabel('Prix (FCFA)').fill('7000');
    await form.getByLabel('Crédits de base').fill('1700');
    await form.getByLabel(/Motif/).fill('Pack de test');
    await form.getByRole('button', { name: 'Créer le pack' }).click();
    // Le tableau est paginé : on retrouve le pack par la recherche plutôt que par sa position.
    await page.getByRole('searchbox', { name: 'Recherche' }).fill(packName);
    const fourth = page.getByRole('row', { name: packName });
    const rowMenu = fourth.getByRole('button', { name: `Actions pour le pack ${packName}` });
    await rowMenu.click();
    await page.getByRole('menuitem', { name: 'Activer' }).click();
    await page.getByRole('dialog').getByLabel(/Motif/).fill('Activation du pack de test');
    await page.getByRole('dialog').getByRole('button', { name: 'Activer' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await rowMenu.click();
    await page.getByRole('menuitem', { name: 'Publier sur les pages publiques' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Motif/).fill('Essai de quatrième offre');
    await dialog.getByRole('button', { name: 'Publier' }).click();
    await expect(appAlerts(dialog)).toContainText('Trois offres publiques au maximum');
  });

  test('le tableau de bord affiche des données réelles ou un état vide explicite', async ({ page }) => {
    await adminLogin(page);
    await expect(page.getByText('Inscrits sur la période', { exact: true }).first()).toBeVisible();
    // Les tests de création partagent cette base : le tableau de bord montre soit l'état vide, soit les chiffres réels.
    await expect(page.getByRole('heading', { name: 'Générations' })).toBeVisible();
    await expect(page.getByText(/Aucune génération sur la période|Réussies|Échouées/).first()).toBeVisible();
    await expect(page.getByText(/Non calculable|Solde estimé/).first()).toBeVisible();
  });

  test('le sélecteur de période recalcule le tableau de bord, raccourci puis période personnalisée', async ({ page }) => {
    await adminLogin(page);
    await page.getByRole('button', { name: /30 derniers jours/ }).click();
    await page.getByRole('button', { name: 'Aujourd’hui' }).click();
    await expect(page).toHaveURL(/\/admin\?from=(\d{4}-\d{2}-\d{2})&to=\1$/);
    await expect(page.getByRole('button', { name: /Aujourd’hui/ })).toBeVisible();

    // Période personnalisée au calendrier : le début et la fin se choisissent en deux clics, les jours futurs sont inactifs.
    await page.getByRole('button', { name: /Aujourd’hui/ }).click();
    const today = await page.evaluate(() => new Date(Date.now() + 3600_000).getUTCDate());
    const day = (n: number) => page.getByRole('dialog').getByRole('button', { name: new RegExp(String.raw`(^|\D)${n}(\D|$)`) });
    await day(1).first().click();
    await day(today).first().click();
    await page.getByRole('button', { name: 'Appliquer' }).click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('button', { name: /Période personnalisée|Ce mois-ci/ })).toBeVisible();
  });

  test('le journal d’audit est consultable et filtrable', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/audit');
    await expect(page.getByRole('table', { name: 'Journal d’audit' })).toBeVisible();
    await page.getByLabel('Action, entité ou acteur').fill('inexistant-xyz');
    await page.getByRole('button', { name: 'Filtrer' }).click();
    await expect(page.getByText('Aucune entrée')).toBeVisible();
  });
});
