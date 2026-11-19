import { isFruitVeg, nutriscore, recipeGrade } from './nutriscore';

describe('nutriscore', () => {
  // a ratatouille: the same values score better when they are mostly vegetables
  const ratatouille = { kcal: 80, proteinG: 1.3, sugarsG: 4.5, satFatG: 0.8, saltG: 0.7, fiberG: 1.8 };

  it('counts the share of fruit, vegetables and legumes', () => {
    expect(nutriscore(ratatouille)).toBe('c');
    expect(nutriscore(ratatouille, 85)).toBe('a');
    expect(isFruitVeg('légumes')).toBe(true);
    expect(isFruitVeg('Légumineuses')).toBe(true);
    // 1.13: the nuts count too (the health score counts them, as fruit and vegetables)
    expect(isFruitVeg('fruits à coque et graines oléagineuses')).toBe(true);
    expect(isFruitVeg(undefined)).toBe(false);
  });

  it('grades a recipe from its lines, by weight', () => {
    const veg = { kcal: 25, proteinG: 1, sugarsG: 3, satFatG: 0.05, saltG: 0.02, fiberG: 2 };
    const oil = { kcal: 900, proteinG: 0, sugarsG: 0, satFatG: 14, saltG: 0, fiberG: 0 };
    // 900 g of vegetables, a spoon of oil: mostly vegetables
    expect(recipeGrade([{ grams: 900, per100: veg, fruitVeg: true }, { grams: 15, per100: oil }])).toBe('a');
    // the same lines, the vegetables not known as such: a stricter grade
    expect(recipeGrade([{ grams: 900, per100: veg }, { grams: 15, per100: oil }])).not.toBe(null);
    // nothing known about sugars, saturated fat or salt: no grade
    expect(recipeGrade([{ grams: 200, per100: { kcal: 120 } }])).toBe(null);
    expect(recipeGrade([])).toBe(null);
  });
});
