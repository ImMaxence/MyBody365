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

  test('another screen from further down a screen: the screen left does not move, the tab bar neither (1.12.1)', async ({ page }) => {
    await signIn(page, 'user');
    await page.goto('/app/account');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profil');
    await page.evaluate(() => window.scrollTo(0, 300));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    // at the tap, where the screen's title and the tab bar are seen; then where the still copy of the screen is laid,
    // and where the tab bar is in the middle of the push
    await page.evaluate(() => {
      const w = window as unknown as { __before: number; __bar: number; __ghost: number | null; __barDuring: number[] };
      const main = document.getElementById('main')!;
      const bar = () => document.querySelector('.tabbar')!.getBoundingClientRect().top;
      w.__ghost = null;
      w.__barDuring = [];
      document.addEventListener(
        'click',
        () => {
          w.__before = main.querySelector('h1')!.getBoundingClientRect().top;
          w.__bar = bar();
          // the tab bar, every 30 ms while the copy is there (a slower engine lays it later: sampled for 6 s)
          const t = setInterval(() => document.querySelector('.nav-ghost') && w.__barDuring.push(bar()), 30);
          setTimeout(() => clearInterval(t), 6000);
        },
        { capture: true, once: true },
      );
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes)
            if (n instanceof HTMLElement && n.classList.contains('nav-ghost') && w.__ghost === null) w.__ghost = n.querySelector('h1')!.getBoundingClientRect().top;
      }).observe(main.parentElement!, { childList: true });
    });
    await page.getByRole('link', { name: /Connexion et sécurité/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connexion et sécurité');
    const seen = await page.evaluate(() => {
      const w = window as unknown as { __before: number; __bar: number; __ghost: number | null; __barDuring: number[] };
      return { before: w.__before, bar: w.__bar, ghost: w.__ghost, barDuring: w.__barDuring };
    });
    // the copy laid exactly where the screen was seen
    expect(seen.ghost).not.toBeNull();
    expect(Math.abs((seen.ghost ?? 0) - seen.before)).toBeLessThan(1);
    // the tab bar never moved during the push
    expect(seen.barDuring.length).toBeGreaterThan(0);
    for (const top of seen.barDuring) expect(Math.abs(top - seen.bar)).toBeLessThan(1);
    // then the copy goes, the new screen at its top
    await expect(page.locator('.nav-ghost')).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('the changelog opens from the profile as a screen of the app (1.12.1)', async ({ page }) => {
    await signIn(page, 'user');
    const transitions = await recordTransitions(page);
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /Nouveautés/ }).click();
    await expect(page).toHaveURL(/\/app\/account\/changelog$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouveautés');
    // pushed like any screen of the profile, the tab bar kept
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await expect(page.locator('.release').first()).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page).toHaveURL(/\/app\/account$/);
    expect(await transitions()).toEqual(['fade', 'push', 'pop']);
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

  test('the tab bar slides away while scrolling down and comes back on the way up (1.13)', async ({ page, browserName }) => {
    // headless WebKit never runs animation frames: the scroll is read in one
    test.skip(browserName === 'webkit', 'no animation frames in headless WebKit');
    await signIn(page, 'user');
    await page.goto('/app/meals');
    const bar = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(bar).not.toHaveClass(/away/);
    // a new screen ignores the scroll for 0.7 s (the one it is put back to): the member's scrolling comes after
    await page.waitForTimeout(900);
    await page.mouse.move(200, 400);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(80);
    }
    await expect(bar).toHaveClass(/away/);
    await page.mouse.wheel(0, -120);
    await expect(bar).not.toHaveClass(/away/);
    // a new screen: always there
    await page.mouse.wheel(0, 600);
    await expect(bar).toHaveClass(/away/);
    await page.goto('/app/progress');
    await expect(bar).not.toHaveClass(/away/);
  });

  test('back on a tab soon after, what was seen shows at once without asking again (1.16)', async ({ page }) => {
    await signIn(page, 'new');
    await expect(page.locator('section.streak')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const asked: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/(me\/(summary|friends|challenges|meals\?|photos)|friends\/posts)/.test(r.url())) asked.push(r.url());
    });
    await tab(page, 'Repas').click();
    await expect(page.getByRole('heading', { name: 'Repas', level: 1 })).toBeVisible();
    await tab(page, 'Aujourd’hui').click();
    await expect(page.locator('section.streak')).toBeVisible();
    await page.waitForTimeout(600);
    expect(asked).toEqual([]);
  });
});
