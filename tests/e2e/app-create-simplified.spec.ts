import type { Page } from '@playwright/test';
import { APP_URL } from '../playwright.config';
import { expect, signUpVerified, test, uniqueEmail } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function accountWithCredits(page: Page, request: Parameters<typeof signUpVerified>[1]) {
  await signUpVerified(page, request, uniqueEmail('simple'));
  const { packs } = await (await page.request.get('/api/catalog/packs')).json();
  const starter = packs.find((p: { name: string }) => p.name === 'Starter');
  const created = await page.request.post('/api/payments', { data: { packId: starter.id, operator: 'MTN', phone: '+242061234567' }, headers: { origin: APP_URL } });
  expect(created.status()).toBe(201);
  const { payment } = await created.json();
  const done = await page.request.post(`/api/payments/${payment.id}/simulate`, { data: { outcome: 'success', callbacks: 1 }, headers: { origin: APP_URL } });
  expect(done.ok()).toBeTruthy();
  await page.goto('/app/creer');
}

test.describe('Création vidéo épurée', () => {
  test('aucune suggestion ni case à cocher dans le formulaire ; le consentement est demandé à la confirmation', async ({ page, request }) => {
    await accountWithCredits(page, request);
    await expect(page.getByLabel('Décrivez votre vidéo')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Idées' })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByText('Cette photo montre une personne.')).toHaveCount(0);

    // Photo et description (rejoué : la page peut ne pas être encore hydratée).
    await expect(async () => {
      await page.locator('input[type="file"]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByAltText('Photo choisie')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
    await page.getByLabel('Décrivez votre vidéo').fill('Le produit tourne lentement sur fond clair');

    await page.getByRole('button', { name: /^Générer la vidéo/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    // Sans consentement, impossible de lancer.
    const launch = dialog.getByRole('button', { name: /^Lancer/ });
    await expect(launch).toBeDisabled();
    await dialog.getByRole('checkbox').click();
    await expect(launch).toBeEnabled();
    await launch.click();
    await expect(page.getByText('Création en cours…')).toBeVisible();
  });
});
