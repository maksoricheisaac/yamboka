import { ADMIN, PASSWORD, appAlerts, expect, logIn, signUp, test, tokenFor, uniqueEmail } from './helpers';

test.describe('Accès aux pages privées', () => {
  test('un visiteur est renvoyé vers la connexion, puis revient où il allait', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/connexion\?suivant=%2Fapp$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion');
  });

  test('la racine mène à l’espace utilisateur, donc à la connexion pour un visiteur', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('un utilisateur normal ne peut pas ouvrir /admin', async ({ page }) => {
    const email = uniqueEmail('simple');
    await signUp(page, email);
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: 'Administration' })).toHaveCount(0);
  });

  test('l’administrateur du seed accepte d’abord les textes légaux, puis accède à /admin', async ({ page }) => {
    await logIn(page, ADMIN.email, ADMIN.password);
    // Le compte du seed n'a jamais accepté les conditions : l'écran d'acceptation s'impose à la première
    // connexion. Le compte étant partagé entre projets Playwright, il se peut qu'un autre l'ait déjà accepté.
    // On attend un état stable (le titre), pas l'URL : /app est une étape transitoire avant la redirection serveur.
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toHaveText(/Un dernier pas|Bonjour/);
    if ((await title.textContent())?.includes('Un dernier pas')) {
      await page.getByRole('checkbox').click();
      await page.getByRole('button', { name: 'Continuer' }).click();
    }
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();
  });
});

test.describe('Inscription et vérification', () => {
  test('parcours complet : inscription, e-mail à confirmer, vérification, crédits de bienvenue', async ({ page, request }) => {
    const email = uniqueEmail('parcours');
    await signUp(page, email, { firstName: 'Grace' });

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Grace');
    await expect(page.getByText('Confirmez votre adresse e-mail')).toBeVisible();
    await expect(page.getByLabel('Solde : 0 crédits')).toBeVisible();

    // Le lien reçu par e-mail ne consomme rien au chargement : il faut cliquer.
    const token = await tokenFor(request, email);
    await page.goto(`/verifier-email?token=${token}`);
    await page.getByRole('button', { name: 'Confirmer mon adresse e-mail' }).click();
    await expect(page.getByText('Votre adresse e-mail est confirmée')).toBeVisible();

    await page.getByRole('link', { name: 'Accéder à mon espace' }).click();
    await expect(page.getByLabel('Solde : 4 crédits')).toBeVisible();
    await expect(page.getByText('Confirmez votre adresse e-mail')).toHaveCount(0);
    await expect(page.getByText('Adresse confirmée')).toBeVisible();
  });

  test('un lien déjà utilisé affiche une erreur claire', async ({ page, request }) => {
    const email = uniqueEmail('lienuse');
    await signUp(page, email);
    const token = await tokenFor(request, email);
    await page.goto(`/verifier-email?token=${token}`);
    await page.getByRole('button', { name: 'Confirmer mon adresse e-mail' }).click();
    await expect(page.getByText('Votre adresse e-mail est confirmée')).toBeVisible();

    await page.goto(`/verifier-email?token=${token}`);
    await page.getByRole('button', { name: 'Confirmer mon adresse e-mail' }).click();
    await expect(appAlerts(page)).toContainText('invalide ou a expiré');
  });

  test('le bandeau permet de renvoyer le lien', async ({ page }) => {
    await signUp(page, uniqueEmail('renvoi'));
    await page.getByRole('button', { name: 'Renvoyer le lien' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'nouveau lien' })).toBeVisible();
  });

  test('les erreurs de validation s’affichent sous les champs, en français', async ({ page }) => {
    await page.goto('/inscription');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page.getByText('Prénom requis.')).toBeVisible();
    await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible();
    await expect(page.getByText('Vous devez accepter les conditions')).toBeVisible();
    await expect(page.getByLabel('Adresse e-mail')).toHaveAttribute('aria-invalid', 'true');
  });

  test('refuse une adresse jetable avec un message clair', async ({ page }) => {
    await signUp(page, uniqueEmail('jetable').replace('@example.com', '@mailinator.com'));
    await expect(appAlerts(page).first()).toContainText('jetables');
    await expect(page).toHaveURL(/\/inscription$/);
  });

  test('refuse une adresse déjà inscrite', async ({ page, browser }) => {
    const email = uniqueEmail('doublon');
    await signUp(page, email);
    await expect(page).toHaveURL(/\/app$/);

    const other = await browser.newContext({ baseURL: page.url().replace(/\/app$/, '') });
    const second = await other.newPage();
    await signUp(second, email);
    await expect(appAlerts(second).first()).toContainText('déjà utilisée');
    await other.close();
  });
});

test.describe('Connexion, déconnexion, mot de passe', () => {
  test('mauvais identifiants : message générique ; bons identifiants : accès ; déconnexion : accès coupé', async ({ page }) => {
    const email = uniqueEmail('cycle');
    await signUp(page, email);
    await page.getByRole('button', { name: /Se déconnecter/ }).click();
    await expect(page).toHaveURL(/\/connexion$/);

    await logIn(page, email, 'Mauvais-motdepasse-1');
    await expect(appAlerts(page)).toContainText('E-mail ou mot de passe incorrect');
    await expect(page).toHaveURL(/\/connexion$/);

    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/app$/);

    await page.getByRole('button', { name: /Se déconnecter/ }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('redirige vers la page demandée après connexion, jamais vers un site extérieur', async ({ page }) => {
    const email = uniqueEmail('suivant');
    await signUp(page, email);
    await page.getByRole('button', { name: /Se déconnecter/ }).click();

    await page.goto('/connexion?suivant=//evil.example');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('mot de passe oublié puis réinitialisation', async ({ page, request }) => {
    const email = uniqueEmail('oubli');
    await signUp(page, email);
    await page.getByRole('button', { name: /Se déconnecter/ }).click();

    await page.goto('/mot-de-passe-oublie');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByRole('status')).toContainText('lien de réinitialisation');

    const token = await tokenFor(request, email);
    const nouveau = 'Nouveau-motdepasse-77';
    await page.goto(`/nouveau-mot-de-passe?token=${token}`);
    await page.getByLabel('Nouveau mot de passe').fill(nouveau);
    await page.getByLabel('Confirmer le mot de passe').fill(nouveau);
    await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
    await expect(page.getByText('Votre mot de passe a été modifié.')).toBeVisible();

    await logIn(page, email, PASSWORD);
    await expect(appAlerts(page)).toContainText('incorrect');
    await logIn(page, email, nouveau);
    await expect(page).toHaveURL(/\/app$/);
  });

  test('le bouton Google est masqué quand Google n’est pas configuré', async ({ page }) => {
    await page.goto('/connexion');
    await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
  });

  test('le bouton « afficher le mot de passe » fonctionne', async ({ page }) => {
    await page.goto('/connexion');
    const input = page.getByLabel('Mot de passe', { exact: true });
    await expect(input).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Afficher le mot de passe' }).click();
    await expect(input).toHaveAttribute('type', 'text');
  });
});

test.describe('Responsive et accessibilité de base', () => {
  for (const path of ['/connexion', '/inscription', '/mot-de-passe-oublie']) {
    test(`${path} : pas de défilement horizontal, un seul h1, champs étiquetés`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const unlabeled = await page.locator('input:not([type=hidden]):not([type=checkbox])').evaluateAll((els) =>
        els.filter((el) => !el.id || !document.querySelector(`label[for="${el.id}"]`)).length,
      );
      expect(unlabeled).toBe(0);
    });
  }

  test('le formulaire de connexion se remplit et se soumet au clavier', async ({ page }) => {
    const email = uniqueEmail('clavier');
    await signUp(page, email);
    await page.getByRole('button', { name: /Se déconnecter/ }).click();
    await page.goto('/connexion');
    // On attend que le formulaire soit prêt (bouton activé) avant de piloter le clavier.
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
    await page.getByLabel('Adresse e-mail').focus();
    await page.keyboard.type(email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe('Sécurité du formulaire avant l’hydratation (connexion lente)', () => {
  test('l’envoi est bloqué tant que React n’est pas prêt : aucun mot de passe dans l’URL', async ({ page }) => {
    // On simule une connexion lente : la page arrive, mais les scripts d'hydratation ne se chargent pas.
    await page.route('**/_next/static/**/*.js', (route) => route.abort());
    await page.goto('/connexion');
    const submit = page.getByRole('button', { name: 'Se connecter' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Adresse e-mail').fill('quelquun@example.com');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret-qui-ne-doit-pas-fuiter-1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('Secret');
    expect(page.url()).not.toContain('?');
  });
});
