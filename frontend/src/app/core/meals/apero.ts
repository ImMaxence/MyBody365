import { Grade, drinkScore } from './nutriscore';
import { healthScore } from './health';

/**
 * L'apéro (1.9): beers, wines, bubbles, spirits (with or without a mixer), cocktails, ciders and mocktails, by the
 * glass. Values per 100 ml from the Ciqual table (beers, wines, spirits, ciders, sangria, punch, the mixers); the
 * cocktails are the usual bar recipes added up from the same table. The Nutri-Score does not apply to alcoholic drinks
 * (its own rules leave them out): none is given. The mocktails get theirs, on the beverages' scale.
 *
 * Alcohol: 0,789 g per ml of ethanol, a standard drink in France is 10 g of it.
 */
export interface Per100 {
  kcal: number;
  proteinG: number;
  carbsG: number;
  sugarsG: number;
  fatG: number;
  satFatG: number;
  saltG: number;
}

export interface AperoItem {
  key: string;
  per100: Per100;
  /** % of alcohol by volume */
  abv: number;
  /** a cocktail is served as a whole: its own glass, in ml */
  servingMl?: number;
}

export interface AperoSize {
  key: string;
  ml: number;
}

export interface AperoDrink {
  key: string;
  emoji: string;
  items: AperoItem[];
  usual: string;
  /** none: each item is one glass of its own (the cocktails) */
  sizes: AperoSize[];
  usualSize?: string;
  /** a spirit can be lengthened (a rum and coke, a vodka and orange…) */
  mixers?: boolean;
}

const p = (kcal: number, carbsG = 0, sugarsG = 0, proteinG = 0, fatG = 0, satFatG = 0, saltG = 0): Per100 => ({
  kcal,
  proteinG,
  carbsG,
  sugarsG,
  fatG,
  satFatG,
  saltG,
});
const item = (key: string, per100: Per100, abv: number, servingMl?: number): AperoItem => ({ key, per100, abv, servingMl });

/** what lengthens a spirit, per 100 ml (Ciqual), and how much of it goes into the glass */
export const MIXERS: { key: string; ml: number; per100: Per100 }[] = [
  { key: 'none', ml: 0, per100: p(0) },
  { key: 'cola', ml: 150, per100: p(40, 10, 10) },
  { key: 'colaZero', ml: 150, per100: p(1, 0.25, 0.04) },
  { key: 'tonic', ml: 150, per100: p(33, 8.2, 8.2) },
  { key: 'orange', ml: 150, per100: p(45, 9.6, 9.6, 0.6, 0.1, 0.05) },
  { key: 'energy', ml: 150, per100: p(46, 11, 11) },
  { key: 'water', ml: 150, per100: p(0) },
];

export const APERO: AperoDrink[] = [
  {
    key: 'beer',
    emoji: '🍺',
    usual: 'blonde',
    usualSize: 'c33',
    sizes: [
      { key: 'demi', ml: 250 },
      { key: 'c33', ml: 330 },
      { key: 'pint', ml: 500 },
    ],
    items: [
      item('blonde', p(39, 3.1, 0.05, 0.4), 5),
      item('special', p(56, 4.6, 0, 0.5), 6),
      item('white', p(61, 7.6, 0, 0.5), 5),
      item('brown', p(41, 4.1, 4.1, 0.4), 5.5),
      item('strong', p(63, 4.6, 0, 0.5), 8.5),
      item('panache', p(39, 6.3, 5.4), 2),
      item('free', p(29, 6.1, 3.3, 0.2), 0),
    ],
  },
  {
    key: 'wine',
    emoji: '🍷',
    usual: 'red',
    usualSize: 'glass',
    sizes: [
      { key: 'glass', ml: 120 },
      { key: 'big', ml: 180 },
    ],
    items: [item('red', p(76, 0, 0, 0.2), 12.5), item('white', p(55, 0.2, 0.2, 0.3), 11.5), item('rose', p(69, 1.4, 1.4, 0.2), 12), item('sweet', p(148, 10, 7.8, 0.2), 15)],
  },
  {
    key: 'bubbles',
    emoji: '🥂',
    usual: 'champagne',
    usualSize: 'flute',
    sizes: [{ key: 'flute', ml: 120 }],
    items: [
      item('champagne', p(76, 1.4, 1.4, 0.3), 12),
      item('cremant', p(72, 1.8, 1.8, 0.1), 11.5),
      item('kir', p(75, 3.3, 3.3, 0.2), 11),
      item('kirRoyal', p(87, 5.7, 5.7, 0.3), 11),
    ],
  },
  {
    key: 'cocktail',
    emoji: '🍹',
    usual: 'mojito',
    sizes: [],
    items: [
      item('mojito', p(72, 7.2, 6.8), 8, 250),
      item('spritz', p(83, 8.3, 8), 9, 180),
      item('ginTonic', p(80, 6.2, 6), 10, 200),
      item('pinaColada', p(153, 14, 13.5, 0.3, 3, 2.6), 12, 170),
      item('margarita', p(164, 5.5, 5), 25, 110),
      item('caipirinha', p(127, 8.7, 8.3), 17, 120),
      item('moscowMule', p(81, 7, 6.8), 9.5, 170),
      item('sexOnTheBeach', p(123, 10.7, 10), 14, 140),
      item('espressoMartini', p(160, 12, 12, 0.1), 20, 100),
      item('tiPunch', p(250, 13, 13), 36, 70),
      item('sangria', p(89, 11, 9.5), 7, 150),
      item('punch', p(159, 17.8, 17.8, 0.6), 16, 100),
    ],
  },
  {
    key: 'spirit',
    emoji: '🥃',
    usual: 'whisky',
    usualSize: 'single',
    mixers: true,
    sizes: [
      { key: 'shot', ml: 20 },
      { key: 'single', ml: 40 },
      { key: 'double', ml: 80 },
    ],
    items: [
      item('whisky', p(252, 0.1, 0.1), 40),
      item('rum', p(234), 40),
      item('vodka', p(250), 40),
      item('gin', p(265), 40),
      item('tequila', p(233, 0.6), 38),
      item('cognac', p(222, 0.8), 40),
      item('pastis', p(274, 2.9), 45),
      item('liqueur', p(225, 25.4, 17.4, 0.1, 0.2, 0.1), 25),
      item('vermouth', p(137, 11.3, 11.1), 16),
    ],
  },
  {
    key: 'cider',
    emoji: '🍏',
    usual: 'brut',
    usualSize: 'bowl',
    sizes: [
      { key: 'bowl', ml: 250 },
      { key: 'c33', ml: 330 },
    ],
    items: [item('brut', p(36, 2.6, 2.2), 4.5), item('sweet', p(39, 6.4, 5.8, 0.25), 2.5)],
  },
  {
    key: 'mocktail',
    emoji: '🧃',
    usual: 'virginMojito',
    sizes: [],
    items: [
      item('virginMojito', p(29, 7, 6.8), 0, 250),
      item('virginColada', p(110, 18, 17.5, 0.4, 3.3, 3), 0, 150),
      item('fruit', p(46, 10.9, 10.8, 0.4), 0, 250),
      item('spritzFree', p(30, 7.2, 7), 0, 200),
      item('diabolo', p(34, 8.4, 8.4), 0, 250),
    ],
  },
];

export function aperoDrink(key: string): AperoDrink | undefined {
  return APERO.find((d) => d.key === key);
}

export interface AperoChoice {
  item: string;
  size: string;
  mixer: string;
  count: number;
}

export interface AperoTotal extends Per100 {
  ml: number;
  /** grams of pure alcohol, and in standard drinks (10 g) */
  alcoholG: number;
  standard: number;
  /** none for an alcoholic drink (the Nutri-Score leaves them out) */
  grade: Grade | null;
  /** 1.13: none for an alcoholic drink either */
  health: number | null;
}

/** what the glasses bring, all of them */
export function aperoTotal(d: AperoDrink, c: AperoChoice): AperoTotal {
  const it = d.items.find((x) => x.key === c.item) ?? d.items[0];
  const size = d.sizes.find((s) => s.key === c.size) ?? d.sizes.find((s) => s.key === d.usualSize) ?? d.sizes[0];
  const ml = it.servingMl ?? size?.ml ?? 100;
  const mixer = d.mixers ? (MIXERS.find((m) => m.key === c.mixer) ?? MIXERS[0]) : MIXERS[0];
  const n = Math.max(1, c.count);
  const of = (k: keyof Per100) => ((it.per100[k] * ml) / 100 + (mixer.per100[k] * mixer.ml) / 100) * n;
  const alcoholG = ((ml * it.abv) / 100) * 0.789 * n;
  const total = {
    kcal: of('kcal'),
    proteinG: of('proteinG'),
    carbsG: of('carbsG'),
    sugarsG: of('sugarsG'),
    fatG: of('fatG'),
    satFatG: of('satFatG'),
    saltG: of('saltG'),
    ml: (ml + mixer.ml) * n,
  };
  // above 1,2 % (the drink, mixer included), the Nutri-Score does not apply
  const abvAll = (alcoholG / 0.789 / Math.max(total.ml, 1)) * 100;
  const per = 100 / Math.max(total.ml, 1);
  const grade =
    abvAll > 1.2
      ? null
      : drinkScore({
          kcal: total.kcal * per,
          sugarsG: total.sugarsG * per,
          satFatG: total.satFatG * per,
          saltG: total.saltG * per,
          fiberG: 0,
          proteinG: total.proteinG * per,
        });
  const health =
    abvAll > 1.2
      ? null
      : (healthScore({
          kcal: total.kcal * per,
          proteinG: total.proteinG * per,
          sugarsG: total.sugarsG * per,
          fatG: total.fatG * per,
          satFatG: total.satFatG * per,
          saltG: total.saltG * per,
          drink: true,
        })?.score ?? null);
  return { ...total, alcoholG, standard: alcoholG / 10, grade, health };
}
