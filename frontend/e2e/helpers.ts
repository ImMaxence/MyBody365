import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Opens the app in a browser tab (the install gate is lifted on localhost with ?browser=1). */
export async function openApp(page: Page, path = '/app/login'): Promise<void> {
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}browser=1`);
}

/**
 * Local sign-in (DEV_LOGIN): `admin` is the first ADMIN_EMAILS address, `user` a demo account,
 * `new` a brand-new account. A first visit goes through the onboarding with default answers.
 */
export async function signIn(page: Page, as: 'admin' | 'user' | 'new'): Promise<void> {
  await openApp(page);
  await page.goto(`/api/auth/dev-login?as=${as}`);
  // the server redirects to /app, then the app itself sends a first visit to /app/welcome
  const welcome = page.getByText(/^Étape \d sur \d$|^Salut .+ 👋$/).first();
  const tabs = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(welcome.or(tabs)).toBeVisible();
  if (await tabs.isVisible()) return;
  await completeOnboarding(page);
}

/** The onboarding with default answers: consents, a woman born in 1995, 170 cm, 75 kg → 70 kg. */
export async function completeOnboarding(page: Page): Promise<void> {
  const consent = page.getByRole('checkbox', { name: /18 ans/ });
  // the welcome screen starts with the consents, or with the profile when they were already given
  await expect(consent.or(page.getByRole('heading', { name: 'Parle-nous de toi' }))).toBeVisible();
  if (await consent.isVisible()) {
    await consent.check();
    await page.getByRole('checkbox', { name: /données de santé/ }).check();
    await page.getByRole('button', { name: 'Continuer' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Parle-nous de toi' })).toBeVisible();
  await page.getByRole('radio', { name: 'Femme' }).click();
  await page.getByLabel('Date de naissance').fill('1995-06-15');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Ton point de départ' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Ton objectif' })).toBeVisible();
  await page.getByRole('button', { name: 'Voir mon plan' }).click();
  await expect(page.getByRole('heading', { name: 'Ton plan est prêt' })).toBeVisible();
  await page.getByRole('button', { name: /C’est parti/ }).click();
  await page.waitForURL(/\/app$/);
}

/** A link of the bottom tab bar. */
export function tab(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name });
}

/** No serious or critical accessibility violation (axe-core, WCAG 2.2 AA rules). */
export async function expectAccessible(page: Page): Promise<void> {
  // entrance animations first (a half-faded text would fail the contrast checks); scroll-driven, looping
  // or paused ones never end, and nothing waits more than 3 s
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              a.timeline instanceof DocumentTimeline &&
              a.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
}

/** Mobile only: nothing may be wider than the screen (no horizontal scrolling). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Collects console errors and page errors during a test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // a 401 on the session probe is normal for visitors
    if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}
