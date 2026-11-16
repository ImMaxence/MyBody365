import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, watchErrors } from './helpers';

test.describe('public site', () => {
  test('the French landing explains the app and how to install it', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/MyBody365/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Un an pour');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    // the install guide has one tab per platform, with steps
    const install = page.locator('#install');
    await install.scrollIntoViewIfNeeded();
    for (const tab of ['Android', 'iPhone / iPad', 'Ordinateur']) {
      await install.getByRole('tab', { name: tab }).click();
      await expect(install.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      await expect(install.locator('ol li').first()).toBeVisible();
    }
    await install.getByRole('tab', { name: 'iPhone / iPad' }).click();
    await expect(install).toContainText('Sur l’écran d’accueil');

    // the journey goes from day 0 to day 365
    for (const day of ['1', '7', '30', '90', '365']) {
      await expect(page.locator('.stop .m-num', { hasText: new RegExp(`^${day}$`) })).toHaveCount(1);
    }

    // FAQ answers open
    await page.getByText('Qui peut voir mes photos ?').click();
    await expect(page.getByText('Même les administrateurs ne les voient pas')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('nothing is wider than the screen, all the way down', async ({ page }) => {
    await page.goto('/');
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const step = page.viewportSize()?.height ?? 800;
    // sections render as they come into view (content-visibility): check each screenful
    for (let y = 0; y < height; y += step) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(60);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('365 days, an example streak, a before / after to slide and a year to play', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.day-num')).toHaveText('365');
    const calendar = page.getByRole('img', { name: /Exemple de série/ });
    await expect(calendar).toBeVisible();
    await expect(calendar.locator('.cell.done')).toHaveCount(15);
    await expect(calendar.locator('.cell.freeze')).toHaveCount(2);
    await expect(calendar.locator('.cell.today')).toHaveCount(1);
    // nothing sticks out: the cells stay inside the card, the whole 365 inside its column
    const fits = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const grid = document.querySelector('.cal-grid')!;
      return {
        grid: grid.scrollWidth <= grid.clientWidth && box('.cal-grid').right <= box('.calendar').right,
        num: box('.day-num').right <= box('.counter').right + 0.5,
      };
    });
    expect(fits).toEqual({ grid: true, num: true });
    await expect(page.getByRole('link', { name: 'Installer l’application' }).first()).toBeVisible();

    // before / after: the slider moves the split
    const slider = page.getByRole('slider', { name: 'Fais glisser pour comparer' });
    await slider.scrollIntoViewIfNeeded();
    await slider.fill('20');
    await expect(page.locator('.frames')).toHaveAttribute('style', /--split: 20%/);

    // the year in twelve seconds plays month after month
    const play = page.getByRole('button', { name: /Lecture/ });
    await play.scrollIntoViewIfNeeded();
    await expect(page.locator('.screen .month')).toHaveText(/janvier/i);
    await play.click();
    await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
    await expect(page.locator('.screen .month')).toHaveText(/février/i, { timeout: 3000 });
    await page.getByRole('button', { name: /Pause/ }).click();
    await expect(page.getByRole('button', { name: /Lecture/ })).toBeVisible();
  });

  test('the menu anchors stop just under the header, without a page transition', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the section menu shows on wide screens');
    await page.goto('/');
    // a same-page anchor must not play a page transition (the header used to slide sideways)
    await page.evaluate(() => {
      const w = window as unknown as { navSeen: boolean };
      w.navSeen = false;
      new MutationObserver(() => {
        if (document.documentElement.dataset['nav']) w.navSeen = true;
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-nav'] });
    });
    const menu = page.getByRole('navigation', { name: 'Sections' });
    for (const [name, id] of [
      ['Vie privée', 'privacy'],
      ['FAQ', 'faq'],
      ['Le parcours', 'parcours'],
    ]) {
      await menu.getByRole('link', { name }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      // the smooth scroll ends 16 px under the sticky header
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              Math.round(
                document.getElementById(id)!.getBoundingClientRect().top - document.querySelector('header.bar')!.getBoundingClientRect().bottom,
              ),
            id,
          ),
        )
        .toBe(16);
    }
    expect(await page.evaluate(() => (window as unknown as { navSeen: boolean }).navSeen)).toBe(false);
  });

  test('the landing is prerendered, icons included, and every inline script is allowed by the CSP', async ({ request }) => {
    const res = await request.get('/');
    const html = await res.text();
    expect(html).toContain('Un an pour');
    expect(html).toContain('id="install"');
    expect(html).toMatch(/<svg[^>]*viewBox="0 0 24 24"[^>]*><path d="/);
    // an inline script only runs if its SHA-256 is listed in script-src
    const csp = res.headers()['content-security-policy'];
    for (const m of html.matchAll(/<script(?![^>]*\s(?:src|type)=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m[1]));
      const hash = `'sha256-${Buffer.from(digest).toString('base64')}'`;
      expect(csp, `inline script not allowed by the CSP: ${m[1].slice(0, 80)}`).toContain(hash);
    }
  });

  test('English version and language switch', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Switch to English' }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('One year to');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('legal pages', async ({ page }) => {
    await page.goto('/legal/mentions');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mentions légales');
    await expect(page.getByText('Maxence Bonnici').first()).toBeVisible();
    await page.getByRole('link', { name: 'Confidentialité' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Politique de confidentialité');
    await expect(page.getByText(/article 9 du RGPD/)).toBeVisible();
    await page.goto('/en/legal/cgu');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of use');
  });

  test('accessibility of the public pages', async ({ page }) => {
    for (const path of ['/', '/en', '/legal/confidentialite']) {
      await page.goto(path);
      await expectAccessible(page);
    }
  });

  test('security headers', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("script-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.start_url).toBe('/app');
    expect(manifest.display).toBe('standalone');
  });
});
