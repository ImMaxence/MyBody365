import { healthScore } from './health';

/**
 * 1.17: a sandwich made up piece by piece: the bread and its size, then what goes inside, portion by portion (a slice of
 * ham, an egg, a spoon of mayonnaise), or any raw food of the table by the gram. Values per 100 g are rounded averages of
 * the Ciqual table and of shop labels; a portion is what usually goes into a sandwich. The health score is the sandwich's
 * own, from its values per 100 g.
 */

/** per 100 g: kcal, protein, carbohydrates, fat, sugars, saturated fat, salt, fibre */
export type Per100 = [number, number, number, number, number, number, number, number];

export type Group = 'meat' | 'cheese' | 'veg' | 'sauce';
export type Unit = 'slice' | 'piece' | 'egg' | 'spoon' | 'portion' | 'steak';

export interface Bread {
  key: string;
  per100: Per100;
  /** the sizes, in grams */
  sizes: { key: string; grams: number }[];
  usual: string;
  /** sliced bread, wraps, buns: made in a factory (NOVA 4) */
  industrial?: boolean;
}

export interface Ingredient {
  key: string;
  group: Group;
  per100: Per100;
  /** one portion, in grams */
  grams: number;
  unit: Unit;
}

/** a raw food of the table added by the gram (« Autre ingrédient ») */
export interface OtherFood {
  id: string;
  name: string;
  per100: Partial<Record<'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'sugarsG' | 'satFatG' | 'saltG' | 'fiberG', number>>;
  grams: number;
}

export interface Totals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarsG: number;
  satFatG: number;
  saltG: number;
  fiberG: number;
  grams: number;
}

export const BREADS: Bread[] = [
  {
    key: 'baguette',
    per100: [270, 9, 55, 1.3, 2.5, 0.3, 1.2, 3],
    sizes: [
      { key: 'quarter', grams: 62 },
      { key: 'third', grams: 85 },
      { key: 'half', grams: 125 },
      { key: 'twoThirds', grams: 165 },
    ],
    usual: 'half',
  },
  { key: 'cereal', per100: [250, 9.5, 44, 3.5, 3, 0.6, 1.1, 6.5], sizes: [{ key: 'third', grams: 85 }, { key: 'half', grams: 125 }], usual: 'half' },
  {
    key: 'sliced',
    per100: [270, 8.5, 49, 4.2, 5, 0.6, 1.2, 3],
    sizes: [{ key: 's2', grams: 50 }, { key: 's3', grams: 75 }, { key: 's4', grams: 100 }],
    usual: 's2',
    industrial: true,
  },
  {
    key: 'slicedWhole',
    per100: [250, 10, 41, 4, 4.5, 0.5, 1.1, 6.5],
    sizes: [{ key: 's2', grams: 50 }, { key: 's3', grams: 75 }, { key: 's4', grams: 100 }],
    usual: 's2',
    industrial: true,
  },
  { key: 'ciabatta', per100: [270, 9, 50, 3.5, 2, 0.5, 1.2, 2.5], sizes: [{ key: 'one', grams: 100 }, { key: 'big', grams: 140 }], usual: 'one' },
  { key: 'wrap', per100: [300, 8.5, 50, 7, 2.5, 2.5, 1.2, 3], sizes: [{ key: 'one', grams: 60 }, { key: 'big', grams: 80 }], usual: 'one', industrial: true },
  { key: 'bun', per100: [280, 9, 48, 5, 6, 1, 1.1, 2.5], sizes: [{ key: 'one', grams: 60 }, { key: 'big', grams: 85 }], usual: 'one', industrial: true },
  { key: 'bagel', per100: [260, 10, 50, 1.7, 6, 0.3, 1.1, 2.5], sizes: [{ key: 'one', grams: 90 }], usual: 'one' },
  { key: 'pita', per100: [275, 9, 55, 1.2, 2, 0.2, 1.2, 2.2], sizes: [{ key: 'one', grams: 70 }, { key: 'big', grams: 100 }], usual: 'one' },
];

const i = (key: string, group: Group, per100: Per100, grams: number, unit: Unit): Ingredient => ({ key, group, per100, grams, unit });

export const INGREDIENTS: Ingredient[] = [
  // meat, fish, eggs
  i('ham', 'meat', [115, 20, 1, 3.5, 0.8, 1.2, 2, 0], 40, 'slice'),
  i('rawHam', 'meat', [250, 27, 0.5, 16, 0.5, 5.5, 5.5, 0], 20, 'slice'),
  i('chicken', 'meat', [150, 28, 1, 4, 0.5, 1.1, 1.2, 0], 60, 'portion'),
  i('turkey', 'meat', [105, 20, 1.5, 2, 1, 0.6, 2, 0], 30, 'slice'),
  i('tuna', 'meat', [115, 26, 0, 1, 0, 0.3, 0.9, 0], 50, 'portion'),
  i('egg', 'meat', [140, 12.5, 0.5, 9.5, 0.3, 2.8, 0.35, 0], 50, 'egg'),
  i('salmon', 'meat', [180, 22, 0.5, 10, 0, 1.8, 3, 0], 25, 'slice'),
  i('bacon', 'meat', [300, 25, 1, 22, 0, 8, 4, 0], 10, 'slice'),
  i('salami', 'meat', [400, 26, 2, 32, 1, 12, 4.7, 0], 15, 'portion'),
  i('chorizo', 'meat', [450, 24, 2, 38, 1, 14, 4.3, 0], 15, 'portion'),
  i('steak', 'meat', [230, 26, 0, 14, 0, 6, 0.2, 0], 100, 'steak'),
  i('falafel', 'meat', [330, 13, 32, 17, 2, 2, 1.2, 5], 20, 'piece'),
  // cheese
  i('emmental', 'cheese', [380, 28, 0, 29, 0, 19, 0.5, 0], 20, 'slice'),
  i('comte', 'cheese', [410, 27, 0, 34, 0, 22, 0.8, 0], 20, 'slice'),
  i('raclette', 'cheese', [350, 23, 0.5, 28, 0, 18, 1.8, 0], 30, 'slice'),
  i('mozzarella', 'cheese', [250, 18, 1.5, 19, 1, 13, 0.5, 0], 30, 'slice'),
  i('goat', 'cheese', [300, 19, 1, 24, 1, 17, 1.4, 0], 20, 'slice'),
  i('brie', 'cheese', [320, 20, 0.5, 27, 0.5, 18, 1.6, 0], 25, 'slice'),
  i('cheddar', 'cheese', [410, 25, 1, 34, 0.5, 21, 1.8, 0], 20, 'slice'),
  i('creamCheese', 'cheese', [230, 6, 3.5, 21, 3, 14, 0.8, 0], 20, 'spoon'),
  i('feta', 'cheese', [260, 16, 1, 21, 1, 14, 2.7, 0], 20, 'portion'),
  // raw vegetables
  i('lettuce', 'veg', [15, 1.3, 1.5, 0.2, 1, 0, 0.02, 1.3], 10, 'portion'),
  i('tomato', 'veg', [18, 0.9, 2.8, 0.2, 2.6, 0, 0.01, 1.2], 40, 'portion'),
  i('cucumber', 'veg', [13, 0.6, 2, 0.1, 1.7, 0, 0.01, 0.6], 25, 'portion'),
  i('carrot', 'veg', [36, 0.8, 6.6, 0.3, 5.5, 0, 0.06, 2.6], 25, 'portion'),
  i('onion', 'veg', [40, 1.2, 7.5, 0.2, 5, 0, 0.01, 1.7], 10, 'portion'),
  i('pickles', 'veg', [15, 0.7, 2, 0.1, 1, 0, 2, 1], 15, 'portion'),
  i('avocado', 'veg', [205, 1.6, 1.9, 20.6, 0.4, 3, 0.02, 3.6], 40, 'portion'),
  i('peppers', 'veg', [30, 1, 5, 0.3, 4.5, 0, 0.3, 1.5], 25, 'portion'),
  i('potato', 'veg', [80, 2, 17, 0.1, 0.7, 0, 0.02, 1.8], 60, 'portion'),
  // sauces, butter
  i('butter', 'sauce', [745, 0.7, 0.6, 82, 0.6, 55, 0.04, 0], 10, 'portion'),
  i('mayo', 'sauce', [690, 1.3, 1.5, 76, 1, 6, 1.2, 0], 15, 'spoon'),
  i('mustard', 'sauce', [150, 7, 4, 11, 2, 0.7, 6, 3], 5, 'spoon'),
  i('ketchup', 'sauce', [110, 1.3, 25, 0.1, 22, 0, 1.8, 0.5], 15, 'spoon'),
  i('whiteSauce', 'sauce', [300, 1.5, 6, 30, 4, 3, 1.5, 0], 20, 'spoon'),
  i('spicySauce', 'sauce', [450, 1.2, 14, 43, 10, 3.5, 2.2, 0.5], 20, 'spoon'),
  i('pesto', 'sauce', [450, 5, 5, 45, 2, 6, 2.5, 2], 15, 'spoon'),
  i('hummus', 'sauce', [280, 7.5, 12, 22, 0.5, 2.2, 1.1, 5], 30, 'spoon'),
  i('oliveOil', 'sauce', [900, 0, 0, 100, 0, 15, 0, 0], 5, 'spoon'),
];

export const GROUPS: Group[] = ['meat', 'cheese', 'veg', 'sauce'];

/** what goes into a sandwich: portions of each ingredient */
export type Filling = Record<string, number>;

/** the classics, to start from (each one can then be changed) */
export const PRESETS: { key: string; bread: string; size: string; filling: Filling }[] = [
  { key: 'hamButter', bread: 'baguette', size: 'half', filling: { ham: 2, butter: 1 } },
  { key: 'hamCheese', bread: 'baguette', size: 'half', filling: { ham: 2, emmental: 2, butter: 1 } },
  { key: 'raclette', bread: 'baguette', size: 'half', filling: { raclette: 2, rawHam: 2, potato: 1 } },
  { key: 'chicken', bread: 'baguette', size: 'half', filling: { chicken: 1, lettuce: 1, tomato: 1, mayo: 1 } },
  { key: 'tuna', bread: 'baguette', size: 'half', filling: { tuna: 1, mayo: 1, egg: 1, lettuce: 1, tomato: 1 } },
  { key: 'club', bread: 'sliced', size: 's3', filling: { chicken: 1, bacon: 2, egg: 1, lettuce: 1, tomato: 1, mayo: 1 } },
  { key: 'mozza', bread: 'ciabatta', size: 'one', filling: { mozzarella: 2, tomato: 1, pesto: 1 } },
  { key: 'salmon', bread: 'bagel', size: 'one', filling: { salmon: 2, creamCheese: 1, cucumber: 1 } },
  { key: 'falafel', bread: 'pita', size: 'one', filling: { falafel: 4, hummus: 1, lettuce: 1, tomato: 1, whiteSauce: 1 } },
];

/** the most portions of one ingredient */
export const MAX_PORTIONS = 8;

export function bread(key: string): Bread {
  return BREADS.find((b) => b.key === key) ?? BREADS[0];
}

export function ingredient(key: string): Ingredient | undefined {
  return INGREDIENTS.find((x) => x.key === key);
}

function add(t: Totals, per100: Per100, grams: number): void {
  const f = grams / 100;
  t.kcal += per100[0] * f;
  t.proteinG += per100[1] * f;
  t.carbsG += per100[2] * f;
  t.fatG += per100[3] * f;
  t.sugarsG += per100[4] * f;
  t.satFatG += per100[5] * f;
  t.saltG += per100[6] * f;
  t.fiberG += per100[7] * f;
  t.grams += grams;
}

const ZERO = (): Totals => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, sugarsG: 0, satFatG: 0, saltG: 0, fiberG: 0, grams: 0 });

/** what a portion count of an ingredient is worth */
export function portionKcal(x: Ingredient, n = 1): number {
  return Math.round((x.per100[0] * x.grams * n) / 100);
}

export function breadGrams(b: Bread, size: string): number {
  return (b.sizes.find((s) => s.key === size) ?? b.sizes.find((s) => s.key === b.usual) ?? b.sizes[0]).grams;
}

/** the whole sandwich (the share eaten applied), rounded as a meal line keeps it */
export function totals(breadKey: string, size: string, filling: Filling, others: OtherFood[] = [], share = 1): Totals {
  const t = ZERO();
  const b = bread(breadKey);
  add(t, b.per100, breadGrams(b, size));
  for (const [key, n] of Object.entries(filling)) {
    const x = ingredient(key);
    if (x && n > 0) add(t, x.per100, x.grams * Math.min(MAX_PORTIONS, n));
  }
  for (const o of others) {
    const p = o.per100;
    add(t, [p.kcal ?? 0, p.proteinG ?? 0, p.carbsG ?? 0, p.fatG ?? 0, p.sugarsG ?? 0, p.satFatG ?? 0, p.saltG ?? 0, p.fiberG ?? 0], o.grams);
  }
  const r = (v: number, d = 1) => Math.round(v * share * 10 ** d) / 10 ** d;
  return {
    kcal: Math.round(t.kcal * share),
    proteinG: r(t.proteinG),
    carbsG: r(t.carbsG),
    fatG: r(t.fatG),
    sugarsG: r(t.sugarsG),
    satFatG: r(t.satFatG),
    saltG: r(t.saltG, 2),
    fiberG: r(t.fiberG),
    grams: Math.round(t.grams * share),
  };
}

/** the sandwich's health score (/10, by halves): its values per 100 g, its vegetables, its bread made in a factory or not */
export function sandwichHealth(breadKey: string, size: string, filling: Filling, others: OtherFood[] = []): number | null {
  const t = totals(breadKey, size, filling, others);
  if (!t.grams) return null;
  const f = 100 / t.grams;
  let veg = 0;
  for (const [key, n] of Object.entries(filling)) {
    const x = ingredient(key);
    if (x?.group === 'veg' && x.key !== 'potato' && n > 0) veg += x.grams * Math.min(MAX_PORTIONS, n);
  }
  return (
    healthScore({
      kcal: t.kcal * f,
      proteinG: t.proteinG * f,
      carbsG: t.carbsG * f,
      sugarsG: t.sugarsG * f,
      fatG: t.fatG * f,
      satFatG: t.satFatG * f,
      saltG: t.saltG * f,
      fiberG: t.fiberG * f,
      nova: bread(breadKey).industrial ? 4 : 3,
      fruitVeg: Math.round((veg / t.grams) * 100),
    })?.score ?? null
  );
}
