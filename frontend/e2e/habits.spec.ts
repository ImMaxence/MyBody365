import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { expectAccessible, press, signIn, tab } from './helpers';

/** the previous month, YYYY-MM */
function lastMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

test.describe('1.19', () => {
  test('a meal said in words, then kept as a usual meal and added again in one tap', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, 'new');
    await page.goto('/app/meals/add?slot=LUNCH');
    await page.getByRole('button', { name: /Décris ton repas/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Décris ton repas' });
    await sheet.getByLabel('Ce que tu as mangé').fill('200 g de poulet, du riz et une pomme');
    await sheet.getByRole('button', { name: 'Trouver les aliments' }).click();
    // cooked: the grilled chicken, the cooked rice (with the portion of a plate, said as estimated), one apple
    await expect(sheet.locator('.name').filter({ hasText: /Poulet, filet sans peau grillé/ })).toBeVisible();
    await expect(sheet.locator('.name').filter({ hasText: /Riz blanc, cuit/ })).toBeVisible();
    await expect(sheet.getByText('portion estimée', { exact: false })).toBeVisible();
    await expect(sheet.locator('.name').filter({ hasText: /^Pomme/ })).toBeVisible();
    await expectAccessible(page);
    await sheet.getByRole('button', { name: /Ajouter 3 aliments/ }).click();
    await expect(page).toHaveURL(/\/app\/meals$/);
    await expect(page.getByRole('button', { name: /Riz blanc, cuit/ })).toBeVisible();

    // kept under a name, from the lunch of the day
    await page.getByRole('button', { name: 'Garder ce repas' }).first().click();
    const keep = page.getByRole('dialog', { name: 'Garder ce repas' });
    await keep.getByLabel('Son nom').fill('Mon déjeuner poulet riz');
    await keep.getByRole('button', { name: 'Garder', exact: true }).click();
    await expect(page.getByText('« Mon déjeuner poulet riz » gardé dans tes repas habituels')).toBeVisible();

    // then in « Ajouter », a whole meal in one tap
    await page.goto('/app/meals/add?slot=DINNER');
    await expect(page.getByRole('heading', { name: 'Mes repas habituels' })).toBeVisible();
    await page.getByRole('button', { name: /^Mon déjeuner poulet riz/ }).click();
    await expect(page).toHaveURL(/\/app\/meals$/);
    await expect(page.getByRole('button', { name: /Riz blanc, cuit/ })).toHaveCount(2);
  });

  test('the recap of a month, the doctor’s readings, cooking step by step and the usual reminder times', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, 'new');
    // the recap of last month, told like a story; Progress leads to it
    await tab(page, 'Progrès').click();
    await expect(page.getByRole('link', { name: /Ton bilan de/ })).toBeVisible();
    await page.goto(`/app/progress/recap/${lastMonth()}`);
    await expect(page.getByText('Ton mois de')).toBeVisible();
    await page.getByRole('button', { name: 'Diapositive suivante' }).click();
    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page).toHaveURL(/\/app\/progress$/);

    // the readings for the doctor: the 6 sessions of 3 days
    const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    expect((await page.request.patch('/api/me', { headers: { 'X-XSRF-TOKEN': xsrf }, data: { bpEnabled: true } })).ok()).toBe(true);
    await page.goto('/app/progress/bp-report');
    await expect(page.getByRole('heading', { name: 'Relevé pour ton médecin' })).toBeVisible();
    await expect(page.getByText('Pas encore mesuré')).toHaveCount(6);
    await expectAccessible(page);

    // a recipe with its steps, cooked step by step with a timer
    const made = await page.request.post('/api/me/recipes', {
      headers: { 'X-XSRF-TOKEN': xsrf },
      data: {
        name: 'Riz au four',
        type: 'DINNER',
        servings: 2,
        ingredients: [],
        manual: { kcal: 400 },
        visibility: 'PRIVATE',
        notes: 'Rincer le riz\nCuire 15 minutes au four',
      },
    });
    expect(made.status()).toBe(201);
    const recipe = (await made.json()) as { id: string };
    await page.goto(`/app/meals/recipes/${recipe.id}`);
    // 1.20.5: how many portions first
    await page.getByRole('button', { name: 'Cuisiner pas à pas' }).click();
    const portions = page.getByRole('dialog', { name: 'Cuisiner pas à pas' });
    await expect(portions.getByText('Combien de portions veux-tu cuisiner')).toBeVisible();
    await portions.getByRole('button', { name: '+' }).click();
    await portions.getByRole('button', { name: 'Cuisiner', exact: true }).click();
    await expect(page.getByText(/Étape 1 sur 2 · 3 portion\(s\)/)).toBeVisible();
    await expect(page.locator('.step .text')).toHaveText('Rincer le riz');
    await page.getByRole('button', { name: /Suivant/ }).click();
    await page.getByRole('button', { name: '15 minutes' }).click();
    await expect(page.getByRole('timer')).toContainText('14:5');
    await page.getByRole('button', { name: 'Arrêter' }).click();
    await page.getByRole('button', { name: /Terminé/ }).click();

    // the reminders at the usual time: not enough days yet
    await page.goto('/app/account/notifications');
    const smart = page.getByRole('switch', { name: /À mon heure habituelle/ });
    await press(smart);
    await expect(page.getByText(/Pas encore assez de jours/)).toBeVisible();
  });

  test('a read-only link for a coach, opened without an account, then taken back', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await signIn(page, 'new');
    await tab(page, 'Profil').click();
    await page.getByRole('link', { name: /Partager avec un pro de santé/ }).click();
    await page.getByLabel('Pour qui').fill('Ma diététicienne');
    await page.getByRole('button', { name: 'Créer le lien' }).click();
    await expect(page.getByText('Ton lien est prêt')).toBeVisible();
    const url = (await page.locator('.url').textContent())!.trim();
    expect(url).toContain('/partage#');
    await expectAccessible(page);

    const coach = await openAlone(browser, page, url);
    await expect(coach.getByRole('heading', { name: /Le journal de/ })).toBeVisible();
    await expect(coach.getByRole('heading', { name: 'Poids' })).toBeVisible();
    await expect(coach.getByRole('heading', { name: 'Repas des 14 derniers jours' })).toBeVisible();
    await coach.close();

    await page.reload();
    await expect(page.getByText(/ouvert 1 fois/)).toBeVisible();
    await page.getByRole('button', { name: 'Retirer' }).click();
    await expect(page.getByText('Lien retiré : il ne s’ouvre plus')).toBeVisible();
    const again = await openAlone(browser, page, url);
    await expect(again.getByRole('heading', { name: 'Ce lien n’est plus valable' })).toBeVisible();
    await again.close();
  });

  test('a line of the day swiped to the left: duplicated, then removed, and a tap still opens its sheet', async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page, 'new');
    const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const made = await page.request.post('/api/me/meals', {
      headers: { 'X-XSRF-TOKEN': xsrf },
      data: { day, slot: 'BREAKFAST', quick: { name: 'Café allongé', kcal: 4 } },
    });
    expect(made.ok()).toBe(true);
    await page.goto('/app/meals');
    const rows = page.locator('li.swipe', { hasText: 'Café allongé' });
    await expect(rows).toHaveCount(1);

    // the row follows the finger to the left and uncovers « Dupliquer » and « Retirer »; the drag opens no sheet
    await swipeLeft(page, rows.first().locator('.entry'));
    await rows.first().locator('.act.dup').click();
    await expect(page.getByText('« Café allongé » ajouté de nouveau')).toBeVisible();
    await expect(rows).toHaveCount(2);

    await swipeLeft(page, rows.first().locator('.entry'));
    await rows.first().locator('.act.del').click();
    await expect(page.getByText('Retiré de tes repas')).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expectAccessible(page);
    // 1.20: a slip of the finger is undone from the toast
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByText('Remis dans tes repas')).toBeVisible();
    await expect(rows).toHaveCount(2);

    // a tap opens the line's sheet, where both are too (for the keyboard and the screen readers)
    await rows.first().locator('.entry').click();
    await page.getByRole('button', { name: 'Dupliquer' }).click();
    await expect(rows).toHaveCount(3);
  });
});

test.describe('1.19, the feedback round', () => {
  test('the water beside the flame, a weigh-in deleted after the app’s own question, the sources of the guides', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, 'new');
    const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    expect((await page.request.patch('/api/me', { headers: { 'X-XSRF-TOKEN': xsrf }, data: { waterGoal: 8 } })).ok()).toBe(true);
    await page.goto('/app');
    await expect(page.locator('#boot')).toHaveCount(0);

    // the glasses a swipe away from the flame (the dots under them lead there too)
    const water = page.locator('.hero app-water-card');
    await expect(page.locator('.hero .streak')).toBeInViewport();
    await expect(water).not.toBeInViewport();
    await page.locator('.hero-dots button').nth(1).click();
    await expect(water).toBeInViewport();
    await expect(page.locator('.hero-dots button').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await press(water.getByRole('button', { name: /verre/i }).first());
    await expect(water.locator('.litres b')).toHaveText('0,25');
    await expectAccessible(page);

    // the weigh-in of the day (onboarding noted it): deleted only once the question is answered
    await page.locator('.task').first().click();
    await page.getByRole('button', { name: 'Supprimer cette journée' }).click();
    const ask = page.getByRole('alertdialog', { name: 'Supprimer ta pesée d’aujourd’hui ?' });
    await expect(ask).toBeVisible();
    await expect(ask.getByText('Ton poids et tes mensurations de cette journée seront effacés pour de bon')).toBeVisible();
    await expectAccessible(page);
    await ask.getByRole('button', { name: 'Annuler' }).click();
    await expect(ask).toBeHidden();
    await page.getByRole('button', { name: 'Supprimer cette journée' }).click();
    await ask.getByRole('button', { name: 'Supprimer' }).click();
    await expect(page.getByText('Journée supprimée')).toBeVisible();
    await expect(page.locator('.task.todo-now .todo-chip')).toHaveText('À faire');

    // « Bon à savoir »: who says each figure, with the page to read
    await page.goto('/app/meals');
    await page.getByRole('button', { name: /Tous les repères/ }).click();
    const sheet = page.locator('dialog[open]');
    await sheet.getByText('Sources des repères').click();
    await expect(sheet.getByText(/OMS, « Réduction de l’apport en sodium »/)).toBeVisible();
    await expect(sheet.getByRole('link', { name: /Lire sur who\.int/ }).first()).toHaveAttribute(
      'href',
      'https://www.who.int/fr/news-room/fact-sheets/detail/healthy-diet',
    );
  });

  test('a recipe sent to a friend, its link opened in a browser, then pasted in the app’s search', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await signIn(page, 'new');
    const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    const made = await page.request.post('/api/me/recipes', {
      headers: { 'X-XSRF-TOKEN': xsrf },
      data: { name: 'Tarte fine', type: 'DINNER', servings: 2, ingredients: [], manual: { kcal: 400 }, visibility: 'FRIENDS' },
    });
    expect(made.status()).toBe(201);
    const { id } = (await made.json()) as { id: string };

    // « Envoyer à un ami »: the friends of the app first, else the link
    await page.goto(`/app/meals/recipes/${id}`);
    await page.getByRole('button', { name: 'Envoyer à un ami' }).click();
    const send = page.getByRole('dialog', { name: 'Envoyer à un ami' });
    await expect(send.getByText('Pas encore d’amis dans l’app')).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');

    // the link in a browser without the app: the page that says how to open it there, not the presentation
    const origin = new URL(page.url()).origin;
    const alone = await openAlone(browser, page, `${origin}/app/meals/recipes/${id}`);
    await expect(alone).toHaveURL(new RegExp(`/recette/${id}$`));
    await expect(alone.getByRole('heading', { name: 'Une recette t’attend dans MyBody365' })).toBeVisible();
    await expect(alone.getByRole('button', { name: 'Copier le lien' })).toBeVisible();
    await alone.context().close();

    // pasted in the search of « Ajouter », it opens the recipe
    await page.goto('/app/meals/add?slot=DINNER');
    await page.getByRole('searchbox').fill(`Ma recette « Tarte fine » sur MyBody365 ${origin}/app/meals/recipes/${id}`);
    await expect(page).toHaveURL(new RegExp(`/app/meals/recipes/${id}`));
    await expect(page.getByRole('heading', { name: 'Tarte fine' })).toBeVisible();
  });
});

/** a finger sliding a row to the left (once the splash is gone, the row in the middle of the screen, away from the bars) */
async function swipeLeft(page: Page, row: Locator): Promise<void> {
  await expect(page.locator('#boot')).toHaveCount(0);
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const box = await row.boundingBox();
  if (!box) throw new Error('no row');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 30, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 230, y, { steps: 12 });
  await page.mouse.up();
}

/** a page of a browser with no session at all (the coach's) */
async function openAlone(browser: Browser, from: Page, url: string) {
  const origin = new URL(from.url()).origin;
  const context = await browser.newContext({ locale: 'fr-FR' });
  const page = await context.newPage();
  await page.goto(origin + new URL(url).pathname + new URL(url).hash);
  return page;
}
