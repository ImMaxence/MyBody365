import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, openApp, signIn, tab, watchErrors } from './helpers';
import { makePng } from './png';

test('the profile: a picture of my own and a new username', async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page, 'new');
  await page.goto('/app/account');
  await page.getByRole('button', { name: 'Changer la photo de profil' }).click();
  const sheet = page.getByRole('dialog', { name: 'Photo de profil' });
  await sheet.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: makePng(600, 400) });
  await expect(page.getByText('Photo de profil mise à jour')).toBeVisible();
  // 1.9: with a picture, a tap opens it big (as on Instagram), « Changer » under it
  await page.getByRole('button', { name: 'Voir ma photo de profil en grand' }).click();
  const zoom = page.locator('.avatar-zoom');
  await expect(zoom.locator('img')).toHaveAttribute('src', /\/avatar\?v=\d+/);
  await expect(zoom.getByRole('button', { name: 'Changer la photo de profil' })).toBeVisible();
  await zoom.click({ position: { x: 10, y: 10 } });
  await expect(zoom).toHaveCount(0);
  await expect(page.locator('.avatar-btn img')).toHaveAttribute('src', /\/api\/users\/.+\/avatar\?v=\d+/);
  const src = await page.locator('.avatar-btn img').getAttribute('src');
  expect((await page.request.get(src!)).status()).toBe(200);

  await page.getByRole('button', { name: 'Modifier le nom d’utilisateur' }).click();
  const name = page.getByRole('dialog', { name: 'Nom d’utilisateur' });
  await name.getByRole('textbox').fill('a');
  await expect(name.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  const handle = 'e2e_' + (Date.now() % 1000000);
  await name.getByRole('textbox').fill(handle);
  await name.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Nom d’utilisateur enregistré')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Modifier le nom d’utilisateur' })).toContainText(handle);
  await expectAccessible(page);
  expect(errors).toEqual([]);
});

test.describe('the app', () => {
  test('a browser tab that is not the installed app is sent to the install guide', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/#install$/);
  });

  test('sign-in screen: passkey, request access, recovery', async ({ page }) => {
    const errors = watchErrors(page);
    await openApp(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ta transformation commence ici');
    await expect(page.getByRole('button', { name: 'Se connecter avec une passkey' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Demander un accès/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /lien de récupération/ })).toBeVisible();
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

  test('a refused Google account is told so on the sign-in screen', async ({ page }) => {
    await openApp(page, '/app/login?error=not_allowed');
    await expect(page.getByRole('alert')).toContainText('n’a pas encore accès');
  });

  test('requesting access', async ({ page }) => {
    await openApp(page);
    await page.getByRole('link', { name: /Demander un accès/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demander un accès');
    // back pops the stack: the sign-in screen as it was opened
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page).toHaveURL(/\/app\/login(\?.*)?$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ta transformation commence ici');
  });

  test('requesting access as the very first request of a visit (CSRF token fetched first)', async ({ page }) => {
    await openApp(page, '/app/request');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demander un accès');
    const send = page.getByRole('button', { name: 'Envoyer la demande' });
    await page.getByLabel('Adresse e-mail (Google)').fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel('Ton prénom').fill('Camille');
    await page.getByLabel('Un mot pour l’admin (facultatif)').fill('Coucou, c’est Camille');
    await expect(send).toBeDisabled(); // the 18+ box is not ticked yet
    await page.getByRole('checkbox', { name: 'J’ai 18 ans ou plus' }).check();
    await send.click();
    await expect(page.getByRole('heading', { name: 'Demande envoyée' })).toBeVisible();
  });

  test('first sign-in: the two consents, then Today', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'user');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Léa');
    await expect(page.getByText('Flamme', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectAccessible(page);

    // tabs
    await tab(page, 'Repas').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Repas');
    await tab(page, 'Profil').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profil');
    // a regular account has no admin entry
    await expect(page.getByRole('link', { name: /Administration/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('profile: theme, language, sign-out', async ({ page }) => {
    await signIn(page, 'user');
    await tab(page, 'Profil').click();
    // the app's settings have their own page
    await page.getByRole('link', { name: /Apparence et langue/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Apparence et langue');
    await page.getByRole('button', { name: 'Sombre' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Clair' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Auto' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Appearance and language');
    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Apparence et langue');
    await page.getByRole('button', { name: /Retour/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profil');

    await page.getByRole('link', { name: /Connexion et sécurité/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion et sécurité');
    await expect(page.getByRole('button', { name: 'Ajouter une passkey' })).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/app\/login$/);
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.authenticated).toBe(false);
  });
});
