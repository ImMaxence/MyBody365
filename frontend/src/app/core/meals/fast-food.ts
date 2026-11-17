/**
 * Fast food and restaurant meals by estimate: usual portions served in France, with their calories and
 * macros (rounded averages of chains' published values and of Ciqual's dishes). Real portions vary by
 * about ±20 %: the app says so. The drinks use their labels' values per can or glass.
 */
export interface Portion {
  key: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
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

const p = (key: string, kcal: number, proteinG: number, carbsG: number, fatG: number): Portion => ({ key, kcal, proteinG, carbsG, fatG });

const SAUCE = p('sauce', 100, 0, 3, 10);

export const DISHES: Dish[] = [
  {
    key: 'burger',
    emoji: '🍔',
    formats: [p('small', 300, 15, 32, 13), p('classic', 540, 25, 45, 28), p('double', 850, 45, 50, 50), p('restaurant', 950, 48, 60, 55)],
    usual: 'classic',
    fries: true,
    extras: [SAUCE],
  },
  {
    key: 'kebab',
    emoji: '🥙',
    formats: [p('sandwich', 700, 35, 68, 32), p('wrap', 780, 38, 75, 36), p('plate', 650, 45, 20, 42)],
    usual: 'sandwich',
    fries: true,
    extras: [SAUCE, p('cheese', 80, 5, 0, 7)],
  },
  {
    key: 'pizza',
    emoji: '🍕',
    formats: [p('slices', 540, 24, 60, 22), p('half', 520, 23, 58, 21), p('whole', 1040, 45, 115, 42), p('wholeLoaded', 1250, 55, 115, 60)],
    usual: 'whole',
    fries: false,
    extras: [],
  },
  {
    key: 'tacos',
    emoji: '🌮',
    formats: [p('m', 950, 42, 90, 45), p('l', 1350, 60, 115, 68), p('xl', 1800, 80, 145, 95)],
    usual: 'm',
    fries: false,
    extras: [SAUCE, p('cheese', 80, 5, 0, 7)],
  },
  {
    key: 'fries',
    emoji: '🍟',
    formats: [p('small', 230, 3, 29, 11), p('medium', 340, 4, 43, 16), p('large', 440, 5, 56, 21)],
    usual: 'medium',
    fries: false,
    extras: [SAUCE],
  },
  {
    key: 'nuggets',
    emoji: '🍗',
    formats: [p('n4', 170, 10, 11, 10), p('n6', 260, 15, 16, 15), p('n9', 390, 22, 24, 22), p('n20', 860, 49, 53, 50)],
    usual: 'n6',
    fries: true,
    extras: [p('dip', 50, 0, 8, 2)],
  },
  {
    key: 'sushi',
    emoji: '🍣',
    formats: [p('p6', 250, 9, 45, 3), p('p12', 500, 18, 90, 6), p('p18', 750, 27, 135, 9)],
    usual: 'p12',
    fries: false,
    extras: [p('miso', 40, 3, 4, 1), p('edamame', 120, 11, 9, 5)],
  },
  {
    key: 'sandwich',
    emoji: '🥪',
    formats: [p('ham', 450, 20, 50, 18), p('chicken', 520, 26, 55, 20), p('tuna', 560, 22, 52, 28), p('panini', 600, 27, 60, 27)],
    usual: 'ham',
    fries: false,
    extras: [p('crisps', 160, 2, 15, 10)],
  },
  {
    key: 'salad',
    emoji: '🥗',
    formats: [p('caesar', 550, 30, 25, 37), p('mixed', 420, 18, 30, 25), p('poke', 600, 28, 75, 20)],
    usual: 'mixed',
    fries: false,
    extras: [],
  },
];

/** fries on the side: none or a size */
export const FRIES: Portion[] = [p('none', 0, 0, 0, 0), ...DISHES.find((d) => d.key === 'fries')!.formats];

/** a drink with it (per can or glass) */
export const DRINKS: Portion[] = [
  p('none', 0, 0, 0, 0),
  p('water', 0, 0, 0, 0),
  p('cola', 139, 0, 35, 0),
  p('colaZero', 1, 0, 0, 0),
  p('soda50', 210, 0, 53, 0),
  p('iceTea', 63, 0, 15, 0),
  p('orangeJuice', 112, 2, 25, 0),
  p('beer', 105, 1, 8, 0),
  p('milkshake', 380, 10, 58, 12),
];

export function dish(key: string): Dish | undefined {
  return DISHES.find((d) => d.key === key);
}

/** what is added, line by line, and the total */
export function estimate(d: Dish, format: string, fries: string, extras: string[], drink: string): { lines: { kind: string; portion: Portion }[]; total: Portion } {
  const lines: { kind: string; portion: Portion }[] = [];
  const main = d.formats.find((f) => f.key === format) ?? d.formats[0];
  lines.push({ kind: 'main', portion: main });
  const side = FRIES.find((f) => f.key === fries);
  if (d.fries && side && side.key !== 'none') lines.push({ kind: 'fries', portion: side });
  for (const e of d.extras.filter((x) => extras.includes(x.key))) lines.push({ kind: 'extra', portion: e });
  const dr = DRINKS.find((x) => x.key === drink);
  if (dr && dr.key !== 'none') lines.push({ kind: 'drink', portion: dr });
  const total = lines.reduce(
    (t, l) => ({ ...t, kcal: t.kcal + l.portion.kcal, proteinG: t.proteinG + l.portion.proteinG, carbsG: t.carbsG + l.portion.carbsG, fatG: t.fatG + l.portion.fatG }),
    p('total', 0, 0, 0, 0),
  );
  return { lines, total };
}
