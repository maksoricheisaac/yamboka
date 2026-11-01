import { expect, test } from '@playwright/test';

const PAGES = [
  '/',
  '/fonctionnalites',
  '/comment-ca-marche',
  '/tarifs',
  '/galerie',
  '/cas-utilisation',
  '/a-propos',
  '/faq',
  '/contact',
  '/confidentialite',
  '/conditions-utilisation',
  '/charte-utilisation',
];

for (const path of PAGES) {
  test(`${path} : s'affiche sans erreur, un seul h1, sans débordement horizontal`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });

    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test('la barre de navigation contient Accueil, Exemples, Fonctionnalités, Tarifs, Connexion et le CTA', async ({ page, isMobile }) => {
  await page.goto('/tarifs');
  if (isMobile) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const nav = page.getByRole('navigation', { name: isMobile ? 'Navigation mobile' : 'Navigation principale' });
  for (const label of ['Accueil', 'Exemples', 'Fonctionnalités', 'Tarifs']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Tarifs', exact: true })).toHaveAttribute('aria-current', 'page');
  // Connexion et appel à l'action pointent vers l'application (aucun lien mort).
  const scope = isMobile ? page.getByRole('dialog') : page.locator('header');
  await expect(scope.getByRole('link', { name: 'Connexion' })).toHaveAttribute('href', /\/connexion$/);
  await expect(scope.getByRole('link', { name: 'Créer mon compte' })).toHaveAttribute('href', /\/inscription$/);
});

test('le lien Accueil et le logo ramènent à la page d’accueil ; le menu mobile se ferme après navigation', async ({ page, isMobile }) => {
  await page.goto('/tarifs');
  if (isMobile) {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await drawer.getByRole('link', { name: 'Accueil', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(drawer).toBeHidden();
  } else {
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Accueil', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  await page.goto('/faq');
  await page.getByRole('link', { name: 'Yamboka — accueil' }).first().click();
  await expect(page).toHaveURL(/\/$/);
});

test('la page d’accueil tient en trois sections et un appel final, avec des actions fonctionnelles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Transformez vos vidéos');
  for (const name of ['Ce que vous pouvez créer', 'Trois étapes', 'Votre première création']) {
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.locator('main h2')).toHaveCount(3);
  // Le hero et l’appel final mènent à l’inscription ; « Voir des exemples » reste sur la page.
  await expect(page.getByRole('link', { name: /Créer mon compte/ }).first()).toHaveAttribute('href', /\/inscription$/);
  await expect(page.locator('main').getByRole('link', { name: /Créer mon compte/ })).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Voir des exemples' })).toHaveAttribute('href', '#exemples');
  // Les démonstrations sont étiquetées « Démo » tant qu’elles ne sont pas de vraies créations ; sinon ce sont de vraies vidéos.
  await expect(
    page.getByText('Démo', { exact: true }).or(page.getByRole('button', { name: /Lire la vidéo|Mettre la vidéo en pause/ })).first(),
  ).toBeVisible();
  // Le comparateur se pilote au clavier et par les boutons Avant / Après.
  await page.getByRole('button', { name: 'Après', exact: true }).click();
  await expect(page.getByRole('slider', { name: /Comparer/ })).toHaveValue('0');
  await page.getByRole('button', { name: 'Pub de boutique' }).click();
  await expect(page.getByRole('button', { name: 'Pub de boutique' })).toHaveAttribute('aria-pressed', 'true');
  // Pas de défilement horizontal involontaire.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('la page tarifs affiche trois offres avec prix en FCFA, exemple concret et appel à l’action', async ({ page }) => {
  await page.goto('/tarifs');
  const offers = page.locator('article');
  await expect(offers).toHaveCount(3);
  for (const name of ['Starter', 'Pro', 'Business']) {
    const card = offers.filter({ hasText: name });
    await expect(card.getByText(/FCFA/).first()).toBeVisible();
    await expect(card.getByText(/Par exemple :/)).toBeVisible();
    await expect(card.getByRole('link', { name: new RegExp(`Choisir ${name}`) })).toHaveAttribute('href', /\/inscription$/);
  }
  await expect(offers.filter({ hasText: 'Pro' })).toContainText(/2\s?600 crédits/);
  await expect(page.getByText('Découverte', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Créateur', { exact: true })).toHaveCount(0);
});

test('tarifs : sélecteur de coût et comparaison des offres', async ({ page }) => {
  await page.goto('/tarifs');
  await page.getByRole('button', { name: 'Vidéo 5 s' }).click();
  await expect(page.getByText('50', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Image' }).click();
  await expect(page.getByRole('button', { name: 'Image' })).toHaveAttribute('aria-pressed', 'true');
  // Une seule offre recommandée, chaque offre annonce ce qu'elle permet.
  await expect(page.getByText('Recommandé', { exact: true })).toHaveCount(1);
  await expect(page.locator('article').filter({ hasText: 'Pro' })).toContainText(/vidéos de 10 s/);
});

test('fonctionnalités : chaque capacité indique si elle est disponible ou prévue au lancement', async ({ page }) => {
  await page.goto('/fonctionnalites');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ce que Yamboka vous permet');
  await expect(page.getByText('Disponible dans votre espace').first()).toBeVisible();
  await expect(page.getByText('Au lancement').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Transformez une vidéo' })).toBeVisible();
});

test('exemples : filtre, fenêtre de consultation, navigation et fermeture au clavier', async ({ page }) => {
  await page.goto('/galerie');
  await page.getByRole('button', { name: 'Fêtes' }).click();
  await expect(page.getByRole('button', { name: /^Ouvrir :/ })).toHaveCount(2);
  await page.getByRole('button', { name: /Ouvrir : Anniversaire/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Anniversaire' });
  await expect(dialog).toBeVisible();
  // La fenêtre ne dépasse pas l'écran et mène à l'inscription.
  const vp = page.viewportSize()!;
  // On mesure une fois l'animation d'entrée terminée.
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return box.width <= vp.width && box.y + box.height <= vp.height + 1;
    })
    .toBe(true);
  await expect(dialog.getByRole('link', { name: /Créer mon compte/ })).toHaveAttribute('href', /\/inscription$/);
  await dialog.getByRole('button', { name: 'Exemple suivant' }).click();
  await expect(page.getByRole('dialog', { name: 'Invitation d’événement' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Le focus revient sur la vignette qui a ouvert la fenêtre (sinon l'utilisateur au clavier repart du haut de la page).
  await expect(page.getByRole('button', { name: /Ouvrir : Anniversaire/ })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('la FAQ répond aux huit questions attendues et se déplie au clavier', async ({ page }) => {
  await page.goto('/faq');
  for (const q of [
    'Comment fonctionne Yamboka ?',
    'Comment payer sans carte bancaire ?',
    'Combien coûte une génération ?',
    'Combien de temps prend une création ?',
    'Peut-on utiliser ses propres photos ?',
    'Comment récupérer une création ?',
    'Combien de temps les fichiers sont-ils conservés ?',
    'Que se passe-t-il si une génération échoue ?',
  ]) {
    await expect(page.getByRole('button', { name: q })).toBeVisible();
  }
  const trigger = page.getByRole('button', { name: 'Comment payer sans carte bancaire ?' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

test('SEO : sitemap, robots, métadonnées, Open Graph, canonique et données structurées', async ({ request, page }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('/tarifs');
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap:');

  await page.goto('/tarifs');
  await expect(page).toHaveTitle(/Tarifs \| Yamboka/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /mobile money/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/tarifs$/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Tarifs/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', /\/tarifs$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = ld.flatMap((t) => {
    const j = JSON.parse(t);
    return [j['@type'], ...(j['@graph'] ?? []).map((n: { '@type': string }) => n['@type'])];
  });
  expect(types).toEqual(expect.arrayContaining(['BreadcrumbList', 'Product']));
  // Aucune note ni avis inventés dans les données structurées.
  expect(ld.join('')).not.toMatch(/aggregateRating|review/i);

  await page.goto('/');
  const home = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t)['@type']);
  expect(home).toEqual(expect.arrayContaining(['Organization', 'WebSite']));
});

test('page introuvable : 404 en français', async ({ page }) => {
  const response = await page.goto('/cette-page-nexiste-pas');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cette page n’existe pas');
});

test('le hero est lisible sans animation : titre, deux appels à l’action, démonstration marquée comme illustrative', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Transformez vos vidéos');
  await expect(page.getByRole('link', { name: /Créer mon compte/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Voir des exemples' })).toHaveAttribute('href', '#exemples');
  // Illustration étiquetée tant qu’il n’y a pas de vraie création ; sinon la légende annonce un exemple généré.
  await expect(page.getByText('Aperçu illustratif').or(page.getByText('Exemple généré avec Yamboka'))).toBeVisible();
  // « Réduire les animations » : le rideau (illustration seulement) est figé sur la création terminée.
  const wipe = page.locator('.hero-wipe');
  if (await wipe.count()) {
    const clip = await wipe.evaluate((el) => getComputedStyle(el).clipPath);
    expect(clip).toMatch(/inset\(0px 100%/);
  }
});

test('les exemples se choisissent au clavier et le comparateur répond aux flèches', async ({ page }) => {
  await page.goto('/');
  const choice = page.getByRole('button', { name: 'Pub de boutique' });
  await choice.focus();
  await page.keyboard.press('Enter');
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  // Illustration nommée « Pub de boutique », ou vidéo réelle de cette démonstration.
  await expect(page.getByRole('img', { name: /Pub de boutique/ }).or(page.locator('video').first()).first()).toBeVisible();
  const slider = page.getByRole('slider', { name: /Comparer/ });
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
});

test('le contenu principal est dans le HTML sans JavaScript (connexion lente, robots)', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Transformez vos vidéos');
  await expect(page.getByRole('heading', { level: 2, name: /Trois étapes/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Créer mon compte/ }).first()).toHaveAttribute('href', /\/inscription$/);
  // Le prix d’entrée (offres réelles ou, à défaut, valeurs du business plan) est dans le HTML initial.
  await expect(page.getByText(/à partir de [\d\s  ]+FCFA/)).toBeVisible();
  await ctx.close();
});

test('contact : le bouton WhatsApp pointe vers le numéro configuré', async ({ page }) => {
  await page.goto('/contact');
  const link = page.getByRole('link', { name: /Écrire sur WhatsApp/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/242060000000\?text=/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
});
