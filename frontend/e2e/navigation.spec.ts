import { expect, test, type Page } from '@playwright/test';
import { signIn, tab } from './helpers';

/** records every screen transition kind (html[data-nav]) set from now on */
async function recordTransitions(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __navs: string[] };
    w.__navs = [];
    new MutationObserver(() => {
      const v = document.documentElement.dataset['nav'];
      if (v) w.__navs.push(v);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav'] });
  });
  return () => page.evaluate(() => (window as unknown as { __navs: string[] }).__navs);
}

test.describe('stack navigation', () => {
  test('a screen opened from a tab is pushed, back pops it, tabs cross-fade', async ({ page }) => {
    await signIn(page, 'user');
    const transitions = await recordTransitions(page);

    await tab(page, 'Profil').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profil');
    await page.getByRole('link', { name: /Connexion et sécurité/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion et sécurité');
    // the tab bar stays during a push
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page).toHaveURL(/\/app\/account$/);

    const kinds = await transitions();
    // view transitions exist in Chromium: fade (tab), push (security), pop (back)
    expect(kinds).toEqual(['fade', 'push', 'pop']);
  });

  test('back from a screen opened directly goes to its parent screen', async ({ page }) => {
    await signIn(page, 'user');
    await page.goto('/app/account/security');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion et sécurité');
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page).toHaveURL(/\/app\/account$/);
  });

  test('a swipe from the left edge goes back', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the touch events are sent through CDP, Chromium only');
    await signIn(page, 'user');
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /Connexion et sécurité/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion et sécurité');
    // during a screen transition the browser keeps the touches for itself: wait for the push to end
    await expect(page.locator('html')).not.toHaveAttribute('data-nav', /.+/);

    const cdp = await page.context().newCDPSession(page);
    const point = (x: number) => [{ x, y: 400 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(6) });
    for (const x of [30, 80, 140, 200, 260]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x) });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page).toHaveURL(/\/app\/account$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profil');
  });

  test('a short swipe springs back and stays', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the touch events are sent through CDP, Chromium only');
    await signIn(page, 'user');
    await page.goto('/app/account/security');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion et sécurité');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 6, y: 400 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 30, y: 400 }] });
    await page.waitForTimeout(400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/app\/account\/security$/);
  });
});
