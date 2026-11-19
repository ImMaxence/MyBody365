import type { Food } from '../api/models';

/**
 * 1.13: what the app knows of a product's kind, and the portions of a drink. A drink, a milk or a soup is measured in
 * millilitres (1 ml counted as 1 g: the values per 100 ml of a drink are read as per 100 g, a milk weighs 3 % more), with
 * the usual containers: a cup, a glass, a mug, a bowl, and the product's own can or bottle.
 */

/** the food groups of Open Food Facts (PNNS) the app words */
const KINDS = new Set([
  'biscuitsAndCakes', 'sweets', 'dressingsAndSauces', 'oneDishMeals', 'cheese', 'cereals', 'bread', 'meat', 'sweetenedBeverages',
  'appetizers', 'breakfastCereals', 'pastries', 'processedMeat', 'fruits', 'pizzaPiesAndQuiches', 'milkAndYogurt', 'fishAndSeafood',
  'fruitJuices', 'vegetables', 'nuts', 'chocolateProducts', 'unsweetenedBeverages', 'legumes', 'teasAndHerbalTeasAndCoffees', 'fats',
  'artificiallySweetenedBeverages', 'alcoholicBeverages', 'driedFruits', 'plantBasedMilkSubstitutes', 'watersAndFlavoredWaters',
  'sandwiches', 'iceCream', 'potatoes', 'saltyAndFattyProducts', 'soups', 'dairyDesserts', 'eggs', 'offals', 'fruitNectars', 'babyFoods',
]);

/** « Biscuits and cakes » → « biscuitsAndCakes », the key of its words; null when the app has no word for it */
export function kindKey(pnns?: string | null): string | null {
  if (!pnns) return null;
  const words = pnns.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const key = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
  return KINDS.has(key) ? key : null;
}

export interface Cup {
  key: 'cup' | 'glass' | 'mug' | 'bowl' | 'can' | 'bottle' | 'wine' | 'half' | 'pint';
  ml: number;
}

/** an alcoholic drink, by its source's group */
export function isAlcohol(f: Pick<Food, 'kind' | 'category'>): boolean {
  return f.kind === 'Alcoholic beverages' || f.category === 'boisson alcoolisées';
}

const SODAS = new Set(['Sweetened beverages', 'Artificially sweetened beverages', 'Unsweetened beverages', 'Waters and flavored waters']);

/**
 * The containers offered for a drink: a glass of wine, a half or a pint for alcohol; otherwise a cup (150 ml), a glass
 * (200 ml), a mug (300 ml) and a bowl (400 ml, for a milk or a soup), plus the product's own can or bottle
 */
export function cupsFor(f: Pick<Food, 'kind' | 'category' | 'packageMl'>): Cup[] {
  if (isAlcohol(f)) return [{ key: 'wine', ml: 125 }, { key: 'half', ml: 250 }, { key: 'pint', ml: 500 }];
  const cups: Cup[] = [
    { key: 'cup', ml: 150 },
    { key: 'glass', ml: 200 },
    { key: 'mug', ml: 300 },
    { key: 'bowl', ml: 400 },
  ];
  const ml = f.packageMl;
  if (ml && ml >= 100 && ml <= 1000 && !cups.some((c) => c.ml === ml)) {
    cups.push({ key: ml <= 355 && f.kind && SODAS.has(f.kind) ? 'can' : 'bottle', ml });
  }
  return cups;
}
