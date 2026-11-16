import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, openApp, signIn, tab, watchErrors } from './helpers';

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
    await page.getByRole('button', { name: 'Sombre' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Clair' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Auto' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profile');
    await page.getByRole('button', { name: 'Français' }).click();
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
