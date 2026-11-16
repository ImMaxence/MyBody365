import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, signIn, tab, watchErrors } from './helpers';

test.describe('engagement', () => {
  test('the flame sheet: record, freezes and the last 28 days', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await page.getByRole('button', { name: 'Voir le détail de ta flamme' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: /Ta flamme/ })).toBeVisible();
    await expect(sheet.getByText(/Record : 1 jours/)).toBeVisible();
    await expect(sheet.getByRole('img', { name: 'Les 28 derniers jours' }).locator('.cell')).toHaveCount(28);
    await expect(sheet.locator('.cell.today, .cell.done')).toHaveCount(1);
    await expectAccessible(page);
    await sheet.getByRole('button', { name: 'Fermer' }).click();
    expect(errors).toEqual([]);
  });

  test('reminder settings are saved', async ({ page }) => {
    await signIn(page, 'new');
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /Notifications/ }).click();
    await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Heure du rappel', { exact: true })).toHaveValue('08:00');
    await page.getByLabel('Heure du rappel', { exact: true }).fill('07:30');
    await page.getByRole('checkbox', { name: /Rappel salle/ }).check();
    await page.getByRole('button', { name: 'mardi' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Réglages enregistrés')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Heure du rappel', { exact: true })).toHaveValue('07:30');
    await expect(page.getByRole('button', { name: 'mardi' })).toHaveAttribute('aria-pressed', 'true');
    await expectAccessible(page);
  });

  test('a guided workout: sets, rest, finish, history', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await page.getByRole('link', { name: /Séance du jour/ }).click();
    await expect(page.getByRole('heading', { name: 'Salle et séances' })).toBeVisible();
    await page.getByRole('button', { name: /À la maison, sans matériel/ }).click();
    await page.getByRole('link', { name: /Commencer · Circuit/ }).click();
    await expect(page.getByRole('heading', { name: /Circuit · À la maison/ })).toBeVisible();
    const squats = page.getByRole('group', { name: 'Squats' });
    await squats.getByRole('button', { name: 'Série 2 à faire' }).click();
    await expect(squats.getByRole('button', { name: 'Série 2 faite' })).toBeVisible();
    await expect(page.getByRole('timer')).toContainText('Repos');
    await page.getByRole('button', { name: 'Passer' }).click();
    await expect(page.getByText('2 séries sur 24')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Terminer la séance' }).click();
    await expect(page.getByText('Séance enregistrée, bravo 💪')).toBeVisible();
    await expect(page.getByRole('button', { name: /À la maison, sans matériel · Circuit/ })).toBeVisible();
    await expect(page.getByText(/2 série\(s\)/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
