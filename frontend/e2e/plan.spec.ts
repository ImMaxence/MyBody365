import { expect, test } from '@playwright/test';
import { expectAccessible, signIn } from './helpers';

test.describe('1.20', () => {
  test('a week planned: a recipe and a note, eaten on the day, on the shopping list, and planned from the recipe’s page', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, 'new');
    const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    const made = await page.request.post('/api/me/recipes', {
      headers: { 'X-XSRF-TOKEN': xsrf },
      data: { name: 'Riz sauté aux légumes', type: 'DINNER', servings: 2, ingredients: [], manual: { kcal: 450 }, visibility: 'PRIVATE' },
    });
    expect(made.status()).toBe(201);

    // the plan, from the Meals tab
    await page.goto('/app/meals');
    await page.getByRole('link', { name: 'Mon planning' }).click();
    await expect(page.getByRole('heading', { name: 'Mon planning', level: 1 })).toBeVisible();
    const today = page.locator('section.day').first();
    await expect(today.getByRole('heading', { name: /^Aujourd’hui/ })).toBeVisible();
    await expectAccessible(page);

    // tonight: a recipe of mine, for 2 servings
    await today.getByRole('button', { name: 'Prévoir' }).click();
    const sheet = page.getByRole('dialog', { name: 'Prévoir un repas' });
    await sheet.getByRole('button', { name: 'Dîner' }).click();
    await sheet.getByRole('searchbox', { name: 'Chercher dans mes recettes et mes favoris' }).fill('riz');
    await sheet.getByRole('button', { name: /Riz sauté aux légumes/ }).click();
    await sheet.getByRole('button', { name: '+', exact: true }).click();
    await sheet.getByRole('button', { name: 'Prévoir', exact: true }).click();
    await expect(page.getByText(/«\sRiz sauté aux légumes\s» prévu pour aujourd’hui/)).toBeVisible();
    await expect(today.getByText('Riz sauté aux légumes')).toBeVisible();
    await expect(today.getByText(/1,5 part\(s\) · 675 kcal/)).toBeVisible();

    // tomorrow at noon: a note
    const tomorrow = page.locator('section.day').nth(1);
    await tomorrow.getByRole('button', { name: 'Prévoir' }).click();
    await sheet.getByRole('button', { name: 'Déjeuner', exact: true }).click();
    await sheet.getByRole('button', { name: 'Une note' }).click();
    await sheet.getByRole('textbox', { name: 'Ta note' }).fill('Restaurant avec Léa');
    await sheet.getByRole('button', { name: 'Prévoir', exact: true }).click();
    await expect(tomorrow.getByText('Restaurant avec Léa')).toBeVisible();
    // a note is not eaten, a meal of tomorrow not yet
    await expect(tomorrow.getByRole('button', { name: 'C’est mangé' })).toHaveCount(0);

    // the week on the shopping list
    await page.getByRole('button', { name: 'Ajouter à la liste de courses' }).click();
    await expect(page.getByText('Les repas prévus sont sur ta liste de courses')).toBeVisible();

    // on the day, in its meal: « C'est mangé » notes it
    await page.goto('/app/meals');
    const dinner = page.locator('section.slot').nth(2);
    await expect(dinner.locator('.planned').getByText('Riz sauté aux légumes')).toBeVisible();
    await dinner.locator('.planned').getByRole('button', { name: 'C’est mangé' }).click();
    await expect(page.getByText(/«\sRiz sauté aux légumes\s» noté dans tes repas/)).toBeVisible();
    await expect(dinner.locator('.entry', { hasText: 'Riz sauté aux légumes' })).toBeVisible();
    await expect(dinner.locator('.planned')).toHaveCount(0);

    // from the recipe's page: the calendar button, a day of the next two weeks
    const { id } = (await made.json()) as { id: string };
    await page.goto(`/app/meals/recipes/${id}`);
    await page.getByRole('button', { name: 'Prévoir' }).click();
    const when = page.getByRole('dialog', { name: 'Prévoir cette recette' });
    await when.getByRole('button', { name: 'Demain' }).click();
    await when.getByRole('button', { name: 'Dîner' }).click();
    await when.getByRole('button', { name: 'Prévoir', exact: true }).click();
    await expect(page.getByText(/«\sRiz sauté aux légumes\s» prévu pour demain · dîner/)).toBeVisible();
    await page.goto('/app/meals/plan');
    await expect(page.locator('section.day').nth(1).getByText('Riz sauté aux légumes')).toBeVisible();
  });
});
