import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, signIn, tab, watchErrors } from './helpers';

test.describe('meals', () => {
  test('a food of my own, logged at lunch, then a recipe shared with the community', async ({ page, browser }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await tab(page, 'Repas').click();
    await expect(page.getByRole('heading', { name: 'Repas', level: 1 })).toBeVisible();
    for (const slot of ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Collations']) {
      await expect(page.getByRole('heading', { name: slot, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('img', { name: /kcal consommées sur/ })).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);

    // lunch → search → nothing → create the food
    await page.locator('section.slot').filter({ has: page.getByRole('heading', { name: 'Déjeuner', exact: true }) }).getByRole('link', { name: 'Ajouter' }).click();
    await expect(page.getByRole('heading', { name: 'Au déjeuner' })).toBeVisible();
    const name = `Galette maison ${Date.now() % 100000}`;
    await page.getByRole('searchbox', { name: 'Rechercher un aliment' }).fill(name);
    await expect(page.getByText('Aucun aliment trouvé')).toBeVisible();
    await page.getByRole('link', { name: /Créer un aliment/ }).click();
    await page.getByLabel('Nom', { exact: true }).fill(name);
    await page.getByLabel('Énergie (kcal)').fill('320');
    await page.getByLabel('Protéines (g)').fill('7');
    await page.getByLabel('dont sucres (g)').fill('2');
    await page.getByLabel('dont saturés (g)').fill('5');
    await page.getByLabel('Sel (g)').fill('1,1');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // back on the add screen, the amount sheet opens for it
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name })).toBeVisible();
    await sheet.getByRole('button', { name: '150 g' }).click();
    await expect(sheet.getByText('480', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Ajouter' }).click();

    // listed at lunch
    const entry = page.getByRole('button', { name: new RegExp(name) });
    await expect(entry).toContainText('150 g');
    await expect(entry).toContainText('480');
    await entry.click();
    await page.getByRole('dialog').getByLabel('Quantité en grammes').fill('300');
    await page.getByRole('dialog').getByLabel('Quantité en grammes').press('Tab');
    await expect(page.getByRole('dialog').getByText('960 kcal')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(entry).toContainText('960');

    // a recipe with it, shared
    await page.getByRole('link', { name: 'Recettes' }).click();
    await expect(page.getByText(/Tes recettes maison/)).toBeVisible();
    await page.getByRole('link', { name: 'Nouvelle recette' }).click();
    const recipe = `Galettes du dimanche ${Date.now() % 100000}`;
    await page.getByLabel('Nom de la recette').fill(recipe);
    await page.getByRole('radio', { name: /Dessert/ }).click();
    await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
    const picker = page.getByRole('dialog');
    await picker.getByRole('searchbox').fill(name);
    await picker.getByRole('button', { name: new RegExp(name) }).first().click();
    await page.getByLabel(`Grammes de ${name}`).fill('400');
    await page.getByLabel('Partager avec la communauté').check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: recipe, level: 1 })).toBeVisible();
    await expect(page.getByText('640 kcal').or(page.getByText(/^640\s*kcal$/))).toBeVisible();
    await expect(page.getByText('Partagée')).toBeVisible();
    await expectAccessible(page);

    // another member finds it in the community and likes it
    const other = await browser.newContext({ ...test.info().project.use });
    const otherPage = await other.newPage();
    await signIn(otherPage, 'user');
    await otherPage.goto('/app/meals/recipes');
    await otherPage.getByRole('button', { name: 'Communauté' }).click();
    await otherPage.getByRole('link', { name: new RegExp(recipe) }).click();
    await otherPage.getByRole('button', { name: 'J’aime', exact: true }).click();
    await expect(otherPage.locator('.score')).toHaveText('1');
    await other.close();
    expect(errors).toEqual([]);
  });
});
