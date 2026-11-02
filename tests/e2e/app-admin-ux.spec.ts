import { adminLogin, appAlerts, codeFor, expect, signUpVerified, test, uniqueEmail } from './helpers';

test.describe('Administration — composants partagés (période, menus d’actions)', () => {
  test('le sélecteur de période est compact et met réellement à jour le tableau de bord', async ({ page }) => {
    await adminLogin(page);
    const trigger = page.getByRole('button', { name: /30 derniers jours/ });
    await expect(trigger).toBeVisible();
    // Un seul contrôle au lieu d'une rangée de boutons : aucun raccourci n'est affiché tant que le menu est fermé.
    await expect(page.getByRole('button', { name: '7 derniers jours' })).toHaveCount(0);

    await trigger.click();
    await page.getByRole('button', { name: '7 derniers jours' }).click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole('button', { name: /7 derniers jours/ })).toBeVisible();
    await expect(page.getByText(/Activité du/)).toBeVisible();

    // Période personnalisée : « Appliquer » reste inactif tant que la fin n'est pas choisie.
    await page.getByRole('button', { name: /7 derniers jours/ }).click();
    await page.getByRole('button', { name: 'Appliquer' }).isDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Appliquer' })).toHaveCount(0);
  });

  test('le menu ⋮ des packs regroupe les actions, ouvre le bon dialogue et confirme le résultat', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/packs');
    const row = page.getByRole('row', { name: /Starter/ });
    // Plus de boutons alignés dans la colonne : un seul bouton de menu par ligne.
    await expect(row.getByRole('button')).toHaveCount(1);
    await row.getByRole('button', { name: 'Actions pour le pack Starter' }).click();
    const items = page.getByRole('menuitem');
    await expect(items.filter({ hasText: 'Modifier' })).toBeVisible();
    await expect(items.filter({ hasText: 'Désactiver' })).toBeVisible();
    await expect(items.filter({ hasText: 'Retirer des pages publiques' })).toBeVisible();

    await items.filter({ hasText: 'Modifier' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Modifier « Starter »/ })).toBeVisible();
    await expect(dialog.getByLabel('Prix (FCFA)')).toHaveValue('5000');
    // Le motif est exigé : sans lui, rien n'est envoyé.
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);

    // Le focus revient sur le bouton du menu à la fermeture.
    await expect(row.getByRole('button', { name: 'Actions pour le pack Starter' })).toBeFocused();
    await expect(appAlerts(page)).toHaveCount(0);
  });

  test('une action de menu réelle est appliquée puis annoncée par une notification', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/presets');
    const first = page.getByRole('row').nth(1);
    const trigger = first.getByRole('button', { name: /^Actions pour le preset/ });
    await trigger.click();
    const item = page.getByRole('menuitem').first();
    const label = (await item.textContent())!.trim();
    await item.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Motif/).fill('Test de recette de l’interface');
    await dialog.locator('button[type=submit]').click();
    await expect(page.getByRole('status').filter({ hasText: 'Modification enregistrée' })).toBeVisible();
    // Le libellé s'inverse : Publier ↔ Dépublier.
    await trigger.click();
    await expect(page.getByRole('menuitem').first()).not.toHaveText(label);
  });

  test('colonne « Actions » : en-tête explicite, aucun filet vertical, menu non coupé', async ({ page }) => {
    await adminLogin(page);
    for (const path of ['/admin/packs', '/admin/produits', '/admin/presets', '/admin/utilisateurs']) {
      await page.goto(path);
      const header = page.getByRole('columnheader', { name: 'Actions', exact: true });
      await expect(header).toBeVisible();
      const border = await header.evaluate((el) => getComputedStyle(el).borderLeftWidth);
      expect(border).toBe('0px');
      const cell = page.locator('tbody tr').first().locator('td').last();
      expect(await cell.evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe('0px');
    }
    await page.goto('/admin/packs');
    await page.getByRole('button', { name: /^Actions pour le pack/ }).last().click();
    const menu = page.getByRole('menu');
    const box = (await menu.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  });

  test('les erreurs de saisie des dialogues d’administration sont en français', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/finances');
    await page.getByRole('button', { name: 'Saisir une recharge' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('button[type=submit]').click();
    await expect(dialog.getByText('Ce champ est obligatoire.').first()).toBeVisible();
    await expect(dialog.getByText(/Invalid input/)).toHaveCount(0);
  });

  test('achat de crédits : le formulaire incomplet explique ce qui manque, en français', async ({ page, request }) => {
    await signUpVerified(page, request, uniqueEmail('achat-ux'));
    await page.goto('/app/credits');
    await page.getByRole('button', { name: /^Payer/ }).click();
    await expect(page.getByText('Choisissez MTN ou Airtel.')).toBeVisible();
    await expect(page.getByText(/Numéro invalide/)).toBeVisible();
    await expect(page.getByText(/Invalid input/)).toHaveCount(0);
  });

  test('paramètres : onglets, compteur de modifications, enregistrement avec motif', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/parametres');
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveText([/Général/, /Rentabilité/, /Génération/, /Fichiers/, /Sécurité/]);
    await expect(page.getByRole('tab', { name: /Général/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('group', { name: 'Mode maintenance' })).toBeVisible();

    // La navigation au clavier change d'onglet (flèche droite), le contenu suit.
    await page.getByRole('tab', { name: /Général/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /Rentabilité/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Marge minimale (%)')).toBeVisible();

    const margin = page.getByLabel('Marge minimale (%)');
    const before = await margin.inputValue();
    await margin.fill(String(Number(before) + 1));
    // Le compteur s'affiche sur l'onglet modifié, même quand on change d'onglet.
    await expect(page.getByRole('tab', { name: /Rentabilité.*1 modification/ })).toBeVisible();
    await page.getByRole('tab', { name: /Sécurité/ }).click();
    await expect(page.getByRole('tab', { name: /Rentabilité.*1 modification/ })).toBeVisible();

    const save = page.getByRole('button', { name: /Enregistrer 1 modification/ });
    await expect(save).toBeDisabled();
    await expect(page.getByText(/motif d’au moins 5 caractères/)).toBeVisible();
    await page.getByLabel(/Motif de la modification/).fill('Test de recette des onglets');
    await save.click();
    await expect(page.getByText('Paramètres enregistrés et consignés au journal d’audit.')).toBeVisible();

    // Remise en état de la valeur d'origine (la base e2e est partagée entre projets).
    await page.getByRole('tab', { name: /Rentabilité/ }).click();
    await page.getByLabel('Marge minimale (%)').fill(before);
    await page.getByLabel(/Motif de la modification/).fill('Remise en état après test');
    await page.getByRole('button', { name: /Enregistrer 1 modification/ }).click();
    await expect(page.getByText('Paramètres enregistrés et consignés au journal d’audit.')).toBeVisible();
  });

  test('code de vérification : cases séparées 2-2-2, bouton actif seulement quand le code est complet', async ({ page, request }) => {
    const email = uniqueEmail('otp-ux');
    await page.goto('/inscription');
    await page.getByLabel('Prénom').fill('Marie');
    await page.getByLabel('Nom', { exact: true }).fill('Ndinga');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('Motdepasse-2026!');
    await page.getByLabel('Confirmer le mot de passe').fill('Motdepasse-2026!');
    await page.getByRole('checkbox', { name: /J’accepte/ }).click();
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page).toHaveURL(/\/verifier-email/);
    await expect(page.locator('[data-slot="input-otp-slot"]')).toHaveCount(6);
    await expect(page.locator('[data-slot="input-otp-separator"]')).toHaveCount(2);
    const input = page.getByLabel('Code de vérification');
    const validate = page.getByRole('button', { name: 'Valider le code' });
    await input.click();
    await page.keyboard.type('123');
    await expect(validate).toBeDisabled();
    // Les lettres sont refusées : seuls les chiffres sont acceptés.
    await page.keyboard.type('ab');
    await expect(validate).toBeDisabled();
    await input.fill(await codeFor(request, email));
    await expect(validate).toBeEnabled();
    await validate.click();
    await expect(page).toHaveURL(/\/app$/);
  });
});
