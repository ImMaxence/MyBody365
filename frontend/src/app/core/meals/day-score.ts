import type { MealDay } from '../api/models';
import { GRADE_SCORE } from './health';
import { FIBER_G } from './macro-plan';

export type ScorePart = 'kcal' | 'macros' | 'quality' | 'nutrients';

/** one of the daily guides of the « nutrients » part: how much, the limit, and whether it is kept */
export interface NutrientCheck {
  key: 'sugars' | 'salt' | 'satFat' | 'fiber';
  value: number;
  /** grams; for saturated fat, the grams that make 10 % of the calories eaten */
  limit: number;
  /** fibre is a minimum, the others a maximum */
  min: boolean;
  ok: boolean;
  /** fibre on a day still going on: counted once the day is over */
  waiting: boolean;
}

/** what would bring the most points back, said once (1.12) */
export type ScoreTip =
  | 'perfect'
  | 'quality'
  | 'sugars'
  | 'salt'
  | 'satFat'
  | 'fiber'
  | 'over'
  | 'under'
  | 'protein'
  | 'fat'
  | 'carbs';

export interface DayScore {
  /** out of 10, by halves */
  score: number;
  /** good ≥ 8, fair ≥ 6, weak ≥ 4, poor below */
  band: 'good' | 'fair' | 'weak' | 'poor';
  /** today, still in progress: the calories below the target are not judged yet */
  ongoing: boolean;
  parts: { key: ScorePart; points: number; max: number; values: Record<string, number | string> }[];
  /**
   * 1.12: the parts not judged yet today (the calories, the macros), with where the day stands so far: shown, never
   * counted, so that the four parts are always in view
   */
  waiting: { key: ScorePart; max: number; values: Record<string, number | string> }[];
  /** the guides of the « nutrients » part, one by one */
  checks: NutrientCheck[];
  tip: ScoreTip;
}


/**
 * the daily guides: at most 50 g of free sugars (1.20: estimated, the total sugars before) and 5 g of salt, saturated fat under
 * 10 % of the calories (the WHO's), 30 g of fibre (1.20: the Anses's, as in the guides of the day; it was 25 g here)
 */
const SUGARS_MAX = 50;
const SALT_MAX = 5;
const FIBER_MIN = FIBER_G;

/**
 * How balanced and healthy a day of meals is, out of 10, from what is known:
 * calories against the target (3), protein / carbs / fat against the member's split (25 / 45 / 30 % by default) (2), the health score
 * of the foods weighted by their calories (3, 1.13: in place of their Nutri-Score), fibre, sugars, salt and saturated fat (2). A part without the
 * data it needs is left out and the rest brought back to 10. Null when nothing was logged.
 *
 * Today, still going on (1.9): only what is already sure is judged, the quality of what was eaten (its Nutri-Score,
 * sugars, salt, saturated fat), and the calories once over the target. The calories reached and the macros wait for
 * the end of the day: judged on a single meal, they made the score go UP with a bag of crisps in the evening (the target
 * reached gave 3 points, the fat of the crisps « balanced » a lunch rich in protein).
 */
export function dayScore(day: MealDay, today: string, shares: { p: number; c: number; f: number } = { p: 25, c: 45, f: 30 }): DayScore | null {
  const t = day.totals;
  if (!day.entries.length || t.kcal <= 0) return null;
  const ongoing = day.day >= today;
  const parts: DayScore['parts'] = [];
  const waiting: DayScore['waiting'] = [];

  // calories: within 10 % of the target is perfect
  let kcalRatio: number | null = null;
  if (day.targetKcal) {
    const r = t.kcal / day.targetKcal;
    const values = { kcal: Math.round(t.kcal), target: day.targetKcal };
    if (!ongoing || r > 1.1) {
      const gap = Math.abs(r - 1);
      kcalRatio = r;
      parts.push({ key: 'kcal', max: 3, points: gap <= 0.1 ? 3 : gap <= 0.2 ? 2 : gap <= 0.3 ? 1 : 0, values });
    } else {
      waiting.push({ key: 'kcal', max: 3, values });
    }
  }

  // macros: the share of the calories from each, against the split's shares
  const p = (t.proteinG ?? 0) * 4;
  const c = (t.carbsG ?? 0) * 4;
  const f = (t.fatG ?? 0) * 9;
  const macroKcal = p + c + f;
  let macroGap: { p: number; c: number; f: number } | null = null;
  if (macroKcal >= t.kcal * 0.3) {
    const sp = Math.round((p / macroKcal) * 100);
    const sc = Math.round((c / macroKcal) * 100);
    const sf = 100 - sp - sc;
    const values = { p: sp, c: sc, f: sf, tp: shares.p, tc: shares.c, tf: shares.f };
    if (!ongoing) {
      const dev = Math.abs(sp - shares.p) + Math.abs(sc - shares.c) + Math.abs(sf - shares.f);
      macroGap = { p: sp - shares.p, c: sc - shares.c, f: sf - shares.f };
      parts.push({ key: 'macros', max: 2, points: dev <= 15 ? 2 : dev <= 30 ? 1 : 0, values });
    } else {
      waiting.push({ key: 'macros', max: 2, values });
    }
  }

  // quality: the health score of what was eaten, weighted by the calories (when most of them are rated); a line noted
  // before 1.13 has its Nutri-Score read as a score
  let rated = 0;
  let weighted = 0;
  for (const e of day.entries) {
    // 1.17: a line deleted without network no longer counts
    if (e.pending === 'delete') continue;
    const h = e.health ?? (e.nutriscore ? GRADE_SCORE[e.nutriscore.toLowerCase()] : undefined);
    if (h != null && e.nutrients.kcal > 0) {
      rated += e.nutrients.kcal;
      weighted += h * e.nutrients.kcal;
    }
  }
  if (rated >= t.kcal * 0.4) {
    const avg = weighted / rated;
    parts.push({ key: 'quality', max: 3, points: avg >= 7 ? 3 : avg >= 5.5 ? 2 : avg >= 4 ? 1 : 0, values: { grade: Math.round(avg * 2) / 2 } });
  }

  // nutrients: the usual daily guides (fibre is only judged once the day is over)
  const checks: NutrientCheck[] = [];
  const sugars = day.freeSugarsG ?? t.sugarsG;
  if (sugars != null) checks.push({ key: 'sugars', value: Math.round(sugars), limit: SUGARS_MAX, min: false, ok: sugars <= SUGARS_MAX, waiting: false });
  if (t.saltG != null) checks.push({ key: 'salt', value: Math.round(t.saltG * 10) / 10, limit: SALT_MAX, min: false, ok: t.saltG <= SALT_MAX, waiting: false });
  if (t.satFatG != null) {
    checks.push({ key: 'satFat', value: Math.round(t.satFatG), limit: Math.round((t.kcal * 0.1) / 9), min: false, ok: t.satFatG * 9 <= t.kcal * 0.1, waiting: false });
  }
  if (t.fiberG != null) checks.push({ key: 'fiber', value: Math.round(t.fiberG), limit: FIBER_MIN, min: true, ok: t.fiberG >= FIBER_MIN, waiting: ongoing });
  const judged = checks.filter((x) => !x.waiting);
  if (judged.length) {
    const values: Record<string, number> = {};
    for (const x of judged) values[x.key] = x.value;
    parts.push({ key: 'nutrients', max: 2, points: (2 * judged.filter((x) => x.ok).length) / judged.length, values });
  } else if (checks.length) {
    waiting.push({ key: 'nutrients', max: 2, values: {} });
  }

  const max = parts.reduce((s, x) => s + x.max, 0);
  if (!max) return null;
  const score = Math.round((parts.reduce((s, x) => s + x.points, 0) / max) * 20) / 2;
  const quality = parts.find((x) => x.key === 'quality');
  return {
    score,
    band: score >= 8 ? 'good' : score >= 6 ? 'fair' : score >= 4 ? 'weak' : 'poor',
    ongoing,
    parts,
    waiting,
    checks,
    tip: tipOf(judged, quality ? quality.points / quality.max : null, kcalRatio, macroGap),
  };
}

/**
 * The one thing to do for more points: the guide most over first (it is the easiest to see on the plate), then the
 * quality of the foods, the calories, and the share of the macros furthest from the guide.
 */
function tipOf(
  checks: NutrientCheck[],
  quality: number | null,
  kcalRatio: number | null,
  macros: { p: number; c: number; f: number } | null,
): ScoreTip {
  const missed = checks.filter((x) => !x.ok).sort((a, b) => Math.abs(b.value / b.limit - 1) - Math.abs(a.value / a.limit - 1));
  if (missed.length) return missed[0].key;
  if (quality != null && quality < 0.7) return 'quality';
  if (kcalRatio != null && kcalRatio > 1.1) return 'over';
  if (kcalRatio != null && kcalRatio < 0.9) return 'under';
  if (macros && Math.abs(macros.p) + Math.abs(macros.c) + Math.abs(macros.f) > 15) {
    // the biggest gap says what to change: too little protein, too much fat, too many carbohydrates
    if (macros.p <= -5 && -macros.p >= Math.max(macros.f, macros.c)) return 'protein';
    if (macros.f >= macros.c) return 'fat';
    return 'carbs';
  }
  if (quality != null && quality < 1) return 'quality';
  return 'perfect';
}
