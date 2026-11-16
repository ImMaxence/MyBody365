import { expect, test } from '@playwright/test';
import { expectAccessible, signIn, tab, watchErrors } from './helpers';

test.describe('backups', () => {
  test('download a backup, then restore it after its preview', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /Sauvegardes/ }).click();
    await expect(page.getByRole('heading', { name: 'Sauvegardes', level: 1 })).toBeVisible();
    await expect(page.getByText(/pas encore disponible sur ce serveur/)).toBeVisible();
    await expectAccessible(page);

    const link = page.getByRole('link', { name: 'Télécharger' });
    await expect(link).toHaveAttribute('href', '/api/me/backup/export');
    const res = await page.request.get('/api/me/backup/export');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/zip');
    const zip = await res.body();
    expect(zip.subarray(0, 2).toString()).toBe('PK');

    await page.locator('input[type=file]').setInputFiles({ name: 'mybody365.zip', mimeType: 'application/zip', buffer: zip });
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Ce qui va changer' })).toBeVisible();
    await expect(sheet.getByText('Pesées et mensurations')).toBeVisible();
    await expect(sheet.getByText('Rien de différent').first()).toBeVisible();
    await sheet.getByRole('radio', { name: /Fusionner/ }).click();
    await sheet.getByRole('button', { name: 'Restaurer' }).click();
    await expect(page.getByText(/Sauvegarde restaurée : 1 pesées/)).toBeVisible();
    expect(errors).toEqual([]);
  });
});
