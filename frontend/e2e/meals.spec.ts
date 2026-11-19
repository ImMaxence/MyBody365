import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalOverflow, signIn, tab, watchErrors } from './helpers';

test.describe('meals', () => {
  test('fast food: a quick portion with its calories, then a recipe with the calories entered by hand', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await page.goto('/app/meals/add?slot=LUNCH');
    await expect(page.getByRole('heading', { name: 'Au déjeuner' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Au restaurant, en fast-food' }).getByRole('button', { name: /Kebab/ })).toBeVisible();
    // 1.9: the ways in, one under the other
    const ways = page.getByRole('navigation', { name: 'Où chercher' });
    await expect(ways.getByRole('link', { name: /^Produits industriels/ })).toBeVisible();
    await expect(ways.getByRole('link', { name: /^Les recettes/ })).toBeVisible();
    await expect(ways.getByRole('link', { name: /^Aliments bruts/ })).toBeVisible();
    await ways.getByRole('button', { name: /^Tu n’as pas trouvé \?/ }).click();
    const quick = page.getByRole('dialog', { name: 'Ajout rapide' });
    await quick.getByLabel('Ce que tu as mangé').fill('Menu burger frites');
    await expect(quick.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
    await quick.getByLabel('Calories de la portion').fill('1080');
    await expectAccessible(page);
    await quick.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByRole('heading', { name: 'Repas', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Menu burger frites/ })).toContainText(/1\s?080/);

    // a kebab at the snack bar, by estimate: the sandwich, medium fries, a Coke; each on its own line
    await page.goto('/app/meals/add?slot=LUNCH');
    await page.getByRole('group', { name: 'Au restaurant, en fast-food' }).getByRole('button', { name: /Kebab/ }).click();
    const est = page.getByRole('dialog', { name: 'Kebab' });
    await expect(est.getByRole('radio', { name: /Sandwich \(pain\)/ })).toHaveAttribute('aria-checked', 'true');
    await est.getByRole('radiogroup', { name: 'Des frites avec ?' }).getByRole('radio', { name: /Moyenne/ }).click();
    await est.getByRole('radio', { name: /Coca-Cola 33 cl/ }).click();
    await expect(est.getByText(/≈ 1\s?179 kcal/)).toBeVisible();
    await expectAccessible(page);
    await est.getByRole('button', { name: /Ajouter au déjeuner/ }).click();
    await expect(page.getByRole('heading', { name: 'Repas', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /Kebab \(Sandwich \(pain\)\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Frites \(Moyenne\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Coca-Cola 33 cl/ })).toBeVisible();

    // a French tacos without its cheese sauce, and half of it: the estimate follows
    await page.goto('/app/meals/add?slot=DINNER');
    await page.getByRole('group', { name: 'Au restaurant, en fast-food' }).getByRole('button', { name: /Tacos/ }).click();
    const tacos = page.getByRole('dialog', { name: 'Tacos' });
    await tacos.getByRole('radiogroup', { name: 'Sauce fromagère' }).getByRole('radio', { name: /Sans/ }).click();
    await expect(tacos.getByText(/≈ 770 kcal/).first()).toBeVisible();
    await tacos.getByRole('radio', { name: 'La moitié' }).click();
    await expect(tacos.getByText(/≈ 385 kcal/).first()).toBeVisible();
    await tacos.getByRole('button', { name: 'Masquer le panneau' }).click();

    // an everyday drink: a cappuccino with oat milk and a sugar, one line with its Nutri-Score
    await page.goto('/app/meals/add?slot=BREAKFAST');
    await page.getByRole('group', { name: 'Boissons' }).getByRole('button', { name: /Café/ }).click();
    const cup = page.getByRole('dialog', { name: 'Café' });
    await cup.getByRole('radio', { name: /Cappuccino/ }).click();
    await cup.getByRole('radio', { name: 'Avoine' }).click();
    await cup.getByRole('radio', { name: /^1 sucre/ }).click();
    await expect(cup.getByText(/≈ 76 kcal/)).toBeVisible();
    await expectAccessible(page);
    await cup.getByRole('button', { name: /Ajouter au petit-déjeuner/ }).click();
    await expect(page.getByRole('button', { name: /Cappuccino · lait d’avoine, 1 sucre/ })).toBeVisible();

    // without network: the meal stays on the phone, shown as waiting, and goes once the network is back
    await page.goto('/app/meals/add?slot=SNACK');
    await page.context().setOffline(true);
    await page.getByRole('button', { name: /Tu n’as pas trouvé/ }).first().click();
    const quickSheet = page.getByRole('dialog', { name: 'Ajout rapide' });
    await quickSheet.getByLabel('Ce que tu as mangé').fill('Pomme du métro');
    await quickSheet.getByLabel('Calories de la portion').fill('80');
    await quickSheet.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByText('Pas de réseau : noté sur ton téléphone, envoyé dès le retour du réseau')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '1 saisie en attente de réseau' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pomme du métro/ })).toContainText('En attente de réseau');
    await page.context().setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'en attente de réseau' })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Pomme du métro/ })).not.toContainText('En attente de réseau');
    await page.reload();
    await expect(page.getByRole('button', { name: /Pomme du métro/ })).toBeVisible();

    // a drink at the apéro: two beers, no Nutri-Score for alcohol, the standard drinks said
    await page.goto('/app/meals/add?slot=DINNER');
    await page.getByRole('group', { name: 'À l’apéro' }).getByRole('button', { name: /Bière/ }).click();
    const beer = page.getByRole('dialog', { name: 'Bière' });
    await expect(beer.getByRole('radio', { name: /Bière blonde/ })).toHaveAttribute('aria-checked', 'true');
    await beer.getByRole('radio', { name: '2 verres' }).click();
    await expect(beer.getByText(/≈ 257 kcal/)).toBeVisible();
    await expect(beer.getByText(/verre\(s\) standard/)).toBeVisible();
    await expect(beer.getByText('Pas de Nutri-Score pour les boissons alcoolisées')).toBeVisible();
    await expectAccessible(page);
    await beer.getByRole('button', { name: /Ajouter au dîner/ }).click();
    await expect(page.getByRole('button', { name: /Bière blonde, 33 cl × 2/ })).toBeVisible();

    // the recipes, from the add screen: the import by link comes first
    const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    const made = await page.request.post('/api/me/recipes', {
      headers: { 'X-XSRF-TOKEN': xsrf },
      data: { name: 'Soupe du soir', type: 'DINNER', servings: 2, ingredients: [], manual: { kcal: 250 }, visibility: 'PRIVATE' },
    });
    expect(made.status()).toBe(201);
    await page.goto('/app/meals');
    await page.locator('section.slot').filter({ has: page.getByRole('heading', { name: 'Dîner', exact: true }) }).getByRole('link', { name: 'Ajouter' }).click();
    await page.getByRole('link', { name: /^Les recettes/ }).click();
    await expect(page.getByRole('heading', { name: 'Recettes', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Importer un lien' })).toBeVisible();
    // 1.9: « Ajouter au dîner », then back to the meals with it
    await page.getByRole('button', { name: 'Mes recettes' }).click();
    await page.getByRole('link', { name: /Soupe du soir/ }).click();
    await page.getByRole('button', { name: 'Ajouter au dîner' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ajouter au dîner' }).click();
    await expect(page.getByRole('heading', { name: 'Repas', level: 1 })).toBeVisible();
    await expect(page.locator('section.slot').filter({ has: page.getByRole('heading', { name: 'Dîner', exact: true }) })).toContainText('Soupe du soir');

    // a recipe from a site, written by hand: lines and calories per serving
    await page.goto('/app/meals/recipes/new');
    await page.getByLabel('Nom de la recette').fill('Bruschetta maison');
    await page.getByRole('radio', { name: /À la main/ }).click();
    // 1.9: said in red, with the way back to the foods
    await expect(page.getByText('À la main, ta recette sera incomplète')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choisir les aliments' })).toBeVisible();
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
    // three accounts, the community and the lookalikes: longer than one screen's test
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await signIn(page, 'new');
    await tab(page, 'Repas').click();
    await expect(page.getByRole('heading', { name: 'Repas', level: 1 })).toBeVisible();
    for (const slot of ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Collations']) {
      await expect(page.getByRole('heading', { name: slot, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('img', { name: /kcal consommées sur/ })).toBeVisible();
    // the day's target stays readable, with what was eaten
    await expect(page.getByText('Objectif du jour')).toBeVisible();
    await expect(page.getByText('0 kcal consommées')).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);

    // lunch → search → nothing → create the food
    await page.locator('section.slot').filter({ has: page.getByRole('heading', { name: 'Déjeuner', exact: true }) }).getByRole('link', { name: 'Ajouter' }).click();
    await expect(page.getByRole('heading', { name: 'Au déjeuner' })).toBeVisible();
    const name = `Galette maison ${Date.now() % 100000}`;
    // 1.9: one search for everything; creating a food is on the page of the raw foods
    await page.getByRole('searchbox', { name: 'Rechercher un aliment, une recette, un produit' }).fill(name);
    await expect(page.getByText('Aucun aliment trouvé')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Produits industriels' })).toBeVisible();
    await page.getByRole('searchbox').fill('');
    await page.getByRole('link', { name: /^Aliments bruts/ }).click();
    await expect(page.getByRole('heading', { name: 'Aliments bruts', level: 1 })).toBeVisible();
    await expect(page.getByText(/La table Ciqual de l’Anses/)).toBeVisible();
    await expect(page.getByText(/Table .* aliments/)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('link', { name: /Créer un aliment/ }).click();
    await page.getByLabel('Nom', { exact: true }).fill(name);
    await page.getByLabel('Énergie (kcal)').fill('320');
    await page.getByLabel('Protéines (g)').fill('7');
    await page.getByLabel('dont sucres (g)').fill('2');
    await page.getByLabel('dont saturés (g)').fill('5');
    await page.getByLabel('Sel (g)').fill('1,1');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    // 1.11: a product that reads alike may be pointed out first: mine anyway
    const foodLooks = page.getByRole('dialog', { name: 'Il existe peut-être déjà' });
    await expect(foodLooks.or(page.getByRole('dialog').getByRole('heading', { name }))).toBeVisible();
    if (await foodLooks.isVisible()) await foodLooks.getByRole('button', { name: 'Créer mon aliment quand même' }).click();

    // back on the add screen, the amount sheet opens for it
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name })).toBeVisible();
    await sheet.getByRole('button', { name: '150 g' }).click();
    await expect(sheet.getByText('480', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Ajouter', exact: true }).click();

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
    // a dessert only (lunch, picked at first, taken off): one meal or several
    await page.getByRole('button', { name: /Dessert/ }).click();
    await page.getByRole('button', { name: /Déjeuner/ }).click();
    await expect(page.getByRole('button', { name: /Dessert/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Déjeuner/ })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
    const picker = page.getByRole('dialog');
    await picker.getByRole('searchbox').fill(name);
    await picker.getByRole('button', { name: new RegExp(name) }).first().click();
    await page.getByLabel(`Grammes de ${name}`).fill('400');
    // another food for the line: the search opens with its words, the weight stays
    await page.getByRole('button', { name: `Changer l’aliment ${name}` }).click();
    await expect(picker.getByRole('searchbox')).toHaveValue(name);
    await picker.getByRole('button', { name: new RegExp(name) }).first().click();
    await expect(page.getByLabel(`Grammes de ${name}`)).toHaveValue('400');
    // its Nutri-Score, live, from the ingredients
    await expect(page.getByRole('img', { name: /^Nutri-Score [A-E], estimé/ })).toBeVisible();
    await expect(page.getByText('Estimé d’après les ingrédients')).toBeVisible();
    // the community is published by the admins: a member shares with their friends
    await expect(page.getByRole('radio', { name: /Communauté/ })).toHaveCount(0);
    await page.getByRole('radio', { name: /Amis/ }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: recipe, level: 1 })).toBeVisible();
    await expect(page.getByText('640 kcal').or(page.getByText(/^640\s*kcal$/))).toBeVisible();
    await expect(page.locator('.meta').getByText('Amis')).toBeVisible();
    await expectAccessible(page);

    // an admin publishes one in the community, another member finds it and likes it
    const admin = await browser.newContext({ ...test.info().project.use });
    const adminPage = await admin.newPage();
    await signIn(adminPage, 'admin');
    await adminPage.goto('/app/meals/recipes/new');
    const shared = `Salade de l’équipe ${Date.now() % 100000}`;
    await adminPage.getByLabel('Nom de la recette').fill(shared);
    await adminPage.getByRole('radio', { name: /À la main/ }).click();
    await adminPage.getByLabel('Ingrédients, un par ligne').fill('200 g de tomates\n1 c. à soupe d’huile d’olive');
    await adminPage.getByLabel('Calories par part').fill('180');
    await adminPage.getByRole('radio', { name: /Communauté/ }).click();
    await adminPage.getByRole('button', { name: 'Enregistrer' }).click();
    // 1.10: the team's salads of the earlier runs look like it (on a database that kept them): created anyway
    const adminLooks = adminPage.getByRole('dialog', { name: 'Elle existe peut-être déjà' });
    await expect(adminPage.locator('.meta').getByText('Communauté').or(adminLooks)).toBeVisible();
    if (await adminLooks.isVisible()) await adminLooks.getByRole('button', { name: 'Créer ma recette quand même' }).click();
    await expect(adminPage.locator('.meta').getByText('Communauté')).toBeVisible();
    await admin.close();

    const other = await browser.newContext({ ...test.info().project.use });
    const otherPage = await other.newPage();
    await signIn(otherPage, 'user');
    await otherPage.goto('/app/meals/recipes');
    // one search for every recipe: found by its name among the team's 200, under « Communauté »
    await otherPage.getByRole('searchbox', { name: 'Chercher parmi toutes les recettes' }).fill(shared.replace('équipe', 'EQUIPE'));
    await expect(otherPage.getByRole('heading', { name: /^Communauté/, level: 2 })).toBeVisible();
    await otherPage.getByRole('link', { name: new RegExp(shared) }).click();
    await otherPage.getByRole('button', { name: 'J’aime', exact: true }).click();
    await expect(otherPage.locator('.score')).toHaveText('1');
    // back to the list: as it was left (the search, not « Mes recettes » again)
    await otherPage.goBack();
    await expect(otherPage.getByRole('searchbox', { name: 'Chercher parmi toutes les recettes' })).toHaveValue(shared.replace('équipe', 'EQUIPE'));
    await expect(otherPage.getByRole('link', { name: new RegExp(shared) })).toBeVisible();

    // 1.10: writing it again, the community's is offered first; opened, then back to mine, as it was left
    await otherPage.goto('/app/meals/recipes/new');
    await otherPage.getByLabel('Nom de la recette').fill(shared);
    await otherPage.getByRole('radio', { name: /À la main/ }).click();
    await otherPage.getByLabel('Ingrédients, un par ligne').fill('250 g de tomates');
    await otherPage.getByLabel('Calories par part').fill('150');
    await otherPage.getByRole('button', { name: 'Enregistrer' }).click();
    const looks = otherPage.getByRole('dialog', { name: 'Elle existe peut-être déjà' });
    await expect(looks.getByRole('button', { name: new RegExp(shared) })).toContainText('Communauté');
    await expectAccessible(otherPage);
    await looks.getByRole('button', { name: new RegExp(shared) }).click();
    await expect(otherPage.getByRole('heading', { name: shared, level: 1 })).toBeVisible();
    await otherPage.goBack();
    await expect(otherPage.getByLabel('Nom de la recette')).toHaveValue(shared);
    await expect(otherPage.getByLabel('Calories par part')).toHaveValue('150');
    // mine anyway: asked once, saved now
    await otherPage.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(otherPage.getByRole('heading', { name: shared, level: 1 })).toBeVisible();
    await expect(otherPage.getByText('250 g de tomates')).toBeVisible();
    await other.close();
    expect(errors).toEqual([]);
  });

  test('a recipe on the shopping list by aisle, then what to cook with what I have (1.11)', async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, 'new');
    const xsrf = (await page.context().cookies()).find((c) => c.name === 'XSRF-TOKEN')?.value ?? '';
    await page.request.delete('/api/me/shopping', { headers: { 'X-XSRF-TOKEN': xsrf } });
    // a community recipe, for 6
    await page.goto('/app/meals/recipes');
    await page.getByRole('searchbox', { name: 'Chercher parmi toutes les recettes' }).fill('ratatouille');
    await page.getByRole('link', { name: /Ratatouille/ }).first().click();
    await page.getByRole('button', { name: 'Ajouter à ma liste de courses' }).click();
    const sheet = page.getByRole('dialog', { name: 'Ajouter à ma liste de courses' });
    await sheet.getByRole('button', { name: '+' }).click();
    await sheet.getByRole('button', { name: 'Ajouter à ma liste' }).click();
    await expect(page.getByText('Ingrédients ajoutés à ta liste de courses')).toBeVisible();
    await page.getByRole('button', { name: 'Voir' }).click();
    // by aisle, the vegetables first; ticked in the basket, a line typed by hand
    await expect(page.getByRole('heading', { name: 'Liste de courses', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Fruits et légumes/ })).toBeVisible();
    const first = page.getByRole('checkbox').first();
    await first.click();
    await expect(first).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('textbox', { name: 'Ajouter un article' }).fill('Papier toilette');
    await page.getByRole('button', { name: 'Ajouter un article' }).click();
    await expect(page.getByRole('heading', { name: /Autres/ })).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Retirer les articles cochés (1)' }).click();
    await expect(page.getByText('Articles cochés retirés')).toBeVisible();
    // the meals tab says how many lines are left
    await tab(page, 'Repas').click();
    await expect(page.getByRole('link', { name: /Liste de courses, \d+ article/ })).toBeVisible();

    // what to cook with courgettes: the recipes that use them, what else they need
    await page.goto('/app/meals/recipes');
    await page.getByRole('link', { name: /Que faire avec ce que j’ai/ }).click();
    await expect(page.getByRole('heading', { name: 'Avec ce que j’ai', level: 1 })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Chercher un ingrédient' }).fill('courg');
    await page.getByRole('button', { name: 'Courgette', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^\d+ recettes?$/ })).toBeVisible();
    await expect(page.getByText('Avec tout ce que tu as choisi').first()).toBeVisible();
    await expectAccessible(page);
    // back from a recipe: the courgette is still chosen
    await page.locator('a.found').first().click();
    await expect(page.getByRole('button', { name: 'Ajouter à ma liste de courses' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Retirer Courgette' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a food of my own that already exists is pointed out (1.11)', async ({ page }) => {
    await signIn(page, 'new');
    await page.goto('/app/meals/add?slot=LUNCH');
    await page.goto('/app/meals/food/new');
    await page.getByLabel('Nom', { exact: true }).fill('Courgette');
    await page.getByLabel('Énergie (kcal)').fill('17');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    const looks = page.getByRole('dialog', { name: 'Il existe peut-être déjà' });
    await expect(looks.getByRole('button', { name: /Courgette/ }).first()).toBeVisible();
    await expectAccessible(page);
    // that one: it opens on the add screen, ready for its amount
    await looks.getByRole('button', { name: /Courgette/ }).first().click();
    await expect(page.getByRole('dialog').filter({ hasText: /Courgette/ })).toBeVisible();
  });
});
