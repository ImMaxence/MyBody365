import { averageHealth, friedName, friedRecipe, healthAlerts, healthBand, healthScore, recipeHealth } from './health';

/** the same foods as the server's test (backend NutritionUnitTest.healthScore): both sides must agree */
describe('health score', () => {
  it('a recipe is fried by its ingredients, its name only with enough fat to have soaked it up (1.20)', () => {
    const nems = [
      { grams: 200, name: 'Poulet, filet sans peau cru' },
      { grams: 109, name: 'Galette de riz · Mei Asia' },
      { grams: 2, name: 'Huile dolive · Lesieur' },
    ];
    expect(friedRecipe('Nems poulet légumes', nems)).toBe(false);
    expect(friedRecipe('Nems frits', [...nems.slice(0, 2), { grams: 40, name: 'Huile d’olive vierge extra' }])).toBe(true);
    expect(friedRecipe('Assiette du soir', [{ grams: 150, name: 'Frites, fast-food' }, { grams: 100, name: 'Steak haché' }])).toBe(true);
  });

  const score = (p: Parameters<typeof healthScore>[0]) => healthScore(p)?.score;

  it('rates plain foods well and processed ones badly, where the Nutri-Score does not', () => {
    // olive oil: judged on its fat, not on its 900 kcal
    expect(score({ kcal: 900, proteinG: 0, carbsG: 0, sugarsG: 0, fatG: 100, satFatG: 14, saltG: 0, nova: 2 })).toBe(8.5);
    // butter: mostly saturated fat
    expect(score({ kcal: 745, proteinG: 0.7, carbsG: 0.6, sugarsG: 0.6, fatG: 82, satFatG: 54, saltG: 0.04, nova: 2 })).toBe(1.5);
    // industrial fries: fried and ultra-processed (an A on the Nutri-Score)
    expect(score({ kcal: 312, proteinG: 3.4, sugarsG: 0.3, fatG: 15, satFatG: 2.3, fiberG: 3.8, saltG: 0.5, nova: 4, fried: true })).toBe(2.5);
    // sweet breakfast cereals: sugar and ultra-processing outweigh their fibre
    expect(score({ kcal: 389, proteinG: 9, sugarsG: 23.5, fatG: 4.5, satFatG: 2.1, fiberG: 8.5, saltG: 0.2, nova: 4, additives: 1 })).toBe(3);
    expect(score({ kcal: 150, proteinG: 30, sugarsG: 0, fatG: 3, satFatG: 1, fiberG: 0, saltG: 0.2, nova: 1 })).toBe(9.5);
    expect(score({ kcal: 539, proteinG: 6.3, sugarsG: 56.3, fatG: 30.9, satFatG: 10.6, fiberG: 3.4, saltG: 0.1, nova: 4, additives: 2 })).toBe(0);
  });

  it('judges drinks against water', () => {
    expect(score({ kcal: 0, water: true })).toBe(10);
    expect(score({ kcal: 42, sugarsG: 10.6, satFatG: 0, saltG: 0, drink: true, nova: 4 })).toBe(0.5);
    expect(score({ kcal: 0.2, sugarsG: 0, satFatG: 0, saltG: 0.02, drink: true, nova: 4, sweeteners: true, additives: 4 })).toBe(5.5);
    expect(healthScore({ kcal: 42, alcohol: true })).toBeNull();
  });

  it('says only what is true by the usual claims, and nothing good of a poor food', () => {
    const nutella = healthScore({ kcal: 539, proteinG: 6.3, sugarsG: 56.3, fatG: 30.9, satFatG: 10.6, fiberG: 3.4, saltG: 0.1, nova: 4 })!;
    expect(nutella.pros).toEqual([]);
    expect(nutella.cons[0]).toBe('sugars');
    const lentils = healthScore({ kcal: 116, proteinG: 9, sugarsG: 1, fatG: 0.4, satFatG: 0.1, fiberG: 7.9, saltG: 0.01, fruitVeg: 100 })!;
    expect(lentils.pros).toEqual(expect.arrayContaining(['fruitVeg', 'fiber', 'protein']));
  });

  it('needs the sugars, the saturated fat and the salt', () => {
    expect(healthScore({ kcal: 300, proteinG: 10 })).toBeNull();
  });

  it('reads a fried name, bands, alerts, recipes and meals', () => {
    expect(friedName('Frites surgelées')).toBe(true);
    expect(friedName('Poulet pané')).toBe(true);
    expect(friedName('Pain complet')).toBe(false);
    expect(healthBand(8)).toBe('great');
    expect(healthBand(2)).toBe('poor');
    expect(healthAlerts({ kcal: 380, sugarsG: 0, satFatG: 18, saltG: 0.7 }).map((a) => a.key)).toEqual(['satFat']);
    expect(healthAlerts({ kcal: 42, sugarsG: 12, satFatG: 0, saltG: 0, drink: true }).map((a) => a.key)).toEqual(['sugars']);
    const ratatouille = recipeHealth([
      { grams: 800, per100: { kcal: 25, proteinG: 1, sugarsG: 3, fatG: 0.2, satFatG: 0, fiberG: 2, saltG: 0.02 }, fruitVeg: true },
      { grams: 20, per100: { kcal: 900, sugarsG: 0, fatG: 100, satFatG: 14, saltG: 0 } },
    ]);
    expect(ratatouille!.score).toBeGreaterThanOrEqual(9);
    expect(averageHealth([{ health: 9, kcal: 100 }, { health: 1, kcal: 300 }, { health: null, kcal: 500 }])).toBe(3);
  });
});
