/**
 * The health score of MyBody365 (1.13), out of 10 by halves, in place of the Nutri-Score: the nutrients per 100 g (per
 * 100 ml for a drink) as the Nutri-Score reads them, plus what it leaves out: how processed a food is (NOVA), frying,
 * sweeteners and additives, and the quality of the fat of an oil or a butter. The same rules as the server
 * (backend nutrition/HealthScore.java): change one, change both.
 *
 * A food starts at 6. Sugars, saturated fat, salt, energy, ultra-processing, frying and additives take points away; fibre,
 * protein, fruit / vegetables / legumes / nuts, a light food, a raw food and good fats bring some back. A plain drink
 * starts at 10 (water is the reference) and loses points for its sugars, its energy and its sweeteners. Alcohol has no
 * score: no amount of it is good for health.
 */
export interface HealthInput {
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  sugarsG?: number | null;
  fatG?: number | null;
  satFatG?: number | null;
  fiberG?: number | null;
  saltG?: number | null;
  /** a drink other than milk (per 100 ml) */
  drink?: boolean;
  /** plain water */
  water?: boolean;
  alcohol?: boolean;
  /** NOVA group: 1 raw or barely processed … 4 ultra-processed */
  nova?: number | null;
  additives?: number | null;
  sweeteners?: boolean;
  /** share of fruit, vegetables, legumes and nuts, in % */
  fruitVeg?: number | null;
  fried?: boolean;
}

export type HealthPro = 'fiber' | 'protein' | 'fruitVeg' | 'goodFats' | 'raw' | 'light' | 'water';
export type HealthCon = 'sugars' | 'satFat' | 'salt' | 'energy' | 'ultra' | 'fried' | 'additives' | 'sweeteners';

export interface Health {
  /** out of 10, by halves */
  score: number;
  /** what makes it good, then what costs it points, the weightiest first */
  pros: HealthPro[];
  cons: HealthCon[];
}

export type HealthBand = 'great' | 'good' | 'fair' | 'weak' | 'poor';

/** 8 and more: great; 6.5: good; 4.5: fair; 2.5: weak; below: poor */
export function healthBand(score: number): HealthBand {
  return score >= 8 ? 'great' : score >= 6.5 ? 'good' : score >= 4.5 ? 'fair' : score >= 2.5 ? 'weak' : 'poor';
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const above = (v: number | null | undefined, from: number) => Math.max(0, (v ?? 0) - from);

/** null when the sugars, the saturated fat or the salt are unknown (a portion noted with its calories only), or for alcohol */
export function healthScore(p: HealthInput): Health | null {
  if (p.alcohol) return null;
  if (p.water) return { score: 10, pros: ['water'], cons: [] };
  if (p.sugarsG == null || p.satFatG == null || p.saltG == null) return null;
  const pros: [HealthPro, number][] = [];
  const cons: [HealthCon, number][] = [];
  const nova = p.nova ?? null;
  const additives = above(p.additives, 1) * 0.25;
  if (additives > 0) cons.push(['additives', Math.min(1, additives)]);
  if (nova === 4) cons.push(['ultra', 1.5]);

  let base: number;
  if (p.drink) {
    base = 10;
    cons.push(['sugars', Math.min(7, p.sugarsG * 0.6)]);
    cons.push(['energy', Math.min(2, above(p.kcal, 5) * 0.04)]);
    cons.push(['salt', Math.min(2, above(p.saltG, 0.2) * 4)]);
    cons.push(['satFat', Math.min(2, above(p.satFatG, 0.5))]);
    if (nova === 3) cons.push(['ultra', 0.5]);
    if (p.sweeteners) cons.push(['sweeteners', 2.5]);
    pros.push(['protein', Math.min(1, (p.proteinG ?? 0) * 0.3)]);
    pros.push(['fiber', Math.min(0.5, (p.fiberG ?? 0) * 0.3)]);
    if ((p.fruitVeg ?? 0) >= 80) pros.push(['fruitVeg', 1]);
  } else {
    base = 6;
    // an oil, a butter, a margarine: judged on the quality of their fat, eaten by the spoonful
    const fat = p.fatG ?? 0;
    const ratio = fat > 0 ? p.satFatG / fat : 0;
    const fats = fat >= 50 && (p.proteinG ?? 0) < 10 && (p.carbsG ?? 0) < 15;
    cons.push(['sugars', Math.min(6, above(p.sugarsG, 4) * 0.16)]);
    cons.push(['salt', Math.min(4, above(p.saltG, 0.25) * 1.6)]);
    if (fats) {
      cons.push(['energy', 1]);
      cons.push(['satFat', clamp((ratio - 0.12) * 12, 0, 3.5)]);
      if (ratio <= 0.2) pros.push(['goodFats', 3.5]);
      else if (ratio <= 0.3) pros.push(['goodFats', 1.5]);
    } else {
      cons.push(['energy', Math.min(2.8, above(p.kcal, 100) * 0.007)]);
      cons.push(['satFat', Math.min(3.5, above(p.satFatG, 1) * 0.25)]);
      // the oil of a fried food does not make it better
      if (fat >= 10 && ratio <= 0.2 && !p.fried) pros.push(['goodFats', 1]);
      else if (fat >= 10 && ratio <= 0.3 && !p.fried) pros.push(['goodFats', 0.5]);
    }
    if (nova === 3) cons.push(['ultra', 0.5]);
    if (p.fried) cons.push(['fried', 1.5]);
    if (p.sweeteners) cons.push(['sweeteners', 0.5]);
    pros.push(['fiber', Math.min(2.5, (p.fiberG ?? 0) * 0.35)]);
    pros.push(['protein', Math.min(3, (p.proteinG ?? 0) * 0.13)]);
    const fv = p.fruitVeg ?? 0;
    pros.push(['fruitVeg', fv > 80 ? 3 : fv > 60 ? 1.5 : fv > 40 ? 0.5 : 0]);
    pros.push(['light', p.kcal < 60 ? 1.5 : p.kcal < 100 ? 0.75 : 0]);
    if (nova === 1 && !p.fried) pros.push(['raw', 1]);
  }
  const minus = cons.reduce((s, [, v]) => s + v, 0);
  const plus = pros.reduce((s, [, v]) => s + v, 0);
  const score = Math.round(clamp(base - minus + plus, 0, 10) * 2) / 2;
  // said only when it is true by the usual claims (« riche en fibres » from 6 g, « riche en protéines » from 20 % of the
  // energy), and never for a food that scores low: a spread is not « rich in fibre » because of its 3 g
  const protein = p.proteinG ?? 0;
  const said = (k: HealthPro) =>
    k === 'fiber' ? (p.fiberG ?? 0) >= (p.drink ? 1.5 : 6) : k === 'protein' ? protein >= (p.drink ? 2.5 : 5) && protein * 4 >= p.kcal * 0.2 : true;
  return {
    score,
    pros: score < 3.5 ? [] : merge(pros, 0.5).filter(said),
    cons: merge(cons, 0.5),
  };
}

/** the reasons worth saying (half a point or more), the weightiest first, each once */
function merge<K extends string>(list: [K, number][], min: number): K[] {
  const sum = new Map<K, number>();
  for (const [k, v] of list) sum.set(k, (sum.get(k) ?? 0) + v);
  return [...sum.entries()]
    .filter(([, v]) => v >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/** a name that says the food was fried (« frites », « beignets », « nuggets », « pané »…) */
const FRIED = /\b(frit|frits|frite|frites|chips|beignet|beignets|nugget|nuggets|pane|panes|panee|panees|tempura|croquette|croquettes|friture|donut|donuts|churros|samoussa|samoussas|nem|nems|fried|fries|crisps)\b/;

export function friedName(name: string): boolean {
  return FRIED.test(plainName(name));
}

function plainName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * 1.13: the guides of the UK traffic lights, per 100 g (half for a drink): what earns a product a warning on its sheet.
 * Saturated fat raises the bad cholesterol (LDL) the most.
 */
export interface HealthAlert {
  key: 'satFat' | 'sugars' | 'salt';
  value: number;
}

export function healthAlerts(p: HealthInput): HealthAlert[] {
  if (p.water || p.alcohol) return [];
  const k = p.drink ? 0.5 : 1;
  const out: HealthAlert[] = [];
  if ((p.satFatG ?? 0) > 5 * k) out.push({ key: 'satFat', value: p.satFatG! });
  if ((p.sugarsG ?? 0) > 22.5 * k) out.push({ key: 'sugars', value: p.sugarsG! });
  if ((p.saltG ?? 0) > 1.5 * k) out.push({ key: 'salt', value: p.saltG! });
  return out;
}

/** the old Nutri-Score letters of meals noted before 1.13, read as a score */
export const GRADE_SCORE: Record<string, number> = { a: 9, b: 7, c: 5, d: 3, e: 1 };

/**
 * A recipe's score from its lines (values per 100 g and weights), as the server works it out: the dish per 100 g, its
 * share of fruit, vegetables, legumes and nuts, a fried name; a recipe only of drinks is judged as a drink
 */
export function recipeHealth(
  lines: { grams: number; per100: Partial<HealthInput> & { kcal: number }; fruitVeg?: boolean }[],
  name = '',
  drink = false,
): Health | null {
  const grams = lines.reduce((t, l) => t + (l.grams > 0 ? l.grams : 0), 0);
  if (!grams) return null;
  const sum = (k: 'kcal' | 'proteinG' | 'carbsG' | 'sugarsG' | 'fatG' | 'satFatG' | 'fiberG' | 'saltG') => {
    let known = false;
    let v = 0;
    for (const l of lines) {
      const x = l.per100[k];
      if (x != null && l.grams > 0) {
        known = true;
        v += (x * l.grams) / 100;
      }
    }
    return known ? (v * 100) / grams : null;
  };
  const plants = lines.reduce((t, l) => t + (l.fruitVeg && l.grams > 0 ? l.grams : 0), 0);
  return healthScore({
    kcal: sum('kcal') ?? 0,
    proteinG: sum('proteinG'),
    carbsG: sum('carbsG'),
    sugarsG: sum('sugarsG'),
    fatG: sum('fatG'),
    satFatG: sum('satFatG'),
    fiberG: sum('fiberG'),
    saltG: sum('saltG'),
    fruitVeg: (100 * plants) / grams,
    fried: friedName(name),
    drink,
  });
}

/** a meal's score: the scores of its parts, weighted by their calories */
export function averageHealth(parts: { health: number | null | undefined; kcal: number }[]): number | null {
  const known = parts.filter((p) => p.health != null && p.kcal > 0);
  const total = known.reduce((t, p) => t + p.kcal, 0);
  if (!total) return null;
  return Math.round((known.reduce((t, p) => t + p.health! * p.kcal, 0) / total) * 2) / 2;
}
