import type { APIRequestContext, Page } from '@playwright/test';
import { APP_URL } from '../playwright.config';
import { appAlerts, expect, signUpVerified, test, uniqueEmail } from './helpers';

/** PNG de 1 × 1 pixel : la page le réduit puis l'envoie comme une vraie photo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Compte vérifié avec des crédits : achat du pack Starter (paiement simulé) par l'API, comme le ferait l'écran. */
async function accountWithCredits(page: Page, request: APIRequestContext, credits = true) {
  await signUpVerified(page, request, uniqueEmail('creation'));
  if (credits) {
    const { packs } = await (await page.request.get('/api/catalog/packs')).json();
    const starter = packs.find((p: { name: string }) => p.name === 'Starter');
    const created = await page.request.post('/api/payments', { data: { packId: starter.id, operator: 'MTN', phone: '+242061234567' }, headers: { origin: APP_URL } });
    expect(created.status()).toBe(201);
    const { payment } = await created.json();
    const done = await page.request.post(`/api/payments/${payment.id}/simulate`, { data: { outcome: 'success', callbacks: 1 }, headers: { origin: APP_URL } });
    expect(done.ok()).toBeTruthy();
  }
  await page.goto('/app/creer');
}

async function pickPhoto(page: Page) {
  // Rejoué : juste après le chargement, la page n'est pas forcément « hydratée » et ignorerait le fichier.
  await expect(async () => {
    await page.locator('input[type="file"]').setInputFiles({ name: 'produit.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Photo prête')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

const generateButton = (page: Page) => page.getByRole('button', { name: /^Générer/ });

test.describe('Création : parcours', () => {
  test('affiche trois types, un style par type, coût et solde avant de lancer', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await expect(page.getByRole('heading', { level: 1, name: /Qu’allez-vous créer/ })).toBeVisible();
    const tabs = page.getByRole('tablist', { name: 'Type de création' });
    for (const name of ['Affiche', 'Vidéo pub', 'Vidéo fun']) await expect(tabs.getByRole('tab', { name })).toBeVisible();

    // Affiche : 17 crédits. Le bouton annonce le coût ET le solde restant (1 500 − 17 = 1 483).
    await expect(generateButton(page)).toContainText('Générer · 17 crédits');
    await expect(page.getByText(/Solde après : 1\s?483 crédits/)).toBeVisible();
    await expect(page.getByText(/crédits sont restitués/)).toBeVisible();
    // Un seul champ de description : plus de message, de prix ni de téléphone séparés.
    await expect(page.getByLabel('Décrivez ce que vous voulez')).toBeVisible();
    for (const gone of ['Votre message', 'Texte à afficher', 'Prix', 'Téléphone']) await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
    // Les sept formats sont proposés, chacun avec son ratio.
    for (const ratio of ['1:1', '4:3', '3:2', '3:4', '2:3', '16:9', '9:16']) {
      await expect(page.getByRole('radiogroup').getByText(ratio, { exact: true })).toBeVisible();
    }

    await tabs.getByRole('tab', { name: 'Vidéo fun' }).click();
    await expect(generateButton(page)).toContainText('Générer · 50 crédits');
    // La vidéo fun : un selfie, une tendance, des instructions facultatives, pas de choix de format.
    await expect(page.getByText('Choisissez une tendance')).toBeVisible();
    await expect(page.getByLabel(/Instructions/)).toBeVisible();
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
  });

  test('exige la photo et le consentement, avec des messages clairs', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await generateButton(page).click();
    await expect(page.getByText('Ajoutez la photo de votre produit.')).toBeVisible();
    await expect(page.getByText('Décrivez ce que vous souhaitez.')).toBeVisible();
    await expect(page.getByText(/Confirmez que vous avez le droit/)).toBeVisible();
  });

  test('vidéo pub complète : progression, résultat, galerie, détail, suppression', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await page.getByRole('tab', { name: 'Vidéo pub' }).click();
    await pickPhoto(page);
    await page.getByLabel('Décrivez ce que vous voulez').fill('Vidéo dynamique pour ce produit à 15 000 FCFA, texte -20 % ce week-end');
    await page.getByRole('checkbox', { name: /Je confirme/ }).click();
    await generateButton(page).click();

    // Pas de pourcentage inventé : le fournisseur n'en donne pas.
    await expect(page.getByText('Création en cours…')).toBeVisible();
    await expect(page.getByRole('status').getByText(/\d+ %/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Partager sur WhatsApp' })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(/50 crédits utilisés/)).toBeVisible();
    await expect(page.getByLabel(/Solde : 1\s?450 crédits/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Télécharger' })).toHaveAttribute('href', /file\?download=1/);

    // Mes créations : la vignette est « Prête » et mène au détail.
    await page.goto('/app/creations');
    // Sans style choisi, aucun nom de style n'est inventé : la carte porte le type de création.
    const card = page.getByRole('link', { name: /Vidéo pub — prête/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Votre vidéo publicitaire' })).toBeVisible();
    await expect(page.getByText('Pub e2e')).toHaveCount(0);
    await expect(page.getByText(/à 15 000 FCFA, texte -20 % ce week-end/)).toBeVisible();

    // Signalement.
    await page.getByRole('button', { name: 'Signaler' }).click();
    await page.getByLabel('Contenu inapproprié').check();
    await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(page.getByText(/signalement a été transmis/)).toBeVisible();
    // Un contenu signalé est conservé : la suppression est refusée avec une explication.
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText(/fait l’objet d’un signalement/)).toBeVisible();
  });

  test('suppression d’une création non signalée', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await pickPhoto(page);
    await page.getByLabel('Décrivez ce que vous voulez').fill('Affiche élégante, fond luxueux');
    await page.getByRole('checkbox', { name: /Je confirme/ }).click();
    await generateButton(page).click();
    await expect(page.getByRole('button', { name: 'Partager sur WhatsApp' })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible();
    await page.getByRole('link', { name: 'Voir les détails' }).click();
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(page).toHaveURL(/\/app\/creations$/);
    await expect(page.getByText('Vous n’avez pas encore de création.')).toBeVisible();
  });

  test('un échec restitue les crédits et le dit clairement', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await page.getByRole('tab', { name: 'Vidéo pub' }).click();
    await pickPhoto(page);
    await page.getByLabel('Décrivez ce que vous voulez').fill('__echec__');
    await page.getByRole('checkbox', { name: /Je confirme/ }).click();
    await generateButton(page).click();
    await expect(page.getByText('La création n’a pas abouti').first()).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(/Vos 50 crédits ont été restitués/)).toBeVisible();
    await expect(page.getByLabel(/Solde : 1\s?500 crédits/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });

  test('sans assez de crédits : message et lien vers la recharge, pas de bouton Générer', async ({ page, request }) => {
    await accountWithCredits(page, request, false);
    await expect(page.getByText(/Il vous manque 17 crédits/)).toBeVisible();
    await expect(generateButton(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'Recharger mes crédits' }).click();
    await expect(page).toHaveURL(/\/app\/credits$/);
  });
});

test.describe('Tendances, navigation et mise en page', () => {
  test('une tendance ouvre « Créer » avec le bon onglet et le bon style', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await page.goto('/app/tendances');
    await expect(page.getByRole('heading', { level: 1, name: 'Tendances' })).toBeVisible();
    // Une seule rangée de filtres, sans filtre de thème.
    await expect(page.getByRole('group')).toHaveCount(1);
    await page.getByRole('link', { name: /Tendance e2e/ }).click();
    await expect(page).toHaveURL(/\/app\/creer\?style=/);
    await expect(page.getByRole('tab', { name: 'Vidéo fun', selected: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Tendance e2e/ })).toBeChecked();
  });

  test('un modèle d’affiche choisi dans Tendances reste modifiable et retirable', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await page.goto('/app/tendances');
    await page.getByRole('button', { name: 'Affiches' }).click();
    await page.getByRole('link', { name: /Affiche e2e/ }).click();
    await expect(page.getByRole('tab', { name: 'Affiche', selected: true })).toBeVisible();
    await expect(page.getByText('Modèle : Affiche e2e')).toBeVisible();
    await page.getByRole('button', { name: 'Retirer le modèle' }).click();
    await expect(page.getByText('Modèle : Affiche e2e')).toHaveCount(0);
  });

  test('aucun débordement horizontal et navigation adaptée à l’écran', async ({ page, request }) => {
    await accountWithCredits(page, request);
    const mobile = (page.viewportSize()?.width ?? 1280) < 1024;
    for (const path of ['/app', '/app/creer', '/app/creations', '/app/tendances', '/app/credits', '/app/credits/historique', '/app/notifications', '/app/parametres']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} déborde de ${overflow}px`).toBeLessThanOrEqual(0);
    }
    const tabs = page.getByRole('navigation', { name: 'Navigation principale' });
    if (mobile) await expect(tabs.getByRole('link', { name: 'Créer' })).toBeVisible();
    else await expect(tabs).toBeHidden();
    expect(await appAlerts(page).count()).toBe(0);
  });
});

test.describe('Création d’affiche : formats et honnêteté du résultat', () => {
  const GROUPS: Record<string, string> = {
    '1:1': 'Publications sur les réseaux sociaux',
    '4:3': 'Affiche horizontale, visuel classique',
    '3:2': 'Affiche horizontale, photo',
    '3:4': 'Affiche verticale',
    '2:3': 'Affiche verticale, poster',
    '16:9': 'Bannière, visuel très large',
    '9:16': 'Stories, statuts WhatsApp, mobile',
  };

  test('chaque format change l’aperçu à ses proportions exactes et précise son usage', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await pickPhoto(page); // sur mobile, l'aperçu n'apparaît qu'une fois la photo choisie
    for (const [ratio, usage] of Object.entries(GROUPS)) {
      await page.getByRole('radiogroup').getByText(ratio, { exact: true }).click();
      await expect(page.getByText(usage, { exact: true })).toBeVisible();
      const [w, h] = ratio.split(':').map(Number);
      const box = page.locator('figure [style*="aspect-ratio"]:visible').first();
      await expect(async () => {
        const r = await box.evaluate((el) => el.getBoundingClientRect());
        expect(Math.abs(r.width / r.height / (w / h) - 1)).toBeLessThan(0.02);
      }).toPass({ timeout: 5000 });
    }
  });

  test('une affiche sans style choisi n’a ni titre inventé ni texte ajouté, et la simulation est dite clairement', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await pickPhoto(page);
    await page.getByRole('radiogroup').getByText('3:4', { exact: true }).click();
    await page.getByLabel('Décrivez ce que vous voulez').fill('Affiche pour ma robe, texte PROMO -20 %');
    await page.getByRole('checkbox', { name: /Je confirme/ }).click();
    await generateButton(page).click();
    await expect(page.getByText(/crédits utilisés/)).toBeVisible({ timeout: 40_000 });

    // Mode simulation : annoncé en toutes lettres, jamais présenté comme une création de l'IA.
    await expect(page.getByText('Simulation · aucune IA utilisée')).toBeVisible();
    await expect(page.getByText('Généré par IA · Yamboka')).toHaveCount(0);
    // Le résultat respecte le format demandé (576 × 768 pour du 3:4) et n'est pas la photo envoyée (1 × 1).
    const img = page.locator('figure img').first();
    await expect(img).toBeVisible();
    const size = await img.evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
    expect(size).toEqual({ w: 576, h: 768 });
    // Aucun nom de style ni titre inventé : titre neutre, et le texte demandé est le seul texte de l'utilisateur.
    await page.goto('/app/creations');
    await page.getByRole('link', { name: /^Affiche — prête/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Votre affiche' })).toBeVisible();
    for (const invented of ['Boutique en vitrine', 'Affiche e2e']) await expect(page.getByText(invented)).toHaveCount(0);
    await expect(page.getByText('Affiche pour ma robe, texte PROMO -20 %')).toBeVisible();
  });
});
