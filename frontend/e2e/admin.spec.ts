import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, signIn, tab } from './helpers';

test.describe('admin area', () => {
  test('approve an access request, open the invitation link, revoke a link, read the journal', async ({ page, browser }) => {
    // someone asks for access (public form, as a visitor would)
    const email = `invite-${Date.now()}@example.com`;
    const xsrf = await page.request.get('/api/auth/me');
    const token = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    expect(xsrf.ok()).toBe(true);
    const sent = await page.request.post('/api/access-requests', {
      data: { email, name: 'Inès', message: 'Je veux participer', kind: 'NEW_ACCESS' },
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(sent.status()).toBe(202);

    await signIn(page, 'admin');
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /Administration/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Administration');
    await expect(page.getByRole('button', { name: /admin@localhost/ })).toBeVisible();
    await expectAccessible(page);

    // approve: the invitation link is shown once
    await page.getByRole('link', { name: /Demandes/ }).click();
    const card = page.locator('article', { hasText: email });
    await expect(card).toContainText('Je veux participer');
    await card.getByRole('button', { name: 'Valider' }).click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'Lien prêt' })).toBeVisible();
    const url = (await sheet.locator('code').textContent())?.trim() ?? '';
    expect(url).toMatch(/\/link#[A-Za-z0-9_-]{40,}$/);
    await sheet.getByRole('button', { name: 'Fermer' }).click();

    // the invitee opens the link in their own browser
    const invitee = await browser.newContext({ locale: 'fr-FR' });
    const p2 = await invitee.newPage();
    await p2.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await expect(p2.getByRole('heading', { name: 'Bienvenue dans MyBody365' })).toBeVisible();
    await expect(p2.getByRole('button', { name: /Créer une passkey/ })).toBeVisible();
    // the token left the address bar
    expect(p2.url()).not.toContain('#');
    const me = await (await p2.request.get('/api/auth/me')).json();
    expect(me.account.email).toBe(email);
    // and the link cannot be used twice (a new tab: same URL but for the fragment would not reload)
    const p3 = await invitee.newPage();
    await p3.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await expect(p3.getByRole('heading', { name: 'Lien inutilisable' })).toBeVisible();
    await expect(p3.getByText('Ce lien a déjà été utilisé', { exact: true })).toBeVisible();
    await invitee.close();

    // a recovery link for the new account, then revoked
    await page.getByRole('link', { name: /Comptes/ }).click();
    await page.getByRole('button', { name: new RegExp(email) }).click();
    await page.locator('dialog[open]').getByRole('button', { name: /lien de récupération/ }).click();
    await expect(page.locator('dialog[open]').getByRole('heading', { name: 'Lien prêt' })).toBeVisible();
    await page.locator('dialog[open]').getByRole('button', { name: 'Fermer' }).click();
    await page.getByRole('link', { name: /Liens/ }).click();
    await expect(page.getByRole('button', { name: 'Révoquer' }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Révoquer' }).first().click();
    await expect(page.getByText('Lien révoqué')).toBeVisible();

    // everything is in the journal
    await page.getByRole('link', { name: /Journal/ }).click();
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('.timeline li').first()).toContainText('a révoqué un lien de');
    await expect(page.locator('.timeline')).toContainText('a validé la demande de');
  });

  test('a regular account cannot reach the admin area', async ({ page }) => {
    await signIn(page, 'user');
    await page.goto('/app/admin');
    await expect(page).toHaveURL(/\/app$/);
    const res = await page.request.get('/api/admin/users');
    expect(res.status()).toBe(403);
  });
});
