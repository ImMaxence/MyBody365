import { Grade, drinkScore } from './nutriscore';

/**
 * Everyday drinks by estimate: a coffee, a tea, an infusion, a matcha, a hot chocolate, with the milk (which one
 * and how much), the sugar and the extras (syrup, whipped cream, honey…). Values from the Ciqual table, rounded:
 * per cup, then graded on the beverages' Nutri-Score scale per 100 ml of the whole drink.
 */
export interface Part {
  key: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  sugarsG: number;
  fatG: number;
  satFatG: number;
  saltG: number;
  fiberG: number;
  /** ml (or g) it adds to the cup */
  ml: number;
}

export interface Format extends Part {
  /** milk already in it (a latte, a hot chocolate), in ml */
  milkMl: number;
  /** its name says the drink (« Cappuccino »); else the drink's name comes first (« Thé, un mug ») */
  named?: boolean;
}

export interface HotDrink {
  key: string;
  emoji: string;
  formats: Format[];
  usual: string;
  /** a dash of milk can be asked (tea, coffee without milk) */
  dash: boolean;
  extras: Part[];
}

export type MilkKind = 'whole' | 'semi' | 'skim' | 'oat' | 'soy' | 'almond';

const part = (key: string, ml: number, kcal: number, proteinG = 0, carbsG = 0, sugarsG = 0, fatG = 0, satFatG = 0, fiberG = 0, saltG = 0): Part => ({
  key,
  ml,
  kcal,
  proteinG,
  carbsG,
  sugarsG,
  fatG,
  satFatG,
  fiberG,
  saltG,
});
const format = (p: Part, milkMl = 0, named = false): Format => ({ ...p, milkMl, named });

/** per 100 ml */
export const MILKS: Record<MilkKind, Part> = {
  whole: part('whole', 100, 65, 3.3, 4.7, 4.7, 3.6, 2.3, 0, 0.11),
  semi: part('semi', 100, 46, 3.3, 4.8, 4.8, 1.6, 1.0, 0, 0.11),
  skim: part('skim', 100, 34, 3.4, 4.9, 4.9, 0.1, 0.07, 0, 0.11),
  oat: part('oat', 100, 46, 0.7, 6.7, 4.0, 1.5, 0.2, 0.8, 0.1),
  soy: part('soy', 100, 39, 3.0, 2.5, 2.3, 1.8, 0.3, 0.5, 0.1),
  almond: part('almond', 100, 24, 0.5, 3.0, 2.8, 1.2, 0.1, 0.3, 0.13),
};
export const MILK_KINDS = Object.keys(MILKS) as MilkKind[];

/** a sugar lump (5 g) */
export const SUGAR = part('sugar', 0, 20, 0, 5, 5);
export const DASH_ML = 20;

const SYRUP = part('syrup', 10, 33, 0, 8.2, 8.2);
const WHIPPED = part('whipped', 15, 45, 0.4, 1.8, 1.8, 4, 2.6, 0, 0.02);
const HONEY = part('honey', 5, 23, 0, 5.7, 5.7);
const MOCHA = part('mocha', 15, 50, 0.4, 10, 9, 1, 0.6, 0.5, 0.02);

const ESPRESSO = part('espresso', 30, 1, 0.1);
/** sweetened cocoa powder, 15 g and 25 g */
const COCOA = (key: string, g: number) => part(key, 0, 3.89 * g, 0.049 * g, 0.82 * g, 0.75 * g, 0.034 * g, 0.021 * g, 0.064 * g, 0.001 * g);

export const HOT_DRINKS: HotDrink[] = [
  {
    key: 'coffee',
    emoji: '☕',
    usual: 'espresso',
    dash: true,
    formats: [
      format(ESPRESSO, 0, true),
      format(part('long', 120, 2, 0.2), 0, true),
      format(part('filter', 250, 5, 0.3), 0, true),
      format({ ...ESPRESSO, key: 'noisette' }, 15, true),
      format({ ...ESPRESSO, key: 'cappuccino' }, 120, true),
      format({ ...ESPRESSO, key: 'latte' }, 220, true),
    ],
    extras: [MOCHA, SYRUP, WHIPPED],
  },
  {
    key: 'tea',
    emoji: '🫖',
    usual: 'cup',
    dash: true,
    formats: [format(part('cup', 250, 2)), format(part('mug', 350, 3)), format(part('chai', 50, 4, 0.1, 0.7), 200, true)],
    extras: [HONEY, SYRUP],
  },
  {
    key: 'infusion',
    emoji: '🌿',
    usual: 'cup',
    dash: false,
    formats: [format(part('cup', 250, 2)), format(part('mug', 350, 3))],
    extras: [HONEY],
  },
  {
    key: 'matcha',
    emoji: '🍵',
    usual: 'latte',
    dash: false,
    formats: [format(part('latte', 30, 6, 0.6, 0.8, 0, 0.1, 0, 0.8), 220, true), format(part('water', 200, 6, 0.6, 0.8, 0, 0.1, 0, 0.8), 0, true)],
    extras: [SYRUP, HONEY],
  },
  {
    key: 'chocolate',
    emoji: '🍫',
    usual: 'cup',
    dash: false,
    formats: [format(COCOA('cup', 15), 200), format(COCOA('mug', 25), 300)],
    extras: [WHIPPED],
  },
];

export function hotDrink(key: string): HotDrink | undefined {
  return HOT_DRINKS.find((d) => d.key === key);
}

export interface DrinkChoice {
  format: string;
  milk: MilkKind;
  /** a dash of milk in a drink without any */
  dash: boolean;
  sugars: number;
  extras: string[];
}

/** the whole cup: its values, its volume and its grade (beverages' scale, per 100 ml) */
export function drinkTotal(d: HotDrink, c: DrinkChoice): Part & { milkMl: number; grade: Grade } {
  const f = d.formats.find((x) => x.key === c.format) ?? d.formats[0];
  const milkMl = f.milkMl + (c.dash && d.dash && !f.milkMl ? DASH_ML : 0);
  const milk = MILKS[c.milk];
  const parts: [Part, number][] = [
    [f, 1],
    [milk, milkMl / 100],
    [SUGAR, c.sugars],
    ...d.extras.filter((x) => c.extras.includes(x.key)).map((x) => [x, 1] as [Part, number]),
  ];
  const sum = (k: keyof Omit<Part, 'key'>) => parts.reduce((t, [p, n]) => t + p[k] * n, 0);
  const total = {
    key: d.key,
    ml: f.ml + milkMl + d.extras.filter((x) => c.extras.includes(x.key)).reduce((t, x) => t + x.ml, 0),
    kcal: sum('kcal'),
    proteinG: sum('proteinG'),
    carbsG: sum('carbsG'),
    sugarsG: sum('sugarsG'),
    fatG: sum('fatG'),
    satFatG: sum('satFatG'),
    saltG: sum('saltG'),
    fiberG: sum('fiberG'),
    milkMl,
  };
  const per = 100 / Math.max(total.ml, 1);
  const grade = drinkScore({
    kcal: total.kcal * per,
    sugarsG: total.sugarsG * per,
    satFatG: total.satFatG * per,
    saltG: total.saltG * per,
    fiberG: total.fiberG * per,
    proteinG: total.proteinG * per,
  });
  return { ...total, grade };
}
