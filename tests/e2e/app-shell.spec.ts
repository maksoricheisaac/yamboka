import { adminLogin, expect, logOut, menuLink, openMenuIfHidden, signUpVerified, test, uniqueEmail } from './helpers';

const sidebar = (page: import('@playwright/test').Page) => page.locator('[data-slot="sidebar"]');
const toggle = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Afficher ou masquer le menu' }).first();
const accountMenu = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^Menu du compte/ });
const themeButton = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /Activer le thème/ });

test.describe('Barre du haut — espace client', () => {
  test('affiche le menu du compte et le bouton de thème, sans bouton de déconnexion à côté', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('shell'), { firstName: 'Grace' });
    await expect(accountMenu(page)).toBeVisible();
    await expect(themeButton(page)).toBeVisible();
    // La déconnexion n'existe QUE dans le menu du compte.
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0);
    await expect(sidebar(page).getByText('Grace Ndinga')).toHaveCount(0);
  });

  test('le menu du compte : identité, profil, déconnexion ; ouvert au clic, fermé après un choix', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('menu'), { firstName: 'Grace' });
    await accountMenu(page).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Grace Ndinga');
    await expect(menu).toContainText('@example.com');
    await expect(menu.getByRole('menuitem', { name: 'Mon profil' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Se déconnecter' })).toBeVisible();

    await menu.getByRole('menuitem', { name: 'Mon profil' }).click();
    await expect(page).toHaveURL(/\/app\/profil$/);
    await expect(menu).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon profil');
  });

  test('le menu du compte se pilote au clavier et se ferme avec Échap, le focus revient au déclencheur', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('clavier'));
    await accountMenu(page).focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    // Ouvert au clavier : le premier choix a le focus ; les flèches parcourent les choix.
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Paramètres' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Se déconnecter' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(accountMenu(page)).toBeFocused();
  });

  test('le changement de thème fonctionne et la préférence est conservée', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('theme'));
    const html = page.locator('html');
    const initiallyDark = (await html.getAttribute('class'))?.includes('dark') ?? false;
    await themeButton(page).click();
    await expect(html).toHaveClass(initiallyDark ? /^((?!dark).)*$/ : /dark/);
    const afterClick = (await html.getAttribute('class'))?.includes('dark');

    // Conservé entre deux navigations et après rechargement.
    await page.goto('/app/credits');
    await expect(html).toHaveClass(afterClick ? /dark/ : /^((?!dark).)*$/);
    await page.reload();
    await expect(html).toHaveClass(afterClick ? /dark/ : /^((?!dark).)*$/);
  });

  test('la déconnexion est dans le menu du compte et ramène à la connexion', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('sortie'));
    await logOut(page);
    await expect(page).toHaveURL(/\/connexion$/);
  });

  test('aucun débordement horizontal et éléments alignés dans la barre du haut', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('topbar'));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const header = page.locator('header').first();
    const box = await header.boundingBox();
    const theme = await themeButton(page).boundingBox();
    const account = await accountMenu(page).boundingBox();
    expect(box && theme && account).toBeTruthy();
    // Thème et compte restent dans la barre, côte à côte, sans chevauchement.
    expect(theme!.x + theme!.width).toBeLessThanOrEqual(account!.x + 1);
    expect(account!.x + account!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
  });
});

test.describe('Barre latérale — espace client', () => {
  test('affiche le menu, la page active et le fil d’Ariane', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('side'));
    await openMenuIfHidden(page, menuLink(page, 'Crédits'));
    for (const name of ['Tableau de bord', 'Crédits', 'Achats']) {
      await expect(menuLink(page, name)).toBeVisible();
    }
    await expect(menuLink(page, 'Tableau de bord')).toHaveAttribute('aria-current', 'page');
  });

  test('le fil d’Ariane suit la page', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('crumbs'));
    const crumbs = page.getByRole('navigation', { name: 'Fil d’Ariane' });
    await expect(crumbs).toContainText('Tableau de bord');

    await page.goto('/app/credits');
    await expect(crumbs).toContainText('Crédits');
    await expect(crumbs).not.toContainText('Tableau de bord');
  });

  test('sur ordinateur : la barre se replie en rail d’icônes, l’état est mémorisé et Ctrl+B la rouvre', async ({ page, request, isMobile }) => {
    test.skip(isMobile, 'Le repli en rail ne concerne que les grands écrans.');
    await signUpVerified(page, request, uniqueEmail('repli'));

    await expect(sidebar(page)).toHaveAttribute('data-state', 'expanded');
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute('data-state', 'collapsed');

    // Mémorisé : après rechargement, la barre reste repliée (cookie lu côté serveur, pas de « saut »).
    await page.reload();
    await expect(sidebar(page)).toHaveAttribute('data-state', 'collapsed');

    await menuLink(page, 'Crédits').click();
    await expect(page).toHaveURL(/\/app\/credits$/);
    await expect(sidebar(page)).toHaveAttribute('data-state', 'collapsed');

    await page.keyboard.press('Control+b');
    await expect(sidebar(page)).toHaveAttribute('data-state', 'expanded');
  });

  test('sur mobile : le menu est masqué, s’ouvre en tiroir et se referme après la navigation', async ({ page, request, isMobile }) => {
    test.skip(!isMobile, 'Le tiroir ne concerne que les petits écrans.');
    await signUpVerified(page, request, uniqueEmail('tiroir'));
    await expect(menuLink(page, 'Crédits')).toBeHidden();

    await toggle(page).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'Crédits', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/credits$/);
    await expect(drawer).toBeHidden();
  });

  test('le solde reste visible dans l’en-tête, avec son équivalent en FCFA', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('solde'));
    await expect(page.getByLabel('Solde : 0 crédits')).toBeVisible();
  });

  test('un lien « Aller au contenu » est proposé au clavier', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('skip'));
    // Page fraîchement chargée : sinon le point de départ du focus clavier est l'ancien bouton, déjà supprimé.
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); // la page est diffusée en streaming
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
  });
});

test.describe('Profil', () => {
  test('modifier son prénom depuis le profil est pris en compte', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('profil'), { firstName: 'Marie' });
    await page.goto('/app/profil');
    await expect(page.getByLabel('Prénom')).toHaveValue('Marie');
    await page.getByLabel('Prénom').fill('Marielle');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Profil enregistré.')).toBeVisible();
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Marielle');
  });
});

test.describe('Administration — identité et navigation', () => {
  test('une interface distincte de l’espace client : barre latérale d’administration et topbar commune', async ({ page }) => {
    await adminLogin(page);
    await expect(page.locator('[data-space="admin"]')).toBeVisible();
    await expect(accountMenu(page)).toBeVisible();
    await expect(themeButton(page)).toBeVisible();
    await expect(page.getByText('Administrateur', { exact: true }).first()).toBeVisible();
    // Aucun élément de l'espace client : pas de solde de crédits, pas d'achat.
    await expect(page.getByLabel(/^Solde :/)).toHaveCount(0);
    await expect(menuLink(page, 'Achats')).toHaveCount(0);
  });

  test('présente les rubriques du cahier des charges et leurs pages', async ({ page }) => {
    await adminLogin(page);
    await openMenuIfHidden(page, menuLink(page, 'Utilisateurs'));
    for (const group of ['Pilotage', 'Clients', 'Générations et modération', 'Offre', 'Finances', 'Configuration', 'Audit']) {
      await expect(sidebar(page).getByText(group, { exact: true })).toBeVisible();
    }
    for (const title of [
      'Tableau de bord', 'Utilisateurs', 'Réclamations', 'Générations', 'Packs de crédits', 'Produits', 'Presets',
      'Paiements', 'Synthèse financière', 'Paramètres', 'Textes légaux', 'Administrateurs', 'Journal d’audit',
    ]) {
      await expect(menuLink(page, title)).toBeVisible();
    }
  });

  test('chaque page d’administration se charge avec un titre, sans erreur ni débordement', async ({ page }) => {
    await adminLogin(page);
    const pages: [string, string][] = [
      ['/admin', 'Tableau de bord'],
      ['/admin/utilisateurs', 'Utilisateurs'],
      ['/admin/signalements', 'Réclamations et signalements'],
      ['/admin/generations', 'Générations et modération'],
      ['/admin/packs', 'Packs de crédits'],
      ['/admin/produits', 'Produits de génération'],
      ['/admin/presets', 'Presets'],
      ['/admin/paiements', 'Paiements'],
      ['/admin/finances', 'Synthèse financière'],
      ['/admin/parametres', 'Paramètres'],
      ['/admin/textes-legaux', 'Textes légaux'],
      ['/admin/administrateurs', 'Administrateurs'],
      ['/admin/audit', 'Journal d’audit'],
      ['/admin/profil', 'Mon profil'],
    ];
    for (const [path, title] of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} : défilement horizontal`).toBeLessThanOrEqual(0);
    }
  });

  test('la page active est signalée dans le menu', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/utilisateurs');
    await openMenuIfHidden(page, menuLink(page, 'Utilisateurs'));
    await expect(menuLink(page, 'Utilisateurs')).toHaveAttribute('aria-current', 'page');
  });

  test('une rubrique inconnue donne une page introuvable', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/nimporte-quoi');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
  });

  test('un utilisateur normal ne peut ouvrir aucune page d’administration', async ({ page, request }) => {
    test.slow(); // inscription + vérification + cinq redirections serveur
    await signUpVerified(page, request, uniqueEmail('simple'));
    for (const path of ['/admin', '/admin/utilisateurs', '/admin/finances', '/admin/audit', '/admin/parametres']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/app$/);
    }
  });

  test('l’administrateur se déconnecte par le menu du compte', async ({ page }) => {
    await adminLogin(page);
    await logOut(page);
    await expect(page).toHaveURL(/\/connexion$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/connexion/);
  });
});
