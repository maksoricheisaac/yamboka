import {
  PASSWORD,
  adminLogin,
  appAlerts,
  codeFor,
  expect,
  logIn,
  logOut,
  signUp,
  signUpVerified,
  test,
  tokenFor,
  uniqueEmail,
  verifyWithCode,
} from './helpers';

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

  test('un utilisateur normal ne peut pas ouvrir /admin', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('simple'));
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: 'Administration' })).toHaveCount(0);
  });

  test('l’administrateur arrive directement dans son espace d’administration, pas dans l’espace client', async ({ page }) => {
    // Le compte du seed n'a jamais accepté les conditions : l'écran d'acceptation s'impose à la première
    // connexion (le compte étant partagé entre projets Playwright, un autre a pu l'accepter avant).
    await adminLogin(page);
    await expect(page).toHaveURL(/\/admin$/);
    // Même en demandant l'espace client, il est renvoyé vers l'administration.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/app/credits');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('un client arrive dans son tableau de bord après connexion', async ({ page, request }) => {
    const email = uniqueEmail('client');
    await signUpVerified(page, request, email, { firstName: 'Awa' });
    await logOut(page);
    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Awa');
  });
});

test.describe('Inscription et vérification par code', () => {
  test('parcours complet : inscription, saisie du code, aucun crédit offert', async ({ page, request }) => {
    const email = uniqueEmail('parcours');
    await signUp(page, email, { firstName: 'Grace' });

    // Après l'inscription : écran de saisie du code, adresse affichée, renvoi bloqué par un compte à rebours.
    await expect(page).toHaveURL(/\/verifier-email$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confirmez votre adresse e-mail');
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole('button', { name: /Renvoyer le code dans \d+ s/ })).toBeDisabled();

    // Un mauvais code est refusé, avec le nombre d'essais restants.
    const code = await codeFor(request, email);
    const wrong = code === '000000' ? '111111' : '000000';
    await page.getByLabel('Code de vérification').fill(wrong);
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Code incorrect' })).toBeVisible();

    await page.getByLabel('Code de vérification').fill(code);
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bonjour Grace');
    await expect(page.getByLabel('Solde : 0 crédits')).toBeVisible();
    // Plus de bandeau de vérification (le texte « Confirmez… » reste dans l'annonceur de routes de Next, d'où le lien ciblé).
    await expect(page.getByRole('link', { name: 'Saisir mon code' })).toHaveCount(0);
    await expect(page.getByText('Adresse e-mail confirmée')).toBeVisible();
  });

  test('une fois l’adresse vérifiée, la page de saisie du code n’est plus proposée', async ({ page, request }) => {
    const email = uniqueEmail('codeuse');
    await signUpVerified(page, request, email);
    await page.goto('/verifier-email');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('on peut corriger l’adresse e-mail saisie par erreur : le code part vers la nouvelle adresse', async ({ page, request }) => {
    const wrongEmail = uniqueEmail('faute');
    const rightEmail = uniqueEmail('bonne');
    await signUp(page, wrongEmail);
    await page.getByRole('button', { name: 'Corriger l’adresse' }).click();
    await page.getByLabel('Nouvelle adresse e-mail').fill(rightEmail);
    await page.getByRole('button', { name: 'Envoyer le code' }).click();
    await expect(page.getByText(rightEmail)).toBeVisible();
    await verifyWithCode(page, request, rightEmail);
    await expect(page.getByLabel('Solde : 0 crédits')).toBeVisible();
  });

  test('le bandeau du tableau de bord mène à la saisie du code', async ({ page }) => {
    await signUp(page, uniqueEmail('bandeau'));
    await expect(page).toHaveURL(/\/verifier-email/); // attendre la fin de l'inscription avant de naviguer
    await page.goto('/app');
    await page.getByRole('link', { name: 'Saisir mon code' }).click();
    await expect(page).toHaveURL(/\/verifier-email$/);
  });

  test('le renvoi du code est limité par un compte à rebours puis possible', async ({ page, request }) => {
    const email = uniqueEmail('renvoi');
    await signUp(page, email);
    const resend = page.getByRole('button', { name: /Renvoyer le code/ });
    await expect(resend).toBeDisabled();
    // Le délai est réduit dans l'environnement de test (EMAIL_OTP_RESEND_COOLDOWN_SECONDS=3).
    await expect(resend).toBeEnabled({ timeout: 10_000 });
    const first = await codeFor(request, email);
    await resend.click();
    await expect(page.getByRole('status').filter({ hasText: 'nouveau code' })).toBeVisible();
    await expect(resend).toBeDisabled();
    expect(await codeFor(request, email)).toMatch(/^\d{6}$/);
    expect(first).toMatch(/^\d{6}$/);
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
    await expect(page).toHaveURL(/\/verifier-email/);

    const other = await browser.newContext({ baseURL: page.url().replace(/\/verifier-email.*$/, '') });
    const second = await other.newPage();
    await signUp(second, email);
    await expect(appAlerts(second).first()).toContainText('déjà utilisée');
    await other.close();
  });
});

test.describe('Connexion, déconnexion, mot de passe', () => {
  test('mauvais identifiants : message générique ; bons identifiants : accès ; déconnexion : accès coupé', async ({ page, request }) => {
    const email = uniqueEmail('cycle');
    await signUpVerified(page, request, email);
    await logOut(page);
    await expect(page).toHaveURL(/\/connexion$/);

    await logIn(page, email, 'Mauvais-motdepasse-1');
    await expect(appAlerts(page)).toContainText('E-mail ou mot de passe incorrect');
    await expect(page).toHaveURL(/\/connexion$/);

    await logIn(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/app$/);

    await logOut(page);
    await expect(page).toHaveURL(/\/connexion$/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('la déconnexion invalide la session côté serveur : l’ancien cookie ne sert plus à rien', async ({ page, request, context }) => {
    const email = uniqueEmail('invalide');
    await signUpVerified(page, request, email);
    const [cookie] = (await context.cookies()).filter((c) => c.name === 'yamboka_session');
    expect(cookie).toBeTruthy();

    await logOut(page);
    await expect(page).toHaveURL(/\/connexion$/);

    // On rejoue le cookie volé avant la déconnexion : l'API le refuse.
    await context.addCookies([cookie]);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('redirige vers la page demandée après connexion, jamais vers un site extérieur', async ({ page, request }) => {
    const email = uniqueEmail('suivant');
    await signUpVerified(page, request, email);
    await logOut(page);

    await page.goto('/connexion?suivant=//evil.example');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('mot de passe oublié puis réinitialisation', async ({ page, request }) => {
    const email = uniqueEmail('oubli');
    await signUpVerified(page, request, email);
    await logOut(page);

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

test.describe('Setup Wizard', () => {
  test('une installation déjà initialisée refuse l’assistant : aucun formulaire n’est proposé', async ({ page, request }) => {
    await page.goto('/installation');
    await expect(page.getByText(/déjà initialisée/)).toBeVisible();
    await expect(page.getByLabel('Secret d’installation')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Aller à la connexion' })).toBeVisible();

    // Même avec le bon secret, l'API refuse de créer un administrateur.
    const res = await request.post(`${process.env.E2E_API_URL ?? 'http://localhost:4101'}/v1/setup/complete`, {
      headers: { 'x-setup-secret': 'peu-importe-le-secret-est-ignore-une-fois-installe' },
      data: { firstName: 'Intrus', lastName: 'Intrus', email: uniqueEmail('intrus'), password: 'Intrus-Mot-De-Passe-2026!', confirmPassword: 'Intrus-Mot-De-Passe-2026!', acceptLegal: true },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe('SETUP_LOCKED');
  });

  test('l’inscription publique ne donne jamais le rôle administrateur', async ({ page, request }) => {
    const email = uniqueEmail('pasadmin');
    await signUpVerified(page, request, email);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe('Responsive et accessibilité de base', () => {
  for (const path of ['/connexion', '/inscription', '/mot-de-passe-oublie', '/installation']) {
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

  test('le formulaire de connexion se remplit et se soumet au clavier', async ({ page, request }) => {
    const email = uniqueEmail('clavier');
    await signUpVerified(page, request, email);
    await logOut(page);
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
