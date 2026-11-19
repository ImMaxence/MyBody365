import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, signIn, tab, watchErrors } from './helpers';
import { makePng } from './png';

test.describe('photos', () => {
  test('today’s photo: import, keep, see it in the grid and on Today, then delete it', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await tab(page, 'Photos').click();
    await expect(page.getByRole('heading', { name: 'Photos', level: 1 })).toBeVisible();
    await expect(page.getByText('Ta première photo t’attend')).toBeVisible();
    await expect(page.getByText(/Tes photos ne sont visibles que par toi/)).toBeVisible();
    await expectAccessible(page);

    // the camera screen (no camera in the test browser): import from the gallery
    await page.getByRole('link', { name: /Prendre la photo du jour/ }).click();
    await expect(page.getByRole('radio', { name: 'Face' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Profil' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: makePng() });
    await page.getByRole('button', { name: 'Garder cette photo' }).click();

    // back on the tab: the photo of the day is there
    await expect(page.getByText('Photo du jour prise')).toBeVisible();
    const tile = page.getByRole('link', { name: /Ouvrir la photo du/ });
    await expect(tile).toHaveCount(1);
    await expect(tile.getByText('Profil')).toBeVisible();
    await expect(page.getByText(/Stockage : .* sur 2 Go/)).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 1.9: blurred on this phone with one tap, still blurred after a reload, visible again with another
    await page.getByRole('button', { name: 'Flouter les photos' }).click();
    await expect(page.getByText(/Photos floutées sur ce téléphone/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Afficher les photos' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Afficher les photos' }).click();
    await expect(page.getByText(/Photos floutées sur ce téléphone/)).toHaveCount(0);

    // the viewer, then the deletion
    await tab(page, 'Photos').click();
    await tile.click();
    await expect(page.getByText('Profil · Pas de pesée ce jour-là').or(page.getByText(/Profil · .* kg ce jour-là/))).toBeVisible();
    const img = page.locator('figure.frame img');
    await expect(img).toHaveJSProperty('complete', true);
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(600);
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText('Ta première photo t’attend')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('today’s photo picked in the gallery, straight from the tab (1.10)', async ({ page }) => {
    await signIn(page, 'new');
    await tab(page, 'Photos').click();
    await expect(page.getByRole('button', { name: 'Importer depuis ma galerie' })).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: makePng(400, 500) });
    // the camera screen shows it at once, its pose still to choose
    await expect(page.getByRole('button', { name: 'Garder cette photo' })).toBeVisible();
    await page.getByRole('radio', { name: 'Dos' }).click();
    await page.getByRole('button', { name: 'Garder cette photo' }).click();
    await expect(page.getByText('Photo du jour prise')).toBeVisible();
    await expect(page.getByRole('link', { name: /Ouvrir la photo du/ }).getByText('Dos')).toBeVisible();
  });

  test('a photo is private: another account gets a 404', async ({ page, browser }) => {
    await signIn(page, 'new');
    await page.goto('/app/photos/camera');
    await page.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: makePng(400, 500) });
    await page.getByRole('button', { name: 'Garder cette photo' }).click();
    await expect(page.getByText('Photo du jour prise')).toBeVisible();
    const src = await page.locator('.tile img').first().getAttribute('src');
    expect(src).toMatch(/^\/api\/photos\/[0-9a-f-]+\/thumb$/);
    expect((await page.request.get(src!)).status()).toBe(200);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, 'user');
    expect((await otherPage.request.get(src!)).status()).toBe(404);
    await other.close();
  });

  test('before / after and time-lapse with two photos', async ({ page }) => {
    await signIn(page, 'new');
    const csrf = async () => (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    // two days of photos, uploaded straight to the API
    for (const [day, hue] of [
      [-10, 0],
      [0, 120],
    ] as const) {
      const d = new Date();
      d.setDate(d.getDate() + day);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await page.request.post('/api/me/photos', {
        headers: { 'X-XSRF-TOKEN': await csrf() },
        multipart: { file: { name: 'p.png', mimeType: 'image/png', buffer: makePng(300, 400, hue) }, day: iso, pose: 'FRONT' },
      });
      expect(res.status()).toBe(201);
    }
    // 1.9: from one photo to the other without going back to the grid
    await page.goto('/app/photos');
    await page.getByRole('link', { name: /Ouvrir la photo du/ }).first().click();
    await expect(page.getByText('1 sur 2')).toBeVisible();
    await page.getByRole('button', { name: 'Photo plus ancienne' }).click();
    await expect(page.getByText('2 sur 2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Photo plus ancienne' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Photo plus récente' }).click();
    await expect(page.getByText('1 sur 2')).toBeVisible();
    await expectAccessible(page);

    await page.goto('/app/photos');
    await page.getByRole('link', { name: 'Comparer' }).click();
    await expect(page.getByRole('heading', { name: 'Avant / après' })).toBeVisible();
    await expect(page.getByText('10 jours d’écart')).toBeVisible();
    const slider = page.getByRole('slider', { name: 'Fais glisser pour comparer' });
    await slider.fill('25');
    await expect(page.locator('.frames')).toHaveAttribute('style', /--split: 25%/);
    await page.getByRole('button', { name: 'Côte à côte' }).click();
    await expect(page.locator('.side figure')).toHaveCount(2);
    await expectAccessible(page);

    await page.goto('/app/photos/timelapse');
    await expect(page.getByText('Image 1 sur 2')).toBeVisible();
    await page.getByRole('button', { name: 'Lecture' }).click();
    await expect(page.getByText('Image 2 sur 2')).toBeVisible();
  });
});
