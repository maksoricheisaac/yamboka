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

test('la navigation principale mène aux pages', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const nav = page.getByRole('navigation', { name: isMobile ? 'Navigation mobile' : 'Navigation principale' });
  await nav.getByRole('link', { name: 'Tarifs' }).click();
  await expect(page).toHaveURL(/\/tarifs$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('500 FCFA');
});

test('la page tarifs affiche les 6 packs avec les bons totaux de crédits', async ({ page }) => {
  await page.goto('/tarifs');
  for (const total of ['20 crédits', '40 crédits', '103 crédits', '210 crédits', '432 crédits', '1 100 crédits']) {
    await expect(page.getByText(total, { exact: false }).first()).toBeVisible();
  }
});

test('la FAQ se déplie au clavier', async ({ page }) => {
  await page.goto('/faq');
  const trigger = page.getByRole('button', { name: 'Faut-il une carte bancaire ?' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

test('SEO : sitemap, robots et métadonnées', async ({ request, page }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('/tarifs');
  expect((await request.get('/robots.txt')).status()).toBe(200);

  await page.goto('/tarifs');
  await expect(page).toHaveTitle(/Tarifs \| Yamboka/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /500 à 25 000 FCFA/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
});

test('page introuvable : 404 en français', async ({ page }) => {
  const response = await page.goto('/cette-page-nexiste-pas');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cette page n’existe pas');
});

test('le hero ne dépend pas de la 3D : titre et boutons sont du HTML', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('payées en mobile money');
  await expect(page.getByRole('link', { name: 'Créer un compte' }).first()).toBeVisible();
});

test('contact : le bouton WhatsApp pointe vers le numéro configuré', async ({ page }) => {
  await page.goto('/contact');
  const link = page.getByRole('link', { name: /Écrire sur WhatsApp/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/242060000000\?text=/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
});
