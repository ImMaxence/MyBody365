import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, signIn, tab } from './helpers';

test.describe('admin area', () => {
  test('approve an access request, open the invitation link, revoke a link, read the journal', async ({ page, browser }) => {
    // two browsers and every admin tab: longer than the others, all the more on a local database full of test accounts
    test.setTimeout(90_000);
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
    await expect(page.getByRole('link', { name: 'Écrire un e-mail' })).toHaveAttribute('href', /^mailto:/);
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

  test('a member writes to the creator, an error is logged: the admin reads both and archives them', async ({ page, browser }) => {
    const text = `Le graphique clignote ${Date.now()}`;
    // a member, from the profile
    const member = await browser.newContext({ locale: 'fr-FR', viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
    const mp = await member.newPage();
    await signIn(mp, 'user');
    await tab(mp, 'Profil').click();
    await mp.getByRole('button', { name: /Une idée, un bug/ }).click();
    const sheet = mp.getByRole('dialog', { name: 'Écrire au créateur' });
    await expect(sheet).toBeVisible();
    // opening the sheet does not put the focus (and the phone keyboard) in the text field
    expect(await mp.evaluate(() => document.activeElement?.tagName)).not.toBe('TEXTAREA');
    await sheet.getByRole('radio', { name: 'Bug' }).click();
    await sheet.getByLabel('Ton message').fill(text);
    await expectAccessible(mp);
    await sheet.getByRole('button', { name: 'Envoyer' }).click();
    await expect(mp.getByText('Merci, c’est bien arrivé')).toBeVisible();
    // an error seen on a phone
    const token = (await member.cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    const logged = await mp.request.post('/api/errors', {
      data: { message: `TypeError: e2e ${Date.now()}`, detail: 'at test (e2e.js:1)', path: '/app/progress', version: '1.2.0' },
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(logged.status()).toBe(204);
    await member.close();

    await signIn(page, 'admin');
    await page.goto('/app/admin/feedback');
    const card = page.locator('article', { hasText: text });
    await expect(card).toContainText('Bug');
    await expectAccessible(page);
    await card.getByRole('button', { name: 'Archiver' }).click();
    await expect(card).toHaveCount(0);

    await page.getByRole('link', { name: /Erreurs/ }).click();
    const row = page.getByRole('button', { name: /TypeError: e2e/ }).first();
    await row.click();
    const detail = page.getByRole('dialog', { name: 'Erreur' });
    await expect(detail).toContainText('at test (e2e.js:1)');
    await expect(detail).toContainText('/app/progress');
    await expectAccessible(page);
    await detail.getByRole('button', { name: 'Archiver' }).click();
    await expectNoHorizontalOverflow(page);
  });

  test('the food data: Ciqual, Open Food Facts and the first community recipes', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto('/app/admin/foods');
    await expect(page.getByRole('heading', { name: 'Open Food Facts' })).toBeVisible();
    await expect(page.locator('img[src="/brands/open-food-facts.svg"]')).toHaveJSProperty('complete', true);
    await expect(page.getByText(/^Dernière mise à jour le /).or(page.getByText('Aucune table importée'))).toBeVisible();
    // the first recipes: how many are in (the local stack has the real Ciqual table: all of them)
    await expect(page.getByRole('heading', { name: 'Recettes de départ de la communauté' })).toBeVisible();
    await expect(page.getByText(/^\d+ recettes publiées sur 729$/)).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);
  });

  test('the statistics: what the project takes on the server (1.13)', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto('/app/admin/stats');
    await expect(page.getByRole('heading', { name: 'Stockage' })).toBeVisible();
    await expect(page.getByText('Base de données', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mémoire (RAM)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Processeur' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Les données' })).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);
  });

  test('a regular account cannot reach the admin area', async ({ page }) => {
    await signIn(page, 'user');
    await page.goto('/app/admin');
    await expect(page).toHaveURL(/\/app$/);
    const res = await page.request.get('/api/admin/users');
    expect(res.status()).toBe(403);
  });

  test('the community recipes: search, without a photo, opened in the editor (1.14)', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto('/app/admin/recipes');
    await expect(page.getByRole('group', { name: 'Filtrer les recettes' }).getByRole('button', { name: /^Toutes/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('ratatouille');
    const first = page.locator('.row .open').first();
    await expect(first).toContainText(/Ratatouille/i);
    await page.getByRole('group', { name: 'Filtrer les recettes' }).getByRole('button', { name: /^Sans photo/ }).click();
    await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('');
    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);
    // a community recipe opens in the recipe editor, which says it stays in the community
    await page.getByRole('group', { name: 'Filtrer les recettes' }).getByRole('button', { name: /^Toutes/ }).click();
    await page.locator('.row .open').first().click();
    await expect(page).toHaveURL(/\/app\/meals\/recipes\/[0-9a-f-]+\/edit$/);
    await expect(page.getByText(/Recette de la communauté : tes changements sont vus par tous/)).toBeVisible();
  });
});
