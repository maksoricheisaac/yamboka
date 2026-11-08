import { adminLogin, expect, signUpVerified, test, uniqueEmail } from './helpers';

test.describe('Catalogue international — administration', () => {
  test('liste paginée des pays, recherche, filtre de statut et fiche d’un pays', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/pays');
    await expect(page.getByRole('heading', { level: 1, name: 'Pays et paiements' })).toBeVisible();
    // 22 pays au total (21 + International), 20 par page : deux pages, total annoncé.
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('1–20 sur 22 résultats');
    await page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Page 2' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('21–22 sur 22 résultats');

    // Changer la taille revient à la première page et conserve le contexte.
    await page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: '50', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('1–22 sur 22 résultats');

    // Recherche côté serveur.
    await page.goto('/admin/pays?q=rwanda');
    await expect(page.getByRole('row', { name: /Rwanda/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('1–1 sur 1 résultat');

    // Statut : filtre côté serveur (CG et CM au minimum).
    await page.goto('/admin/pays?status=ACTIVE');
    await expect(page.getByRole('row', { name: /Congo-Brazzaville/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Rwanda/ })).toHaveCount(0);

    await page.goto('/admin/pays/RW');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rwanda');
    await expect(page.getByRole('row', { name: /MTN MoMo/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Carte bancaire/ })).toContainText('Non activable');
  });

  test('un pays sans tarification ne s’ouvre pas ; avec tarification, il s’ouvre et le moyen « bientôt » reste fermé', async ({ page, browser, baseURL, request }, info) => {
    // Modifie le catalogue partagé par tous les projets : une seule exécution (bureau).
    test.skip(info.project.name !== 'app-desktop', 'catalogue partagé : exécuté une seule fois');
    await adminLogin(page);
    await page.goto('/admin/pays/GH');
    await page.getByRole('button', { name: 'Changer le statut du pays' }).click();
    await page.getByLabel('Nouveau statut').selectOption('ACTIVE');
    await page.getByLabel(/Motif/).fill('Ouverture du Ghana');
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /tarification|prix du crédit/i })).toBeVisible();

    await page.getByRole('button', { name: 'Annuler' }).click().catch(() => undefined);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Configurer la tarification' }).click();
    await page.getByLabel(/Prix d’un crédit/).fill('1');
    await page.getByLabel(/Achat minimum/).fill('10');
    await page.getByLabel(/Achat maximum/).fill('10000');
    await page.getByLabel(/Motif/).fill('Tarification du Ghana');
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText(/1 GHS le crédit/)).toBeVisible();

    await page.getByRole('button', { name: 'Changer le statut du pays' }).click();
    await page.getByLabel('Nouveau statut').selectOption('ACTIVE');
    await page.getByLabel(/Motif/).fill('Ouverture du Ghana');
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText('Actif', { exact: true }).first()).toBeVisible();

    // MTN actif, AirtelTigo « bientôt disponible » : côté client, le second n'est pas sélectionnable.
    await page.getByRole('button', { name: 'Changer le statut de MTN MoMo' }).click();
    await page.getByLabel('Nouveau statut').selectOption('ACTIVE');
    await page.getByLabel(/Motif/).fill('Ouverture de MTN');
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await page.getByRole('button', { name: 'Changer le statut de AirtelTigo Money' }).click();
    await page.getByLabel('Nouveau statut').selectOption('COMING_SOON');
    await page.getByLabel(/Motif/).fill('Bientôt');
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('row', { name: /AirtelTigo/ })).toContainText('Bientôt disponible');

    const customerPage = await browser.newPage({ baseURL: baseURL! });
    await signUpVerified(customerPage, request, uniqueEmail('ghana'));
    await customerPage.goto('/app/credits');
    // Rejoué : juste après le chargement, la page n'est pas forcément « hydratée » et ignorerait le changement.
    await expect(async () => {
      await customerPage.getByLabel('Je paie depuis').selectOption({ label: 'Ghana (GHS)' });
      await expect(customerPage.getByLabel('Je paie depuis')).toHaveValue('GH', { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect(customerPage.getByLabel('MTN MoMo')).toBeEnabled();
    await expect(customerPage.getByLabel(/AirtelTigo/)).toBeDisabled();
    await expect(customerPage.getByText('Bientôt disponible').first()).toBeVisible();
    await customerPage.close();
  });
});

test.describe('Historique client — route canonique', () => {
  test('/app/credits/historique redirige définitivement vers /app/historique en gardant le filtre', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('histo'));
    await page.goto('/app/credits/historique?filtre=achats');
    await expect(page).toHaveURL(/\/app\/historique\?filtre=achats$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Historique' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('0 résultat');
    // La barre latérale pointe vers la nouvelle route.
    await expect(page.locator('a[href="/app/historique"]').first()).toBeAttached();
    await expect(page.locator('a[href="/app/credits/historique"]')).toHaveCount(0);
  });
});
