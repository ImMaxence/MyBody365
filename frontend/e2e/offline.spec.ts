import { expect, test } from '@playwright/test';
import { expectAccessible, press, signIn, tab } from './helpers';

test.describe('offline (1.18)', () => {
  test('opens without network on what it showed last time, says since when, and logs the loss and the return', async ({ page }) => {
    // the service worker installs within 30 s of the start, and a loss is written down after 8 s
    test.setTimeout(150_000);
    await signIn(page, 'new');
    // the app's service worker in charge of the page: it keeps the app itself for the starts without network
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
    // Today and Meals seen once with the network: their answers are kept on the phone
    const weigh = page.getByRole('button', { name: /Pesée du jour/ });
    await expect(weigh).toContainText('kg');
    await tab(page, 'Repas').click();
    await expect(page.getByRole('heading', { name: 'Petit-déjeuner' })).toBeVisible();
    await tab(page, 'Aujourd’hui').click();
    await expect(weigh).toBeVisible();

    // no network, and the app started again (a phone closes the apps left in the background)
    await page.context().setOffline(true);
    await page.reload();
    // the app, not the sign-in screen: the day as it was (the onboarding weighed day 1: nothing « À faire »)
    await expect(page).toHaveURL(/\/app\/?(\?.*)?$/);
    await expect(weigh).toContainText('kg');
    await expect(weigh).not.toContainText('À faire');
    const pill = page.getByRole('status').filter({ hasText: /Hors ligne depuis \d\d:\d\d/ });
    await expect(pill).toBeVisible();
    // Meals opens on what it showed
    await tab(page, 'Repas').click();
    await expect(page.getByRole('heading', { name: 'Petit-déjeuner' })).toBeVisible();

    // a weigh-in changed meanwhile waits on the phone
    await tab(page, 'Aujourd’hui').click();
    await weigh.click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'Pesée du jour' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Moins 100 grammes' }).click();
    await press(sheet.getByRole('button', { name: 'Enregistrer' }));
    await expect(pill).toContainText('1 en attente');

    // the notification centre, from the pill: when the network went
    await page.waitForTimeout(8_500);
    await pill.click();
    await expect(page.getByRole('heading', { name: 'Centre des notifications' })).toBeVisible();
    await expect(page.getByText('Connexion perdue')).toBeVisible();
    await expect(page.getByText(/Toujours hors ligne/)).toBeVisible();
    await expectAccessible(page);

    // back: what waited goes, and the return is written down with how long it lasted
    await page.context().setOffline(false);
    await expect(page.getByText('Connexion revenue')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/Après \d+ s sans réseau · 1 saisie envoyée/)).toBeVisible({ timeout: 15_000 });
    await tab(page, 'Aujourd’hui').click();
    await expect(weigh).toContainText('kg');
  });
});
