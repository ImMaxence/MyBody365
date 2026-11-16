import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, signIn, tab, watchErrors } from './helpers';

test.describe('meals', () => {
  test('fast food: a quick portion with its calories, then a recipe with the calories entered by hand', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await page.goto('/app/meals/add?slot=LUNCH');
    await expect(page.getByRole('heading', { name: 'Au déjeuner' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Au restaurant, en fast-food' }).getByRole('button', { name: /Kebab/ })).toBeVisible();
    await page.getByRole('button', { name: /^Ajout rapide Juste les calories/ }).click();
    const quick = page.getByRole('dialog', { name: 'Ajout rapide' });
    await quick.getByLabel('Ce que tu as mangé').fill('Menu burger frites');
    await expect(quick.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
    await quick.getByLabel('Calories de la portion').fill('1080');
    await expectAccessible(page);
    await quick.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByRole('heading', { name: 'Repas', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Menu burger frites/ })).toContainText(/1\s?080/);

    // a recipe from a site, written by hand: lines and calories per serving
    await page.goto('/app/meals/recipes/new');
    await page.getByLabel('Nom de la recette').fill('Bruschetta maison');
    await page.getByRole('radio', { name: /À la main/ }).click();
    await page.getByLabel('Ingrédients, un par ligne').fill('450 g de pain\n160 g de crème fraîche');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(/Indique les calories par part/)).toBeVisible();
    await page.getByLabel('Calories par part').fill('215');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: 'Bruschetta maison', level: 1 })).toBeVisible();
    await expect(page.getByText('160 g de crème fraîche')).toBeVisible();
    await expect(page.getByText(/indiquées à la main/)).toBeVisible();
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });

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

    // the balance of the day, provisional, and what it is made of
    await page.getByRole('button', { name: /Équilibre de la journée/ }).click();
    const balance = page.getByRole('dialog', { name: 'Équilibre de la journée' });
    await expect(balance.getByText('Nutriments', { exact: true })).toBeVisible();
    await expectAccessible(page);
    await balance.locator('.sheet-grip').click();
    await expect(balance).toBeHidden();

    // the week strip marks the day, the calendar opens from the date and closes from its grip
    await expect(page.getByRole('group', { name: 'Jours de la semaine' }).getByRole('button', { pressed: true })).toHaveAttribute('aria-label', /960 kcal/);
    await page.getByRole('button', { name: /Aujourd’hui/ }).click();
    const calendar = page.getByRole('dialog', { name: 'Calendrier des repas' });
    await expect(calendar.getByText('Jours notés : 1', { exact: false })).toBeVisible();
    await expectAccessible(page);
    await calendar.locator('.sheet-grip').click();
    await expect(calendar).toBeHidden();

    // the stats of the period
    await page.getByRole('link', { name: 'Statistiques' }).click();
    await expect(page.getByRole('heading', { name: 'Statistiques', level: 1 })).toBeVisible();
    await expect(page.getByText('Moyenne par jour')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Calories jour par jour' })).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await page.getByRole('button', { name: '7 jours' }).click();
    await expect(page.getByRole('button', { name: '7 jours' })).toHaveAttribute('aria-pressed', 'true');
    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);
    await page.goBack();

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
    await page.getByRole('radio', { name: /Communauté/ }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: recipe, level: 1 })).toBeVisible();
    await expect(page.getByText('640 kcal').or(page.getByText(/^640\s*kcal$/))).toBeVisible();
    await expect(page.locator('.meta').getByText('Communauté')).toBeVisible();
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
