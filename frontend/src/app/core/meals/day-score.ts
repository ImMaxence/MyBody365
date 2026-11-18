import type { MealDay } from '../api/models';

export type ScorePart = 'kcal' | 'macros' | 'quality' | 'nutrients';

export interface DayScore {
  /** out of 10, by halves */
  score: number;
  /** good ≥ 8, fair ≥ 6, weak ≥ 4, poor below */
  band: 'good' | 'fair' | 'weak' | 'poor';
  /** today, still in progress: the calories below the target are not judged yet */
  ongoing: boolean;
  parts: { key: ScorePart; points: number; max: number; values: Record<string, number | string> }[];
}

const GRADE: Record<string, number> = { a: 1, b: 2, c: 3, d: 4, e: 5 };

/**
 * How balanced and healthy a day of meals is, out of 10, from what is known:
 * calories against the target (3), protein / carbs / fat against the member's split (25 / 45 / 30 % by default) (2), the Nutri-Score of
 * the foods weighted by their calories (3), fibre, sugars, salt and saturated fat (2). A part without the
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

  // calories: within 10 % of the target is perfect
  if (day.targetKcal) {
    const r = t.kcal / day.targetKcal;
    if (!ongoing || r > 1.1) {
      const gap = Math.abs(r - 1);
      parts.push({ key: 'kcal', max: 3, points: gap <= 0.1 ? 3 : gap <= 0.2 ? 2 : gap <= 0.3 ? 1 : 0, values: { kcal: Math.round(t.kcal), target: day.targetKcal } });
    }
  }

  // macros: the share of the calories from each, against the split's shares
  const p = (t.proteinG ?? 0) * 4;
  const c = (t.carbsG ?? 0) * 4;
  const f = (t.fatG ?? 0) * 9;
  const macroKcal = p + c + f;
  if (!ongoing && macroKcal >= t.kcal * 0.3) {
    const sp = Math.round((p / macroKcal) * 100);
    const sc = Math.round((c / macroKcal) * 100);
    const sf = 100 - sp - sc;
    const dev = Math.abs(sp - shares.p) + Math.abs(sc - shares.c) + Math.abs(sf - shares.f);
    parts.push({ key: 'macros', max: 2, points: dev <= 15 ? 2 : dev <= 30 ? 1 : 0, values: { p: sp, c: sc, f: sf, tp: shares.p, tc: shares.c, tf: shares.f } });
  }

  // quality: the Nutri-Score of what was eaten, weighted by the calories (when most of them are rated)
  let rated = 0;
  let weighted = 0;
  for (const e of day.entries) {
    const g = e.nutriscore ? GRADE[e.nutriscore.toLowerCase()] : undefined;
    if (g && e.nutrients.kcal > 0) {
      rated += e.nutrients.kcal;
      weighted += g * e.nutrients.kcal;
    }
  }
  if (rated >= t.kcal * 0.4) {
    const avg = weighted / rated;
    const letter = 'ABCDE'[Math.min(4, Math.max(0, Math.round(avg) - 1))];
    parts.push({ key: 'quality', max: 3, points: avg <= 1.8 ? 3 : avg <= 2.6 ? 2 : avg <= 3.4 ? 1 : 0, values: { grade: letter } });
  }

  // nutrients: the usual daily guides (fibre is only judged once the day is over)
  const checks: boolean[] = [];
  const values: Record<string, number> = {};
  if (t.fiberG != null && !ongoing) {
    checks.push(t.fiberG >= 25);
    values['fiber'] = Math.round(t.fiberG);
  }
  if (t.sugarsG != null) {
    checks.push(t.sugarsG <= 50);
    values['sugars'] = Math.round(t.sugarsG);
  }
  if (t.saltG != null) {
    checks.push(t.saltG <= 5);
    values['salt'] = Math.round(t.saltG * 10) / 10;
  }
  if (t.satFatG != null) {
    checks.push(t.satFatG * 9 <= t.kcal * 0.1);
    values['satFat'] = Math.round(t.satFatG);
  }
  if (checks.length) {
    parts.push({ key: 'nutrients', max: 2, points: (2 * checks.filter(Boolean).length) / checks.length, values });
  }

  const max = parts.reduce((s, x) => s + x.max, 0);
  if (!max) return null;
  const score = Math.round((parts.reduce((s, x) => s + x.points, 0) / max) * 20) / 2;
  return { score, band: score >= 8 ? 'good' : score >= 6 ? 'fair' : score >= 4 ? 'weak' : 'poor', ongoing, parts };
}
