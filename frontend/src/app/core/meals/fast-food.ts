import { Grade, averageGrade, nutriscore } from './nutriscore';
import { averageHealth, healthScore } from './health';

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
  /** the size of a format against the dish's reference one (M tacos, a whole pizza): what a choice is scaled by */
  scale?: number;
  /** 1.16: an extra offered with these formats only (the soy sauces of a poke bowl) */
  only?: string[];
  /** 1.17: an extra that can be taken more than once (soy sauce, by the spoon): the most */
  max?: number;
}

/**
 * A choice that changes the dish itself: the cheese sauce of a French tacos (with or without), the base of a pizza
 * (tomato or cream). Each option is what it adds to the reference format (negative: what it takes away), scaled
 * to the format chosen; the first option is the one the formats already count.
 */
export interface DishChoice {
  key: string;
  options: Portion[];
  usual: string;
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
  choice?: DishChoice;
  /** a dish one may not finish (a kebab, a burger): the share eaten is asked; pizzas have their slices */
  share?: boolean;
  /**
   * 1.16: counted piece by piece (sushi: 9 or 14 as well as 6, 12, 18): the pieces of each format, which become shortcuts,
   * and the most that can be entered; a piece is worth the first format's share
   */
  pieces?: { of: Record<string, number>; max: number };
  /**
   * 1.17: the kinds of a dish counted piece by piece (sushi: a sashimi is about 30 kcal, a nigiri or a california about
   * 60), each option being one piece; the first one (« assortiment ») is the formats' own average
   */
  kinds?: { usual: string; options: Portion[] };
}

/** the share of a dish eaten, all of it by default */
export const SHARES: { key: string; part: number }[] = [
  { key: 'all', part: 1 },
  { key: 'threeQuarters', part: 0.75 },
  { key: 'half', part: 0.5 },
  { key: 'quarter', part: 0.25 },
];

/** a portion for a share of it (« la moitié »): every value, the Nutri-Score unchanged (the same food) */
export function part(x: Portion, share: number): Portion {
  if (share === 1) return x;
  const k = (v?: number) => (v == null ? v : Math.round(v * share * 10) / 10);
  return {
    ...x,
    kcal: Math.round(x.kcal * share),
    proteinG: k(x.proteinG)!,
    carbsG: k(x.carbsG)!,
    fatG: k(x.fatG)!,
    grams: k(x.grams),
    sugarsG: k(x.sugarsG),
    satFatG: k(x.satFatG),
    saltG: k(x.saltG),
    fiberG: k(x.fiberG),
  };
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
/** the sauces of a French tacos, a 25 g portion each (harissa: a spoon) */
const TACOS_SAUCES = [
  p('algerienne', 110, 0.3, 4, 10.5, [25, 3, 0.9, 0.5, 0.1]),
  p('samourai', 115, 0.3, 3, 11, [25, 2, 1, 0.6, 0.2]),
  p('blanche', 75, 0.5, 2.5, 7, [25, 1.5, 0.8, 0.4, 0]),
  p('biggy', 105, 0.3, 4, 10, [25, 3, 0.9, 0.5, 0]),
  p('bbq', 40, 0.3, 9, 0.1, [25, 8, 0, 0.5, 0.2]),
  p('harissa', 15, 0.5, 2, 0.6, [15, 1, 0.1, 0.6, 0.6]),
];
const sized = (x: Portion, scale: number): Portion => ({ ...x, scale });
/**
 * 1.16: a tablespoon of soy sauce (15 ml, about what a ramekin leaves on the sushi): salty, 17 g of Ciqual's 40 kcal and
 * 13.1 g of salt per 100 g; sweet, 19 g of its 171 kcal, 39.5 g of sugars and 6.9 g of salt per 100 g
 */
const SOY = { ...p('soy', 7, 1.2, 0.3, 0, [17, 0, 0, 2.2, 0.2]), max: 3 };
const SOY_SWEET = { ...p('soySweet', 32, 0.5, 7.5, 0, [19, 7.5, 0, 1.3, 0]), max: 3 };
/** a sauce to dip the breaded chicken in, 25 g */
const DIP = p('dip', 50, 0, 8, 2, [25, 6, 0.3, 0.5, 0]);
const CHEESE = p('cheese', 80, 5, 0, 7, [20, 0, 4.5, 0.4, 0]);
/**
 * 1.18: the chili oil of the pizzerias, by the teaspoon (5 ml, 4.5 g of olive oil with chilli in it), up to 3; and a hot
 * sauce (sriracha, piri-piri, Tabasco-like), a tablespoon of 15 g
 */
const CHILI_OIL = { ...p('chiliOil', 40, 0, 0, 4.5, [4.5, 0, 0.7, 0, 0]), max: 3 };
const CHILI_SAUCE = p('chiliSauce', 15, 0.3, 3, 0.2, [15, 2.5, 0, 0.6, 0.3]);

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
    share: true,
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
    share: true,
  },
  {
    key: 'pizza',
    emoji: '🍕',
    formats: [
      sized(p('slices', 260, 11, 29, 11, [105, 3, 4.5, 1.4, 2]), 0.25),
      sized(p('half', 520, 23, 58, 21, [210, 6, 9, 2.8, 4.5]), 0.5),
      sized(p('whole', 1040, 45, 115, 42, [420, 12, 18, 5.5, 9]), 1),
      sized(p('wholeLoaded', 1250, 55, 115, 60, [480, 13, 26, 6.8, 9]), 1),
    ],
    usual: 'whole',
    fries: false,
    // 1.18: what is put on it at the table
    extras: [CHILI_OIL, CHILI_SAUCE, CHEESE],
    // the base of a whole pizza: tomato (the formats), or cream: about 70 g of crème fraîche instead of 80 g of sauce
    choice: { key: 'base', usual: 'tomato', options: [p('tomato', 0, 0, 0, 0, [0, 0, 0, 0, 0]), p('cream', 175, 0.5, -3, 20.5, [-10, -2, 14, -0.5, -1])] },
  },
  {
    key: 'tacos',
    emoji: '🌮',
    formats: [
      sized(p('m', 950, 42, 90, 45, [450, 6, 18, 4.5, 5]), 1),
      sized(p('l', 1350, 60, 115, 68, [650, 8, 27, 6.5, 7]), 1.5),
      sized(p('xl', 1800, 80, 145, 95, [850, 10, 36, 8.5, 9]), 2),
    ],
    usual: 'm',
    fries: false,
    extras: [...TACOS_SAUCES, CHEESE],
    share: true,
    // the cheese sauce inside (counted by the formats): about 100 g in an M, 180 kcal
    choice: { key: 'cheeseSauce', usual: 'with', options: [p('with', 0, 0, 0, 0, [0, 0, 0, 0, 0]), p('without', -180, -5, -8, -14, [-100, -3, -8, -1, 0])] },
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
    // 1.17: by the piece too
    pieces: { of: { n4: 4, n6: 6, n9: 9, n20: 20 }, max: 40 },
    extras: [DIP],
  },
  {
    // 1.17: breaded chicken fillets, about 45 g each
    key: 'tenders',
    emoji: '🍤',
    formats: [
      p('t3', 345, 27, 21, 16.5, [135, 0.9, 3, 1.8, 1.2]),
      p('t5', 575, 45, 35, 27.5, [225, 1.5, 5, 3, 2]),
      p('t8', 920, 72, 56, 44, [360, 2.4, 8, 4.8, 3.2]),
    ],
    usual: 't3',
    fries: true,
    pieces: { of: { t3: 3, t5: 5, t8: 8 }, max: 20 },
    extras: [DIP],
  },
  {
    // 1.17: spicy breaded wings, about 30 g eaten each
    key: 'wings',
    emoji: '🌶️',
    formats: [
      p('w4', 340, 24, 12, 22, [120, 0.4, 6, 2, 0.8]),
      p('w8', 680, 48, 24, 44, [240, 0.8, 12, 4, 1.6]),
      p('w12', 1020, 72, 36, 66, [360, 1.2, 18, 6, 2.4]),
    ],
    usual: 'w4',
    fries: true,
    pieces: { of: { w4: 4, w8: 8, w12: 12 }, max: 30 },
    extras: [DIP],
  },
  {
    // 1.17: fried chicken on the bone (drumsticks, thighs), about 70 g eaten a piece
    key: 'friedChicken',
    emoji: '🐔',
    formats: [
      p('c2', 400, 34, 12, 24, [140, 0.4, 6, 2, 0.6]),
      p('c3', 600, 51, 18, 36, [210, 0.6, 9, 3, 0.9]),
      p('c6', 1200, 102, 36, 72, [420, 1.2, 18, 6, 1.8]),
    ],
    usual: 'c2',
    fries: true,
    pieces: { of: { c2: 2, c3: 3, c6: 6 }, max: 16 },
    extras: [DIP],
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
    pieces: { of: { p6: 6, p12: 12, p18: 18 }, max: 60 },
    // 1.17: one piece of each kind (an assortment: the formats' average, about 42 kcal)
    kinds: {
      usual: 'mix',
      options: [
        p('mix', 42, 1.5, 7.5, 0.5, [25, 1, 0.1, 0.25, 0.2]),
        p('maki', 37, 1.6, 6.5, 0.5, [25, 1, 0.1, 0.22, 0.2]),
        p('california', 60, 1.6, 8.5, 2.2, [32, 1.3, 0.35, 0.3, 0.5]),
        p('nigiri', 58, 3, 9.5, 1, [35, 1.4, 0.2, 0.3, 0.2]),
        p('sashimi', 32, 3.8, 0, 1.9, [18, 0, 0.4, 0.05, 0]),
        p('spring', 58, 2.2, 6.5, 2.6, [35, 0.8, 0.7, 0.25, 0.6]),
        p('crispy', 70, 1.8, 9, 3, [32, 1.2, 0.5, 0.3, 0.3]),
      ],
    },
    extras: [SOY, SOY_SWEET, p('miso', 40, 3, 4, 1, [200, 1, 0.2, 2, 0.5]), p('edamame', 120, 11, 9, 5, [100, 2, 0.7, 0.6, 5])],
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
    share: true,
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
    extras: [
      { ...SOY, only: ['poke'] },
      { ...SOY_SWEET, only: ['poke'] },
    ],
    share: true,
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

/** the format with what the choice adds or takes away, scaled to its size (« sans sauce fromagère » on an XL: twice an M's) */
export function withChoice(format: Portion, option?: Portion): Portion {
  if (!option || !option.kcal) return format;
  const k = format.scale ?? 1;
  const add = (a?: number, b?: number) => (a == null || b == null ? a : Math.max(0, Math.round((a + b * k) * 10) / 10));
  return {
    ...format,
    kcal: Math.max(0, Math.round(format.kcal + option.kcal * k)),
    proteinG: add(format.proteinG, option.proteinG)!,
    carbsG: add(format.carbsG, option.carbsG)!,
    fatG: add(format.fatG, option.fatG)!,
    grams: add(format.grams, option.grams),
    sugarsG: add(format.sugarsG, option.sugarsG),
    satFatG: add(format.satFatG, option.satFatG),
    saltG: add(format.saltG, option.saltG),
    fiberG: add(format.fiberG, option.fiberG),
  };
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

/** the chains' dishes, ultra-processed (buns, sauces, nuggets…); a restaurant's pizza, sushi or salad is only processed */
const ULTRA = new Set(['burger', 'kebab', 'tacos', 'fries', 'nuggets', 'tenders', 'wings', 'friedChicken']);
const FRIED = new Set(['fries', 'nuggets', 'tenders', 'wings', 'friedChicken']);
/** drinks: ultra-processed sodas, with sweeteners, made of fruit */
const DRINK_ULTRA = new Set(['cola', 'colaZero', 'soda50', 'iceTea', 'milkshake']);

/**
 * 1.13: the health score of a portion (per 100 g of it; a drink per 100 ml), or null (alcohol, nothing, unknown nutrients).
 * The dish says how processed it is and whether it is fried
 */
export function healthOf(x: Portion, kind: 'main' | 'fries' | 'extra' | 'drink', dish?: string): number | null {
  if (!x.grams || x.key === 'none') return null;
  const f = 100 / x.grams;
  if (kind === 'drink') {
    if (x.grade === null) return null;
    if (x.key === 'water') return 10;
    return (
      healthScore({
        kcal: x.kcal * f,
        proteinG: x.proteinG * f,
        sugarsG: (x.sugarsG ?? 0) * f,
        fatG: x.fatG * f,
        satFatG: x.fatG * 0.6 * f,
        saltG: 0,
        drink: true,
        nova: DRINK_ULTRA.has(x.key) ? 4 : 1,
        sweeteners: x.key === 'colaZero',
        fruitVeg: x.key === 'orangeJuice' ? 100 : 0,
      })?.score ?? null
    );
  }
  if (x.sugarsG == null || x.satFatG == null || x.saltG == null) return null;
  const fried = kind === 'fries' || (kind === 'main' && FRIED.has(dish ?? ''));
  return (
    healthScore({
      kcal: x.kcal * f,
      proteinG: x.proteinG * f,
      carbsG: x.carbsG * f,
      sugarsG: x.sugarsG * f,
      fatG: x.fatG * f,
      satFatG: x.satFatG * f,
      saltG: x.saltG * f,
      fiberG: x.fiberG == null ? null : x.fiberG * f,
      nova: kind === 'fries' || (kind === 'main' && ULTRA.has(dish ?? '')) ? 4 : 3,
      fried,
    })?.score ?? null
  );
}

/** 1.16: the extras offered with a format (the soy sauces with a poke bowl only) */
export function extrasFor(d: Dish, format: string): Portion[] {
  return d.extras.filter((x) => !x.only || x.only.includes(format));
}

/**
 * 1.16: n pieces of a dish counted piece by piece, each worth the first format's share (null: not such a dish); 1.17: of a
 * kind (sushi: sashimi, nigiri…), each worth that kind's piece; the first kind is the formats' own average
 */
export function pieces(d: Dish, n: number, kind?: string): Portion | null {
  if (!d.pieces) return null;
  const count = Math.max(1, Math.min(d.pieces.max, Math.round(n)));
  const k = d.kinds?.options.find((o) => o.key === kind);
  if (k && k.key !== d.kinds!.options[0].key) return { ...part(k, count), key: 'pieces' };
  const ref = d.formats[0];
  return { ...part(ref, count / d.pieces.of[ref.key]), key: 'pieces' };
}

/** 1.17: how many times an extra was taken (soy sauce by the spoon), at most its max */
export function timesOf(x: Portion, extras: string[]): number {
  return Math.min(x.max ?? 1, extras.filter((k) => k === x.key).length);
}

/** what is added, line by line, the total and the meal's grade (weighted by calories) */
export function estimate(
  d: Dish,
  format: string,
  fries: string,
  extras: string[],
  drinkKey: string,
  choice?: string,
  /** the share of the dish eaten (1: all of it) */
  share = 1,
  /** 1.16: the pieces, for a dish counted piece by piece (sushi) */
  count?: number,
  /** 1.17: the kind of piece (sushi) */
  kind?: string,
): { lines: { kind: string; portion: Portion; grade: Grade | null; health: number | null }[]; total: Portion; grade: Grade | null; health: number | null } {
  const picked: { kind: string; portion: Portion }[] = [];
  const main = d.formats.find((f) => f.key === format) ?? d.formats[0];
  const counted = count == null ? null : pieces(d, count, kind);
  picked.push({
    kind: 'main',
    portion: counted ?? part(withChoice(main, d.choice?.options.find((o) => o.key === (choice ?? d.choice?.usual))), d.share ? share : 1),
  });
  const side = FRIES.find((f) => f.key === fries);
  if (d.fries && side && side.key !== 'none') picked.push({ kind: 'fries', portion: side });
  for (const e of extrasFor(d, main.key)) {
    const n = timesOf(e, extras);
    if (n > 0) picked.push({ kind: 'extra', portion: n > 1 ? { ...part(e, n), key: e.key } : e });
  }
  const dr = DRINKS.find((x) => x.key === drinkKey);
  if (dr && dr.key !== 'none') picked.push({ kind: 'drink', portion: dr });
  const lines = picked.map((l) => ({
    ...l,
    grade: gradeOf(l.portion),
    health: healthOf(l.portion, l.kind as 'main' | 'fries' | 'extra' | 'drink', d.key),
  }));
  const total = lines.reduce(
    (t, l) => ({ ...t, kcal: t.kcal + l.portion.kcal, proteinG: t.proteinG + l.portion.proteinG, carbsG: t.carbsG + l.portion.carbsG, fatG: t.fatG + l.portion.fatG }),
    p('total', 0, 0, 0, 0),
  );
  return {
    lines,
    total,
    grade: averageGrade(lines.map((l) => ({ grade: l.grade, kcal: l.portion.kcal }))),
    health: averageHealth(lines.map((l) => ({ health: l.health, kcal: l.portion.kcal }))),
  };
}
