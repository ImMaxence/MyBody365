import { healthScore } from './health';

/**
 * 1.18: « Pâtisseries et chocolats », bought at the bakery or taken from a box: the viennoiseries, the pastries of the
 * window, the small cakes, the chocolates and the sweets, counted the way they are eaten (a piece, a slice, a square, a
 * spoon, a handful). Values per 100 g from the Ciqual table (the code is given), an artisanal item when the table has one;
 * the few it lacks (chocolate-coated almonds, truffles, orangettes, mendiants) are averages of the labels of the shops.
 * Weights: what a French bakery or a box usually gives, at ± 20 %.
 */
export interface SweetPer100 {
  kcal: number;
  proteinG: number;
  carbsG: number;
  sugarsG: number;
  fatG: number;
  satFatG: number;
  fiberG: number;
  saltG: number;
}

export type SweetUnit = 'piece' | 'slice' | 'square' | 'spoon' | 'handful';

export interface SweetItem {
  key: string;
  per100: SweetPer100;
  /** the weight of one (a piece, a slice…), in grams */
  g: number;
  unit: SweetUnit;
  /** how many are taken at first */
  usual?: number;
  /** NOVA group: 3 for the bakery's own, 4 for the industrial sweets */
  nova: number;
}

export interface SweetGroup {
  key: string;
  emoji: string;
  items: SweetItem[];
  usual: string;
}

/** [kcal, protein, carbs, sugars, fat, saturated fat, fibre, salt] per 100 g */
type V = [number, number, number, number, number, number, number, number];

const v = ([kcal, proteinG, carbsG, sugarsG, fatG, satFatG, fiberG, saltG]: V): SweetPer100 => ({
  kcal,
  proteinG,
  carbsG,
  sugarsG,
  fatG,
  satFatG,
  fiberG,
  saltG,
});
const it = (key: string, values: V, g: number, unit: SweetUnit, usual = 1, nova = 3): SweetItem => ({ key, per100: v(values), g, unit, usual, nova });

export const SWEETS: SweetGroup[] = [
  {
    key: 'viennoiserie',
    emoji: '🥐',
    usual: 'croissant',
    items: [
      // 7620 croissant pur beurre, artisanal
      it('croissant', [420, 6.6, 45.7, 7.3, 22.6, 15.1, 2.5, 1.16], 60, 'piece'),
      // 7730 pain au chocolat, artisanal
      it('painChocolat', [423, 7.5, 45.4, 12.8, 22.5, 14.7, 3, 0.98], 70, 'piece'),
      // 7650 croissant aux amandes, artisanal
      it('croissantAmandes', [449, 7.6, 36.5, 14.4, 29.1, 14.9, 3.7, 0.79], 100, 'piece'),
      // 7720 pain aux raisins, artisanal
      it('painRaisins', [345, 5.8, 53.4, 20.9, 11.5, 5.7, 1.4, 0.81], 100, 'piece'),
      // 23480 chausson aux pommes
      it('chausson', [360, 4.2, 42.2, 11.2, 18.7, 10.3, 3.1, 0.87], 110, 'piece'),
      // 7742 brioche nature, artisanale (a briochette)
      it('brioche', [420, 11.3, 50.7, 5.7, 19.1, 8.5, 1.9, 1.47], 45, 'piece'),
      // 7710 pain au lait, artisanal
      it('painLait', [376, 8.6, 49, 9.6, 15.4, 8.3, 1.5, 1.1], 35, 'piece'),
      // 23467 chouquette
      it('chouquette', [408, 9.1, 40.6, 18.4, 22.9, 11, 1.5, 1.06], 10, 'piece', 5),
      // 23122 kouign-amann, artisanal (an individual one)
      it('kouignAmann', [449, 5.8, 48.7, 20.5, 25.1, 16.7, 2.2, 0.85], 100, 'piece'),
    ],
  },
  {
    key: 'patisserie',
    emoji: '🍰',
    usual: 'eclair',
    items: [
      // 23477 éclair
      it('eclair', [264, 5.8, 31.6, 18.9, 11.8, 6.1, 3.9, 0.23], 100, 'piece'),
      // the éclair's values (the same choux, cream and icing), a bigger piece
      it('religieuse', [264, 5.8, 31.6, 18.9, 11.8, 6.1, 3.9, 0.23], 120, 'piece'),
      // 24666 mille-feuille
      it('milleFeuille', [292, 3.9, 43.7, 21.1, 11.3, 5.3, 0.24, 0.42], 120, 'piece'),
      // 23005 Paris-Brest (an individual one)
      it('parisBrest', [327, 5.4, 29.1, 18.6, 20.5, 12.5, 1.1, 0.29], 110, 'piece'),
      // 23456 Saint-honoré, chou à la crème chantilly
      it('saintHonore', [337, 4.6, 22.9, 8.9, 25, 13.6, 1, 0.37], 110, 'slice'),
      // 23457 chou à la crème pâtissière
      it('chouCreme', [225, 4.3, 34.9, 10.7, 7.3, 3.4, 1, 0.25], 70, 'piece'),
      // 23491 tarte aux fraises, artisanale
      it('tarteFraises', [318, 3.2, 31, 12.9, 19.8, 9, 1.5, 0.14], 120, 'slice'),
      // 23498 tarte ou tartelette aux fruits
      it('tarteletteFruits', [245, 3.2, 34.1, 21.6, 10, 5.5, 2.4, 0.26], 110, 'piece'),
      // 23485 tarte au citron
      it('tarteCitron', [319, 5.6, 43.1, 34.1, 13.6, 7.7, 0.97, 0.3], 110, 'slice'),
      // 23490 tarte ou tartelette aux pommes
      it('tartePommes', [227, 2.5, 32.7, 20.7, 8.8, 4.7, 3.3, 0.31], 120, 'slice'),
      // 23497 tarte au chocolat, artisanale
      it('tarteChocolat', [469, 5.9, 40.9, 22.7, 30.7, 18.9, 2.9, 0.19], 100, 'slice'),
      // 23496 tarte Tatin
      it('tatin', [245, 1.8, 38.1, 28.5, 9.3, 5.8, 1.25, 0.15], 130, 'slice'),
      // 23525 flan pâtissier
      it('flan', [211, 4, 33.2, 17.5, 6.9, 4.1, 0.48, 0.2], 130, 'slice'),
      // 23121 far breton aux pruneaux
      it('farBreton', [229, 5.1, 32, 21.5, 8, 4.8, 3.4, 0.23], 120, 'slice'),
      // 19688 baba au rhum
      it('babaRhum', [174, 2.8, 28.3, 28.3, 2.4, 1.8, 0.76, 0.33], 120, 'piece'),
      // 23009 fraisier ou framboisier
      it('fraisier', [221, 2.6, 25, 21, 12, 7.5, 1.5, 0.14], 110, 'slice'),
      // 23008 opéra
      it('opera', [392, 5.2, 37.6, 33.3, 24, 13.4, 2.3, 0.11], 90, 'slice'),
      // 23006 forêt-noire
      it('foretNoire', [317, 3.7, 39.1, 26.4, 14.8, 9.7, 1.85, 0.17], 120, 'slice'),
      // 23001 cheesecake
      it('cheesecake', [337, 5.4, 34.1, 21.3, 19.7, 11.4, 0.7, 0.44], 110, 'slice'),
      // 23802 gâteau basque à la crème pâtissière
      it('gateauBasque', [340, 3.8, 51.5, 28.1, 13, 7.6, 1, 0.47], 100, 'slice'),
      // 23684 galette des rois à la frangipane
      it('galetteRois', [438, 7.6, 33.4, 12.3, 30, 14, 2, 0.7], 110, 'slice'),
      // 23030 bûche de Noël pâtissière
      it('buche', [363, 4.3, 39.8, 31.8, 20.4, 11.1, 1, 0.24], 100, 'slice'),
    ],
  },
  {
    key: 'cakes',
    emoji: '🧁',
    usual: 'macaron',
    items: [
      // 23024 macaron moelleux fourré
      it('macaron', [448, 11, 56.5, 51.3, 19, 2.5, 2.9, 0.16], 12, 'piece', 2),
      // 24664 financier
      it('financier', [447, 8.3, 44.3, 34.6, 25.7, 12.2, 2.3, 0.32], 35, 'piece'),
      // 24630 madeleine pur beurre
      it('madeleine', [453, 5.9, 52.4, 27.3, 24.1, 15.3, 1.27, 0.92], 25, 'piece', 2),
      // 23022 canelé
      it('canele', [298, 5, 61, 41.2, 3.2, 2.1, 2.6, 0.1], 60, 'piece'),
      // 24684 cookie au chocolat (one of the bakery, bigger than a packet's)
      it('cookie', [493, 6.4, 61, 31.4, 23.8, 11.4, 4.3, 0.86], 70, 'piece'),
      // 23032 brownie au chocolat
      it('brownie', [458, 5.9, 50.6, 35.1, 25.4, 7.3, 3.4, 0.35], 60, 'piece'),
      // 23952 muffin au chocolat
      it('muffin', [444, 5.6, 52.5, 30.2, 23, 5.3, 2.4, 0.93], 85, 'piece'),
      // 23885 donut nappé de chocolat
      it('donut', [407, 5.3, 48, 20, 21, 4.2, 2.6, 0.83], 60, 'piece'),
      // 23881 beignet fourré à la confiture
      it('beignet', [391, 5.1, 49.5, 19, 19, 3.1, 0.9, 0.9], 80, 'piece'),
      // 24660 palmier, artisanal
      it('palmier', [499, 5.9, 47.8, 21.8, 30.4, 14.4, 5.3, 1.16], 45, 'piece'),
      // 24071 sablé pâtissier, artisanal (its saturated fat, missing from the table: a butter shortbread's share)
      it('sable', [484, 8.4, 59.4, 22, 22.9, 14, 3.3, 0.41], 30, 'piece'),
      // 24520 meringue
      it('meringue', [396, 4.8, 93.2, 87.6, 0.5, 0, 0, 0.23], 15, 'piece'),
      // 23850 gaufre bruxelloise ou liégeoise, artisanale
      it('gaufre', [301, 8, 36.1, 4.8, 13.4, 5.1, 1.9, 0.99], 90, 'piece'),
      // 23033 rocher coco
      it('rocherCoco', [459, 4, 56.1, 49.3, 23, 19.7, 5.6, 0.15], 25, 'piece', 2),
    ],
  },
  {
    key: 'chocolate',
    emoji: '🍫',
    usual: 'dark',
    items: [
      // 31074 chocolat noir 70 %, a square of a 100 g bar
      it('dark', [591, 10.4, 26.9, 17.9, 46.3, 28.7, 12.8, 0.02], 5, 'square', 2),
      // 31004 chocolat au lait
      it('milk', [550, 7.5, 58.9, 56.3, 30.8, 18.7, 2.9, 0.2], 5, 'square', 2),
      // 31010 chocolat blanc
      it('white', [563, 6.2, 57.1, 56, 34.2, 21.3, 1, 0.22], 5, 'square', 2),
      // 31018 chocolat au lait aux noisettes ou amandes
      it('nuts', [559, 8.4, 48.7, 43.6, 35.9, 17, 3.5, 0.25], 5, 'square', 2),
      // labels: almonds coated with dark or milk chocolate, about 4 g each
      it('almonds', [565, 12, 38, 33, 40, 14, 7, 0.05], 4, 'piece', 5),
      // 31066 rocher fourré praliné
      it('rocher', [558, 6.5, 51.4, 49.2, 35.3, 15.5, 3.9, 0.14], 12.5, 'piece', 2),
      // 31063 bouchée fourrée praliné (a chocolate of a box)
      it('praline', [558, 9.1, 51.5, 46.2, 34.7, 13.6, 2.1, 0.34], 10, 'piece', 2),
      // labels: cocoa-dusted ganache truffles
      it('truffle', [560, 4, 45, 40, 40, 25, 4, 0.05], 10, 'piece', 2),
      // labels: candied orange peel in dark chocolate
      it('orangette', [470, 3.5, 58, 54, 24, 14.5, 6, 0.02], 6, 'piece', 3),
      // labels: dark chocolate with nuts and dried fruit
      it('mendiant', [540, 8, 40, 33, 37, 19, 9, 0.02], 8, 'piece', 2),
      // 31042 cacahuètes enrobées de chocolat, dragéifiées
      it('peanuts', [499, 9.5, 55.9, 50.5, 25, 9.9, 5.9, 0.12], 25, 'handful', 1, 4),
      // 31001 barre chocolatée enrobée (caramel, nougat)
      it('bar', [496, 3.7, 66.4, 47, 24.1, 14, 0.6, 0.5], 50, 'piece', 1, 4),
      // 31032 pâte à tartiner chocolat et noisette, a tablespoon
      it('spread', [549, 5, 57.9, 56.2, 32.4, 9.2, 3.2, 0.12], 15, 'spoon', 1, 4),
    ],
  },
  {
    key: 'candy',
    emoji: '🍬',
    usual: 'gummies',
    items: [
      // 31060 bonbon gélifié
      it('gummies', [339, 4.9, 76.9, 58.4, 0.5, 0.25, 1.5, 0.02], 5, 'piece', 5, 4),
      // 31059 bonbon dur et sucette
      it('hard', [384, 0.2, 95.3, 70.4, 0.2, 0.1, 0.9, 0.09], 5, 'piece', 2, 4),
      // 31081 bonbon tendre au caramel
      it('caramel', [415, 2.2, 79.1, 59.8, 10, 5.6, 0.2, 0.56], 8, 'piece', 2, 4),
      // 31050 guimauve
      it('marshmallow', [336, 3.3, 80.7, 69.9, 0.1, 0, 0, 0.08], 7, 'piece', 3, 4),
      // 31127 nougat tendre
      it('nougat', [437, 7, 69.3, 60.8, 13.9, 1.2, 3.3, 0.05], 30, 'piece'),
      // 31092 calisson d'Aix
      it('calisson', [440, 8, 59.8, 49.6, 18, 1.7, 3.1, 0.03], 12, 'piece', 2),
      // 31036 dragée à l'amande
      it('dragee', [465, 5.3, 75.7, 68.3, 14.7, 1.25, 4.6, 0.03], 4, 'piece', 3),
      // 31023 marron glacé
      it('marronGlace', [320, 0.9, 77.5, 55.3, 0.5, 0.06, 2.7, 0.07], 20, 'piece'),
      // 15201 pâte d'amande
      it('pateAmande', [432, 5.8, 70.3, 60.1, 13.5, 1.05, 2.8, 0.02], 20, 'piece'),
      // 15058 chouchous, cacahuètes caramélisées
      it('chouchou', [544, 12.9, 51.4, 44.7, 29.7, 4, 6.1, 0.01], 30, 'handful'),
    ],
  },
];

export function sweetGroup(key: string): SweetGroup | undefined {
  return SWEETS.find((g) => g.key === key);
}

export interface SweetTotal extends SweetPer100 {
  grams: number;
  health: number | null;
}

/** what n of an item bring, and its health score (the item's own, by 100 g) */
export function sweetTotal(item: SweetItem, n: number): SweetTotal {
  const grams = item.g * Math.max(1, n);
  const f = grams / 100;
  const p = item.per100;
  const h = healthScore({ ...p, nova: item.nova });
  return {
    kcal: p.kcal * f,
    proteinG: p.proteinG * f,
    carbsG: p.carbsG * f,
    sugarsG: p.sugarsG * f,
    fatG: p.fatG * f,
    satFatG: p.satFatG * f,
    fiberG: p.fiberG * f,
    saltG: p.saltG * f,
    grams,
    health: h?.score ?? null,
  };
}

/** the chips of « Pâtisseries et chocolats » (food picker) */
export const SWEET_CHIPS = SWEETS.map((g) => ({ key: g.key, emoji: g.emoji }));
