import type { MacroSplit } from '../api/models';

/**
 * The day's guides in grams, from the calorie target and the weight:
 * - protein by the kilo (1.6 g/kg protects the muscles while losing fat; 2 g with « more protein »), of the
 *   lower of the current and the goal weight (with a lot to lose, the goal weight: the muscles are not that heavy);
 * - fat: 30 % of the calories (25 to 45 % with « fewer carbs », which takes them from the carbohydrates);
 * - carbohydrates: the rest; fibre: 30 g a day (Anses).
 * At equal calories and protein, no split makes one lose fat faster: it is about what helps to eat less.
 */
export interface MacroPlan {
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  /** the share of the calories of each, in % (they add up to 100) */
  shares: { p: number; c: number; f: number };
  /** grams of protein per kilo, and the weight they are counted on */
  perKg: number;
  refKg: number | null;
}

export const FIBER_G = 30;
const PER_KG: Record<MacroSplit, number> = { BALANCED: 1.6, PROTEIN: 2.0, LOW_CARB: 1.8 };

export function macroPlan(kcal: number, split: MacroSplit = 'BALANCED', weightKg?: number | null, goalKg?: number | null): MacroPlan {
  const target = Math.max(kcal, 800);
  const refKg = weightKg ? Math.min(weightKg, goalKg || weightKg) : null;
  const perKg = PER_KG[split];
  // protein: by the kilo, between 15 % and 35 % of the calories (40 % with « more protein »)
  const maxShare = split === 'PROTEIN' ? 0.4 : 0.35;
  const proteinKcal = refKg ? Math.min(Math.max(refKg * perKg * 4, target * 0.15), target * maxShare) : target * 0.25;
  let fatKcal: number;
  let carbsKcal: number;
  if (split === 'LOW_CARB') {
    carbsKcal = target * 0.25;
    fatKcal = target - proteinKcal - carbsKcal;
    // never more than 45 % of fat: the rest goes back to the carbohydrates
    if (fatKcal > target * 0.45) {
      carbsKcal += fatKcal - target * 0.45;
      fatKcal = target * 0.45;
    }
  } else {
    fatKcal = target * 0.3;
    carbsKcal = target - proteinKcal - fatKcal;
  }
  const p = Math.round((proteinKcal / target) * 100);
  const f = Math.round((fatKcal / target) * 100);
  return {
    proteinG: Math.round(proteinKcal / 4),
    carbsG: Math.round(carbsKcal / 4),
    fatG: Math.round(fatKcal / 9),
    fiberG: FIBER_G,
    shares: { p, c: 100 - p - f, f },
    perKg,
    refKg,
  };
}
