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

  test('reminder settings are saved at once', async ({ page }) => {
    await signIn(page, 'new');
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /Notifications/ }).click();
    await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Heure du rappel', { exact: true })).toHaveValue('08:00');
    await page.getByLabel('Heure du rappel', { exact: true }).fill('07:30');
    await expect(page.getByText('Réglages enregistrés')).toBeVisible();
    // the new versions: on by default, a switch turns them off
    const updates = page.getByRole('switch', { name: /Nouveautés de l’app/ });
    await expect(updates).toBeChecked();
    await updates.uncheck();
    // water reminders wait for the glasses of water
    await expect(page.getByRole('switch', { name: /Pense à boire/ })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await page.reload();
    await expect(page.getByLabel('Heure du rappel', { exact: true })).toHaveValue('07:30');
    await expect(page.getByRole('switch', { name: /Nouveautés de l’app/ })).not.toBeChecked();
    await expectAccessible(page);
  });

  test('the timer: a preset, the ready count, pause, skip, stop', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await page.getByRole('link', { name: /Minuteur/ }).click();
    await expect(page.getByRole('heading', { name: 'Minuteur', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Tabata' }).click();
    await expect(page.getByRole('button', { name: 'Tabata' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Durée totale : 3:50')).toBeVisible();
    await page.getByRole('button', { name: 'Plus : Tours' }).click();
    await expect(page.getByText('Durée totale : 4:20')).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Démarrer' }).click();
    const timer = page.getByRole('timer');
    await expect(timer).toHaveAttribute('aria-label', /^Prêt/);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Reprendre' })).toBeVisible();
    await page.getByRole('button', { name: 'Passer à la suite' }).click();
    await expect(timer).toHaveAttribute('aria-label', /^Effort/);
    await expect(page.getByText('Tour 1 sur 9', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Arrêter' }).click();
    await expect(page.getByRole('button', { name: 'Démarrer' })).toBeVisible();

    // saved under a name of one's own, then deleted
    await page.getByRole('button', { name: 'Enregistrer ce chrono' }).click();
    const sheet = page.getByRole('dialog', { name: 'Enregistrer ce chrono' });
    await sheet.getByLabel('Nom du chrono').fill('Gainage du soir');
    await sheet.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('button', { name: 'Gainage du soir', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Tabata' }).click();
    await expect(page.getByRole('button', { name: 'Tabata' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Gainage du soir', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Gainage du soir', exact: true }).click();
    await page.getByRole('button', { name: 'Supprimer « Gainage du soir »' }).click();
    await expect(page.getByRole('button', { name: 'Gainage du soir', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('glasses of water: turned on from Today', async ({ page }) => {
    await signIn(page, 'new');
    await expect(page.locator('app-water-row')).toHaveCount(0);
    await page.getByRole('button', { name: 'Activer', exact: true }).click();
    await expect(page.locator('app-water-row')).toContainText(/0 \/ \d+ verres/);
    await tab(page, 'Profil').click();
    await expect(page.getByRole('checkbox', { name: /Verres d’eau/ })).toBeChecked();
  });

  test('glasses of water: off until turned on in the profile', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await expect(page.locator('app-water-row')).toHaveCount(0);
    await tab(page, 'Profil').click();
    await page.getByRole('checkbox', { name: /Verres d’eau/ }).check();
    await expect(page.getByText(/verres, soit/)).toBeVisible();
    await expectAccessible(page);
    await tab(page, 'Aujourd’hui').click();
    const row = page.locator('app-water-row');
    await expect(row).toContainText(/0 \/ \d+ verres/);
    await row.getByRole('button', { name: 'Ajouter un verre' }).click();
    await row.getByRole('button', { name: 'Ajouter un verre' }).click();
    await expect(row).toContainText(/2 \/ \d+ verres/);
    await page.reload();
    await expect(page.locator('app-water-row')).toContainText(/2 \/ \d+ verres/);
    expect(errors).toEqual([]);
  });
});
