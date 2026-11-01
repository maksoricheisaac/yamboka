import { PASSWORD, expect, signUp, test, uniqueEmail, verifyWithCode } from './helpers';

/** Le sélecteur de pays est un bouton dont le nom accessible contient le pays et l'indicatif. */
const picker = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^Pays : / });
const phoneField = (page: import('@playwright/test').Page) => page.getByLabel('Téléphone (facultatif)');

test.describe('Champ de téléphone international', () => {
  test('inscription : pays par défaut, recherche d’un pays, saisie formatée, valeur enregistrée en E.164', async ({ page, request }) => {
    const email = uniqueEmail('phone');
    await page.goto('/inscription');
    await expect(picker(page)).toHaveAccessibleName('Pays : République du Congo, indicatif +242');

    // Recherche par nom, puis sélection.
    await picker(page).click();
    await page.getByRole('combobox', { name: /Rechercher un pays/ }).fill('franc');
    await page.getByRole('option', { name: /France/ }).click();
    await expect(picker(page)).toHaveAccessibleName('Pays : France, indicatif +33');

    await phoneField(page).fill('0612345678');
    await expect(phoneField(page)).toHaveValue('06 12 34 56 78');

    await page.getByLabel('Prénom').fill('Marie');
    await page.getByLabel('Nom', { exact: true }).fill('Ndinga');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirmer le mot de passe').fill(PASSWORD);
    await page.getByRole('checkbox', { name: /J’accepte/ }).click();
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await verifyWithCode(page, request, email);

    // Le serveur a normalisé le numéro (E.164), l'interface le présente lisiblement.
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.user.phone).toBe('+33612345678');
    await page.goto('/app/profil');
    await expect(picker(page)).toHaveAccessibleName('Pays : France, indicatif +33');
    await expect(page.getByLabel('Numéro de téléphone (facultatif)')).toHaveValue('06 12 34 56 78');
  });

  test('un numéro international collé règle le pays, sans double indicatif', async ({ page }) => {
    await page.goto('/inscription');
    const field = phoneField(page);
    await field.fill('+242 06 606 31 33');
    await expect(picker(page)).toHaveAccessibleName('Pays : République du Congo, indicatif +242');
    await expect(field).toHaveValue('06 606 31 33');

    await field.fill('+33 6 12 34 56 78');
    await expect(picker(page)).toHaveAccessibleName('Pays : France, indicatif +33');
    await expect(field).toHaveValue('06 12 34 56 78');
    await expect(field).not.toHaveValue(/\+/);
  });

  test('un numéro invalide pour le pays est refusé avec un message clair', async ({ page }) => {
    await page.goto('/inscription');
    await phoneField(page).fill('06 12');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page.getByText(/Numéro invalide pour ce pays/)).toBeVisible();
    await expect(phoneField(page)).toHaveAttribute('aria-invalid', 'true');
  });

  test('le sélecteur se pilote au clavier : ouverture, recherche par indicatif, flèches, Entrée, Échap', async ({ page }) => {
    await page.goto('/inscription');
    await picker(page).focus();
    await page.keyboard.press('Enter');
    const search = page.getByRole('combobox', { name: /Rechercher un pays/ });
    await expect(search).toBeFocused();
    await search.fill('+221');
    await expect(page.getByRole('option', { name: /Sénégal/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(picker(page)).toHaveAccessibleName('Pays : Sénégal, indicatif +221');
    // Échap ferme sans changer le pays.
    await picker(page).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(picker(page)).toHaveAccessibleName('Pays : Sénégal, indicatif +221');
  });

  test('la liste de pays reste dans l’écran, sans défilement horizontal', async ({ page }) => {
    await page.goto('/inscription');
    await picker(page).click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    const box = await list.boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('l’ancien compte garde un numéro lisible et l’achat de crédits reste limité au Congo', async ({ page, request }) => {
    const email = uniqueEmail('legacy');
    await signUp(page, email);
    await verifyWithCode(page, request, email);
    await page.goto('/app/credits');
    // Pays verrouillé sur le Congo : MTN et Airtel Money ne fonctionnent qu'au Congo.
    const field = page.getByLabel('Numéro qui paie');
    await expect(page.getByRole('button', { name: /^Pays : / })).toHaveCount(0);
    await field.fill('242061234567');
    await expect(field).toHaveValue('06 123 45 67');
  });
});
