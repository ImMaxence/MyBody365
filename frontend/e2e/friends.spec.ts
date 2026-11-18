import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, press, signIn, watchErrors } from './helpers';
import { makePng } from './png';

async function csrf(page: Page): Promise<string> {
  return (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
}

async function inviteUrl(page: Page): Promise<string> {
  const res = await page.request.post('/api/me/friends/invite', { headers: { 'X-XSRF-TOKEN': await csrf(page) } });
  expect(res.status()).toBe(200);
  return (await res.json()).url;
}

test.describe('friends', () => {
  test('invite with a QR code, add by pasting the link, nudge', async ({ page, browser }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await page.goto('/app/friends');
    await expect(page.getByText(/Pas encore d’amis ici/)).toBeVisible();
    await page.getByRole('button', { name: 'Inviter un ami' }).click();
    await expect(page.getByRole('dialog').getByRole('img', { name: 'Inviter un ami' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
    const url = await inviteUrl(page);
    expect(url).toMatch(/\/friends\/add#[A-Za-z0-9_-]{20,}$/);

    const other = await browser.newContext({ ...test.info().project.use });
    const friend = await other.newPage();
    await signIn(friend, 'new');
    await friend.goto('/app/friends');
    await friend.getByRole('button', { name: 'J’ai un lien' }).click();
    await friend.getByLabel('Lien d’ami').fill(url);
    await friend.getByRole('dialog').getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(friend.getByText(/Vous êtes amis avec/)).toBeVisible();
    await friend.getByRole('button', { name: /Envoyer un coup de pouce/ }).click();
    await expect(friend.getByText(/coup de pouce est noté|Coup de pouce envoyé/)).toBeVisible();
    await expect(friend.getByRole('button', { name: /Envoyer un coup de pouce/ })).toBeDisabled();
    await expectAccessible(friend);
    await other.close();

    await page.reload();
    await expect(page.locator('.friend')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a request sent to a username, accepted from the list', async ({ page, browser }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    const me = await (await page.request.get('/api/me')).json();
    expect(me.username).toMatch(/^[a-z0-9._]{3,20}$/);

    const other = await browser.newContext({ ...test.info().project.use });
    const friend = await other.newPage();
    await signIn(friend, 'new');
    await friend.goto('/app/friends');
    await friend.getByRole('combobox', { name: 'Nom d’utilisateur de ton ami' }).fill('nobody_' + Date.now() % 100000);
    await friend.getByRole('button', { name: 'Chercher' }).click();
    await expect(friend.getByText(/Personne n’a ce nom d’utilisateur/)).toBeVisible();
    await friend.getByRole('combobox', { name: 'Nom d’utilisateur de ton ami' }).fill('@' + me.username);
    await friend.getByRole('button', { name: 'Chercher' }).click();
    await friend.getByRole('button', { name: 'Demander en ami' }).click();
    await expect(friend.getByText(/Demande envoyée à/)).toBeVisible();
    await expect(friend.getByRole('heading', { name: 'Demandes envoyées' })).toBeVisible();
    await expectAccessible(friend);

    await page.goto('/app/friends');
    await expect(page.getByRole('heading', { name: 'Demandes reçues' })).toBeVisible();
    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByText(/Vous êtes amis avec/)).toBeVisible();
    await expect(page.locator('.friend')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Demandes reçues' })).toBeHidden();
    await other.close();
    expect(errors).toEqual([]);
  });

  test('the public link page adds the friend straight away when signed in', async ({ page, browser }) => {
    await signIn(page, 'new');
    const url = await inviteUrl(page);
    const other = await browser.newContext({ ...test.info().project.use });
    const friend = await other.newPage();
    await signIn(friend, 'new');
    await friend.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await expect(friend.getByRole('heading', { name: /Vous êtes amis avec/ })).toBeVisible();
    // the token left the address bar
    expect(friend.url()).not.toContain('#');
    await other.close();
  });

  test('a photo shared with one friend, reported, then removed by an admin', async ({ page, browser }) => {
    await signIn(page, 'new');
    const res = await page.request.post('/api/me/photos', {
      headers: { 'X-XSRF-TOKEN': await csrf(page) },
      multipart: { file: { name: 'p.png', mimeType: 'image/png', buffer: makePng(300, 400) }, pose: 'FRONT' },
    });
    const photo = await res.json();
    const url = await inviteUrl(page);

    const other = await browser.newContext({ ...test.info().project.use });
    const friend = await other.newPage();
    await signIn(friend, 'new');
    await friend.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await expect(friend.getByRole('heading', { name: /Vous êtes amis avec/ })).toBeVisible();

    // share it from the viewer
    await page.goto(`/app/photos/${photo.id}`);
    await page.getByRole('button', { name: /Partager/ }).click();
    await page.getByRole('dialog').getByRole('checkbox').check();
    await expect(page.getByText('Partage mis à jour')).toBeVisible();

    // the friend sees it, and reports it
    await friend.goto('/app/friends');
    await friend.getByRole('button', { name: /Partagée par/ }).click();
    await friend.getByRole('button', { name: 'Signaler' }).click();
    await friend.getByRole('radio', { name: 'Contenu choquant' }).click();
    await friend.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(friend.getByText(/un administrateur va vérifier/)).toBeVisible();
    await other.close();

    // an admin handles it
    const adminCtx = await browser.newContext({ ...test.info().project.use });
    const admin = await adminCtx.newPage();
    await signIn(admin, 'admin');
    await admin.goto('/app/admin/moderation');
    // this photo's report (others may wait from earlier runs)
    const report = admin.locator('article.report').filter({ has: admin.locator(`img.thumb[src*="${photo.id}"]`) });
    await expect(report).toBeVisible();
    await expect(report.locator('img.thumb')).toHaveJSProperty('complete', true);
    await report.getByRole('button', { name: 'Supprimer la photo' }).click();
    await expect(admin.getByText('Signalement traité')).toBeVisible();
    await adminCtx.close();
    expect((await page.request.get(photo.url)).status()).toBe(404);
  });

  test('a challenge between two friends, taken up from Today (1.9)', async ({ page, browser }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    const url = await inviteUrl(page);
    const other = await browser.newContext({ ...test.info().project.use });
    const friend = await other.newPage();
    await signIn(friend, 'new');
    const res = await friend.request.post('/api/me/friends/accept', {
      headers: { 'X-XSRF-TOKEN': await csrf(friend) },
      data: { token: url.slice(url.indexOf('#') + 1) },
    });
    expect(res.status()).toBe(200);

    // what, how long, with whom
    await page.goto('/app/friends');
    // opened from Today: its tab stays lit
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Aujourd’hui' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: /^Défis entre amis/ }).click();
    await expect(page.getByRole('heading', { name: 'Défis', level: 1 })).toBeVisible();
    await press(page.getByRole('button', { name: 'Lancer un défi' }));
    const sheet = page.getByRole('dialog', { name: 'Nouveau défi' });
    await sheet.getByRole('radio', { name: /Une pesée par jour/ }).click();
    await sheet.getByRole('radio', { name: '14 jours' }).click();
    await sheet.locator('.friend').first().click();
    await expectAccessible(page);
    await sheet.getByRole('button', { name: 'Lancer le défi' }).click();
    await expect(page.getByText('Défi lancé, tes amis sont invités')).toBeVisible();
    // the morning weigh-in of the onboarding already counts: day 1 done
    const card = page.locator('section.ch').first();
    await expect(card).toContainText('Jour 1 sur 14');
    await expect(card.locator('.member.me .score')).toContainText('1/14');

    // the friend: an invitation on Today, taken up
    await friend.goto('/app');
    await friend.getByRole('link', { name: /te lance un défi/ }).click();
    await friend.getByRole('button', { name: 'Relever le défi' }).click();
    await expect(friend.getByText('C’est parti, bon courage')).toBeVisible();
    await expect(friend.locator('section.ch .member')).toHaveCount(2);
    await expectAccessible(friend);
    await other.close();
    expect(errors).toEqual([]);
  });

  test('my progress shown to a friend, who cheers it (1.9)', async ({ page, browser }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    const url = await inviteUrl(page);
    const other = await browser.newContext({ ...test.info().project.use });
    const friend = await other.newPage();
    await signIn(friend, 'new');
    const res = await friend.request.post('/api/me/friends/accept', {
      headers: { 'X-XSRF-TOKEN': await csrf(friend) },
      data: { token: url.slice(url.indexOf('#') + 1) },
    });
    expect(res.status()).toBe(200);

    // the preview first (no weight unless asked), then to the friends
    await page.goto('/app/progress');
    await page.getByRole('button', { name: 'Partager', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Partager mon avancée' });
    await expect(sheet.getByText('Voici ce que tes amis verront')).toBeVisible();
    await expect(sheet.locator('app-post-card')).toBeVisible();
    await expect(sheet.getByText(/ kg$/).first()).toBeVisible();
    await expectAccessible(page);
    await sheet.getByRole('button', { name: 'Partager avec mes amis' }).click();
    await expect(page.getByText('Partagé avec tes amis')).toBeVisible();

    // the friend: a new one on Today, then in the news, « Bravo »
    await friend.goto('/app');
    await expect(friend.getByText('1 nouveauté de tes amis')).toBeVisible();
    await friend.goto('/app/friends');
    await expect(friend.getByRole('heading', { name: 'Nouvelles de tes amis' })).toBeVisible();
    const bravo = friend.locator('app-post-card').getByRole('button', { name: /Bravo/ });
    await press(bravo);
    await expect(bravo).toHaveAttribute('aria-pressed', 'true');
    await expect(bravo).toContainText('1');
    await expectAccessible(friend);
    await other.close();
    expect(errors).toEqual([]);
  });
});
