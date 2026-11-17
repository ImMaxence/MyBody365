import { Grade, averageGrade, nutriscore } from './nutriscore';

/**
 * Fast food and restaurant meals by estimate: usual portions served in France, with their calories, macros
 * and what the Nutri-Score needs (weight, sugars, saturated fat, salt, fibre) — rounded averages of chains'
 * published values and of Ciqual's dishes. Real portions vary by about ±20 %: the app says so. Drinks use
 * their labels' values per can or glass and the beverages' own Nutri-Score scale.
 */
export interface Portion {
  key: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** grams (ml for a drink) and the rest, for the portion */
  grams?: number;
  sugarsG?: number;
  satFatG?: number;
  saltG?: number;
  fiberG?: number;
  /** set for drinks (their own scale): null when not graded (alcohol, nothing) */
  grade?: Grade | null;
}

export interface Dish {
  key: string;
  emoji: string;
  formats: Portion[];
  /** the format chosen at first */
  usual: string;
  /** asked: fries with it? */
  fries: boolean;
  /** extras that can be ticked (sauce, cheese, miso soup…) */
  extras: Portion[];
}

/** [grams, sugars, saturated fat, salt, fibre] of a portion */
type Comp = [number, number, number, number, number];

const p = (key: string, kcal: number, proteinG: number, carbsG: number, fatG: number, c?: Comp): Portion => ({
  key,
  kcal,
  proteinG,
  carbsG,
  fatG,
  ...(c ? { grams: c[0], sugarsG: c[1], satFatG: c[2], saltG: c[3], fiberG: c[4] } : {}),
});

const drink = (key: string, kcal: number, carbsG: number, ml: number, grade: Grade | null, proteinG = 0, fatG = 0): Portion => ({
  key,
  kcal,
  proteinG,
  carbsG,
  fatG,
  grams: ml,
  sugarsG: carbsG,
  grade,
});

const SAUCE = p('sauce', 100, 0, 3, 10, [25, 2, 1.5, 0.4, 0]);
const CHEESE = p('cheese', 80, 5, 0, 7, [20, 0, 4.5, 0.4, 0]);

export const DISHES: Dish[] = [
  {
    key: 'burger',
    emoji: '🍔',
    formats: [
      p('small', 300, 15, 32, 13, [118, 7, 6, 1.6, 1.5]),
      p('classic', 540, 25, 45, 28, [219, 9, 10, 2.2, 3]),
      p('double', 850, 45, 50, 50, [280, 10, 20, 3.2, 3]),
      p('restaurant', 950, 48, 60, 55, [350, 10, 22, 3.5, 4]),
    ],
    usual: 'classic',
    fries: true,
    extras: [SAUCE],
  },
  {
    key: 'kebab',
    emoji: '🥙',
    formats: [
      p('sandwich', 700, 35, 68, 32, [350, 6, 11, 3.5, 4]),
      p('wrap', 780, 38, 75, 36, [380, 5, 12, 3.8, 4]),
      p('plate', 650, 45, 20, 42, [400, 6, 14, 3.4, 4]),
    ],
    usual: 'sandwich',
    fries: true,
    extras: [SAUCE, CHEESE],
  },
  {
    key: 'pizza',
    emoji: '🍕',
    formats: [
      p('slices', 260, 11, 29, 11, [105, 3, 4.5, 1.4, 2]),
      p('half', 520, 23, 58, 21, [210, 6, 9, 2.8, 4.5]),
      p('whole', 1040, 45, 115, 42, [420, 12, 18, 5.5, 9]),
      p('wholeLoaded', 1250, 55, 115, 60, [480, 13, 26, 6.8, 9]),
    ],
    usual: 'whole',
    fries: false,
    extras: [],
  },
  {
    key: 'tacos',
    emoji: '🌮',
    formats: [
      p('m', 950, 42, 90, 45, [450, 6, 18, 4.5, 5]),
      p('l', 1350, 60, 115, 68, [650, 8, 27, 6.5, 7]),
      p('xl', 1800, 80, 145, 95, [850, 10, 36, 8.5, 9]),
    ],
    usual: 'm',
    fries: false,
    extras: [SAUCE, CHEESE],
  },
  {
    key: 'fries',
    emoji: '🍟',
    formats: [
      p('small', 230, 3, 29, 11, [80, 0.3, 1, 0.5, 3]),
      p('medium', 340, 4, 43, 16, [114, 0.4, 1.5, 0.7, 4]),
      p('large', 440, 5, 56, 21, [150, 0.5, 2, 0.9, 5]),
    ],
    usual: 'medium',
    fries: false,
    extras: [SAUCE],
  },
  {
    key: 'nuggets',
    emoji: '🍗',
    formats: [
      p('n4', 170, 10, 11, 10, [65, 0.3, 1.7, 0.8, 0.5]),
      p('n6', 260, 15, 16, 15, [100, 0.4, 2.6, 1.2, 0.8]),
      p('n9', 390, 22, 24, 22, [150, 0.6, 3.9, 1.8, 1.2]),
      p('n20', 860, 49, 53, 50, [330, 1.3, 8.6, 4, 2.6]),
    ],
    usual: 'n6',
    fries: true,
    extras: [p('dip', 50, 0, 8, 2, [25, 6, 0.3, 0.5, 0])],
  },
  {
    key: 'sushi',
    emoji: '🍣',
    formats: [
      p('p6', 250, 9, 45, 3, [150, 6, 0.7, 1.5, 1]),
      p('p12', 500, 18, 90, 6, [300, 12, 1.4, 3, 2]),
      p('p18', 750, 27, 135, 9, [450, 18, 2.1, 4.5, 3]),
    ],
    usual: 'p12',
    fries: false,
    extras: [p('miso', 40, 3, 4, 1, [200, 1, 0.2, 2, 0.5]), p('edamame', 120, 11, 9, 5, [100, 2, 0.7, 0.6, 5])],
  },
  {
    key: 'sandwich',
    emoji: '🥪',
    formats: [
      p('ham', 450, 20, 50, 18, [210, 3, 9, 2.6, 3]),
      p('chicken', 520, 26, 55, 20, [250, 4, 4, 2.2, 3.5]),
      p('tuna', 560, 22, 52, 28, [250, 3, 4.5, 2.2, 3]),
      p('panini', 600, 27, 60, 27, [220, 3, 12, 2.8, 3]),
    ],
    usual: 'ham',
    fries: false,
    extras: [p('crisps', 160, 2, 15, 10, [30, 0.2, 1, 0.4, 1.2])],
  },
  {
    key: 'salad',
    emoji: '🥗',
    formats: [
      p('caesar', 550, 30, 25, 37, [350, 4, 9, 2.5, 4]),
      p('mixed', 420, 18, 30, 25, [350, 6, 4, 1.8, 5]),
      p('poke', 600, 28, 75, 20, [450, 12, 4, 3, 6]),
    ],
    usual: 'mixed',
    fries: false,
    extras: [],
  },
];

/** fries on the side: none or a size */
export const FRIES: Portion[] = [p('none', 0, 0, 0, 0), ...DISHES.find((d) => d.key === 'fries')!.formats];

/** a drink with it, per can or glass, graded on the beverages' scale (2023): sugar, sweeteners, fruit */
export const DRINKS: Portion[] = [
  drink('none', 0, 0, 0, null),
  drink('water', 0, 0, 250, 'a'),
  drink('cola', 139, 35, 330, 'e'),
  drink('colaZero', 1, 0, 330, 'c'),
  drink('soda50', 210, 53, 500, 'e'),
  drink('iceTea', 63, 15, 330, 'd'),
  drink('orangeJuice', 112, 25, 250, 'c', 2),
  // alcoholic drinks are not graded
  drink('beer', 105, 8, 250, null, 1),
  drink('milkshake', 380, 58, 300, 'e', 10, 12),
];

export function dish(key: string): Dish | undefined {
  return DISHES.find((d) => d.key === key);
}

/** the estimated Nutri-Score of a portion (per 100 g of it), or null when it has none */
export function gradeOf(x: Portion): Grade | null {
  if (x.grade !== undefined) return x.grade;
  if (!x.grams || x.sugarsG == null || x.satFatG == null || x.saltG == null) return null;
  const f = 100 / x.grams;
  return nutriscore({
    kcal: x.kcal * f,
    sugarsG: x.sugarsG * f,
    satFatG: x.satFatG * f,
    saltG: x.saltG * f,
    fiberG: x.fiberG == null ? undefined : x.fiberG * f,
    proteinG: x.proteinG * f,
  });
}

/** what is added, line by line, the total and the meal's grade (weighted by calories) */
export function estimate(
  d: Dish,
  format: string,
  fries: string,
  extras: string[],
  drinkKey: string,
): { lines: { kind: string; portion: Portion; grade: Grade | null }[]; total: Portion; grade: Grade | null } {
  const picked: { kind: string; portion: Portion }[] = [];
  picked.push({ kind: 'main', portion: d.formats.find((f) => f.key === format) ?? d.formats[0] });
  const side = FRIES.find((f) => f.key === fries);
  if (d.fries && side && side.key !== 'none') picked.push({ kind: 'fries', portion: side });
  for (const e of d.extras.filter((x) => extras.includes(x.key))) picked.push({ kind: 'extra', portion: e });
  const dr = DRINKS.find((x) => x.key === drinkKey);
  if (dr && dr.key !== 'none') picked.push({ kind: 'drink', portion: dr });
  const lines = picked.map((l) => ({ ...l, grade: gradeOf(l.portion) }));
  const total = lines.reduce(
    (t, l) => ({ ...t, kcal: t.kcal + l.portion.kcal, proteinG: t.proteinG + l.portion.proteinG, carbsG: t.carbsG + l.portion.carbsG, fatG: t.fatG + l.portion.fatG }),
    p('total', 0, 0, 0, 0),
  );
  return { lines, total, grade: averageGrade(lines.map((l) => ({ grade: l.grade, kcal: l.portion.kcal }))) };
}
