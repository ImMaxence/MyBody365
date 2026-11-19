import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, signIn, tab, watchErrors, press } from './helpers';

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
    await expect(sheet).toBeHidden();
    // anywhere on the card opens it too
    await page.locator('section.streak .big').click();
    await expect(sheet.getByRole('heading', { name: /Ta flamme/ })).toBeVisible();

    // its look: a real flame by default, an icon and a colour of one's own
    await expect(page.locator('section.streak .flame-emoji')).toHaveText('🔥');
    await sheet.getByRole('button', { name: 'Personnaliser' }).click();
    const look = page.getByRole('dialog', { name: 'Ta série, à ton image' });
    await look.getByRole('button', { name: 'Bras musclé' }).click();
    await look.getByRole('button', { name: 'Violet' }).click();
    await expect(look.getByRole('button', { name: 'Bras musclé' })).toHaveAttribute('aria-pressed', 'true');
    await expect(look.getByRole('button', { name: 'Violet' })).toHaveAttribute('aria-pressed', 'true');
    await expectAccessible(page);
    await look.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.locator('section.streak .flame-emoji')).toHaveText('💪');
    // kept with the account
    await page.reload();
    await expect(page.locator('section.streak .flame-emoji')).toHaveText('💪');
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
    // 1.11: the photo of the day at its own time; on by default since 1.12
    const photo = page.getByRole('switch', { name: /Photo du jour/ });
    await expect(photo).toBeChecked();
    await expect(page.getByLabel('Heure du rappel photo')).toHaveValue('19:00');
    await page.getByLabel('Heure du rappel photo').fill('20:30');
    await expect(page.getByText('Réglages enregistrés').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.reload();
    await expect(page.getByLabel('Heure du rappel', { exact: true })).toHaveValue('07:30');
    await expect(page.getByRole('switch', { name: /Nouveautés de l’app/ })).not.toBeChecked();
    await expect(page.getByLabel('Heure du rappel photo')).toHaveValue('20:30');
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
    await press(page.getByRole('button', { name: 'Plus : Tours' }));
    await expect(page.getByText('Durée totale : 4:20')).toBeVisible();
    // a value typed rather than stepped to: 45 s of effort
    await page.getByRole('button', { name: 'Saisir Effort : 0:20' }).click();
    const value = page.getByRole('dialog', { name: 'Effort' });
    await value.getByLabel('Secondes').fill('45');
    await value.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByText('Durée totale : 8:05')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tabata' })).toHaveAttribute('aria-pressed', 'false');
    // what the timer is, and is not
    await expect(page.getByText(/n’ajoute pas de calories à manger/)).toBeVisible();
    await expectAccessible(page);
    await press(page.getByRole('button', { name: 'Démarrer' }));
    const timer = page.getByRole('timer');
    await expect(timer).toHaveAttribute('aria-label', /^Prêt/);
    await press(page.getByRole('button', { name: 'Pause' }));
    await expect(page.getByRole('button', { name: 'Reprendre' })).toBeVisible();
    await press(page.getByRole('button', { name: 'Passer à la suite' }));
    await expect(timer).toHaveAttribute('aria-label', /^Effort/);
    await expect(page.getByText('Tour 1 sur 9', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByText(/le minuteur continue/)).toBeVisible();

    // it goes on elsewhere, even through a reload of the app: the pill above the tabs leads back to it
    await page.goto('/app');
    const pill = page.getByRole('link', { name: /^Minuteur en cours : Effort/ });
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(page.getByRole('heading', { name: 'Minuteur', level: 1 })).toBeVisible();
    await expect(timer).toHaveAttribute('aria-label', /^Effort/);
    await expect(page.getByRole('link', { name: /^Minuteur en cours/ })).toHaveCount(0);
    await press(page.getByRole('button', { name: 'Arrêter' }));
    await expect(page.getByRole('button', { name: 'Démarrer' })).toBeVisible();

    // saved under a name of one's own, then deleted
    await page.getByRole('button', { name: 'Enregistrer ce chrono' }).click();
    const sheet = page.getByRole('dialog', { name: 'Enregistrer ce chrono' });
    // like a phone app: the texts cannot be selected, the fields can (typing, copy, paste)
    const selectable = (l: import('@playwright/test').Locator) =>
      l.evaluate((e) => getComputedStyle(e).getPropertyValue('user-select') || getComputedStyle(e).getPropertyValue('-webkit-user-select'));
    expect(await selectable(page.locator('body'))).toBe('none');
    expect(await selectable(sheet.getByLabel('Nom du chrono'))).toBe('text');
    await sheet.getByLabel('Nom du chrono').fill('Gainage du soir');
    await sheet.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('button', { name: 'Gainage du soir', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Tabata' }).click();
    await expect(page.getByRole('button', { name: 'Tabata' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Gainage du soir', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Gainage du soir', exact: true }).click();
    await page.getByRole('button', { name: 'Supprimer « Gainage du soir »' }).click();
    await expect(page.getByRole('button', { name: 'Gainage du soir', exact: true })).toHaveCount(0);

    // 1.9: the timer is a timer, nothing to note
    await expect(page.getByText('Aucune séance notée cette semaine')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('glasses of water: turned on from Today', async ({ page }) => {
    await signIn(page, 'new');
    await expect(page.locator('app-water-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'Activer', exact: true }).click();
    await expect(page.locator('app-water-card')).toContainText(/Encore \d+ verres pour ton objectif/);
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /^Eau/ }).click();
    await expect(page.getByRole('checkbox', { name: /Verres d’eau/ })).toBeChecked();
  });

  test('glasses of water: off until turned on in the profile', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await expect(page.locator('app-water-card')).toHaveCount(0);
    await tab(page, 'Profil').click();
    // its own page, out of the profile
    await page.getByRole('link', { name: /^Eau/ }).click();
    await page.getByRole('checkbox', { name: /Verres d’eau/ }).check();
    await expect(page.getByText(/verres, soit/)).toBeVisible();
    await expectAccessible(page);
    await tab(page, 'Aujourd’hui').click();
    // 1.9: big glasses, the next one with a « + »; a tap on a full one empties it
    const card = page.locator('app-water-card');
    await expect(card.getByRole('button', { name: 'Verre 1 : le boire' })).toBeVisible();
    await press(card.getByRole('button', { name: 'Verre 1 : le boire' }));
    await press(card.getByRole('button', { name: 'Verre 2 : le boire' }));
    await press(card.getByRole('button', { name: 'Verre 3 : le boire' }));
    await expect(card).toContainText(/0,75\s*\/\s*[\d,]+ L/);
    await press(card.getByRole('button', { name: 'Verre 3, bu : le retirer' }));
    await expect(card).toContainText(/0,5\s*\/\s*[\d,]+ L/);
    await expectAccessible(page);
    await page.reload();
    await expect(page.locator('app-water-card')).toContainText(/0,5\s*\/\s*[\d,]+ L/);
    await press(page.locator('app-water-card').getByRole('button', { name: /^Retirer un verre/ }));
    await expect(page.locator('app-water-card')).toContainText(/0,25\s*\/\s*[\d,]+ L/);
    expect(errors).toEqual([]);
  });
});
