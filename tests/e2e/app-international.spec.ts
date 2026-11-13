import { adminLogin, expect, signUpVerified, test, uniqueEmail } from './helpers';

test.describe('Catalogue international — administration', () => {
  test('liste paginée des pays, recherche, filtre de statut et fiche d’un pays', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/pays');
    await expect(page.getByRole('heading', { level: 1, name: 'Pays et paiements' })).toBeVisible();
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    // 22 pays au total (21 + International), 20 par page : deux pages, total annoncé.
    await expect(pager).toContainText('22 résultats');
    await expect(pager).toContainText('Page 1 sur 2');
    await expect(pager.getByRole('button', { name: 'Page précédente' })).toBeDisabled();

    await pager.getByRole('button', { name: 'Page suivante' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(pager).toContainText('Page 2 sur 2');
    await expect(pager.getByRole('button', { name: 'Page suivante' })).toBeDisabled();

    await pager.getByRole('button', { name: 'Première page' }).click();
    await expect(page).not.toHaveURL(/page=2/);

    // Changer la taille revient à la première page et tient dans une seule page.
    await pager.getByLabel('Lignes par page').selectOption('50');
    await expect(pager).toContainText('Page 1 sur 1');
    await expect(page).toHaveURL(/pageSize=50/);

    // Indicateurs : calculés sur tout le catalogue, pas sur la page affichée.
    await expect(page.getByText('Pays', { exact: false }).first()).toBeVisible();

    // Recherche depuis la barre d’outils : le critère part dans l’adresse.
    await page.goto('/admin/pays');
    await page.getByLabel('Nom, code ISO ou devise').fill('rwanda');
    await page.getByLabel('Nom, code ISO ou devise').press('Enter');
    await expect(page).toHaveURL(/q=rwanda/);
    await expect(page.getByRole('row', { name: /Rwanda/ })).toBeVisible();
    await expect(pager).toContainText('1 résultat');

    // Critères combinés : la recherche et le statut s’additionnent, et l’indicateur les compte.
    await page.getByLabel('Statut').selectOption('ACTIVE');
    await expect(page).toHaveURL(/status=ACTIVE/);
    await expect(page.getByText('2 critères actifs')).toBeVisible();
    await expect(page.getByText('Aucun résultat pour ces critères.')).toBeVisible();

    // Réinitialisation : tous les critères partent de l’adresse d’un coup.
    await page.getByRole('button', { name: 'Réinitialiser' }).click();
    await expect(page).not.toHaveURL(/q=rwanda/);
    await expect(page).not.toHaveURL(/status=ACTIVE/);
    await expect(pager).toContainText('22 résultats');

    // Tri servi par la base : il porte sur tout le catalogue et se lit dans l’adresse.
    await page.getByRole('button', { name: 'Trier par Pays' }).or(page.getByRole('button', { name: 'Pays', exact: true })).first().click();
    await expect(page).toHaveURL(/sort=name&dir=asc/);

    // Colonnes masquables.
    await page.getByRole('button', { name: 'Colonnes' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Devise' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('columnheader', { name: 'Devise' })).toHaveCount(0);

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
    await page.getByRole('button', { name: 'Changer le statut de AirtelTigo' }).click();
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
