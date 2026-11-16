import { expect, test } from '@playwright/test';
import { expectAccessible } from './helpers';

test.describe('site extras', () => {
  test('the changelog page shows CHANGELOG.md in French, linked from the footer', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('link', { name: /What’s new \(in French\)/ }).click();
    await expect(page).toHaveURL(/\/changelog$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouveautés');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { name: /^v\d+\.\d+\.\d+$/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ajouté' }).first()).toBeVisible();
    await expectAccessible(page);
  });

  test('the changelog is prerendered', async ({ request }) => {
    const html = await (await request.get('/changelog')).text();
    expect(html).toContain('Nouveautés');
    expect(html).toMatch(/v\d+\.\d+\.\d+/);
  });

  test('light / dark switch on the site, remembered from the first paint', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Passer en thème sombre' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // the choice is applied by the inline script before Angular starts
    await page.route('**/main-*.js', (route) => route.abort());
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.unroute('**/main-*.js');
    await page.reload();
    await page.getByRole('button', { name: 'Passer en thème clair' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('interface texts carry no final full stop, legal texts do', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero .lead')).not.toHaveText(/\.\s*$/);
    await page.goto('/legal/mentions');
    await expect(page.locator('section p').first()).toHaveText(/\.\s*$/);
  });
});
