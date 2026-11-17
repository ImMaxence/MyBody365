/**
 * The Nutri-Score of a food from its values per 100 g: the 2023 algorithm for general foods, as the server
 * computes it (backend nutrition/Nutriscore.java). Fruit and vegetables count as 0 %: the estimate errs on
 * the strict side. Drinks have their own scale: drinkScore.
 */
export type Grade = 'a' | 'b' | 'c' | 'd' | 'e';

export interface Per100 {
  kcal: number;
  sugarsG: number;
  satFatG: number;
  saltG: number;
  fiberG?: number;
  proteinG?: number;
}

const ENERGY_KJ = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const SUGARS = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
const SAT_FAT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SALT = [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4];
const FIBER = [3.0, 4.1, 5.2, 6.3, 7.4];
const PROTEIN = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];

/** one point per threshold strictly exceeded */
const points = (v: number, thresholds: number[]) => thresholds.filter((t) => v > t).length;

export function nutriscore(p: Per100): Grade {
  const negative = points(p.kcal * 4.184, ENERGY_KJ) + points(p.sugarsG, SUGARS) + points(p.satFatG, SAT_FAT) + points(p.saltG, SALT);
  const fiber = p.fiberG == null ? 0 : points(p.fiberG, FIBER);
  const protein = p.proteinG == null ? 0 : points(p.proteinG, PROTEIN);
  // above 11 negative points, proteins no longer make up for the rest
  const score = negative - (negative >= 11 ? fiber : fiber + protein);
  return score <= 0 ? 'a' : score <= 2 ? 'b' : score <= 10 ? 'c' : score <= 18 ? 'd' : 'e';
}

/* the beverages' own scale (2023): stricter on energy and sugars, proteins always count, A for water only */
const DRINK_ENERGY_KJ = [30, 90, 150, 210, 240, 270, 300, 330, 360, 390];
const DRINK_SUGARS = [0.5, 2, 3.5, 5, 6, 7, 8, 9, 10, 11];
const DRINK_PROTEIN = [1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0];

/** the Nutri-Score of a drink from its values per 100 ml (a coffee, a tea, a latte…); water alone gets A */
export function drinkScore(p: Per100 & { sweeteners?: boolean; water?: boolean }): Grade {
  if (p.water) return 'a';
  const negative =
    points(p.kcal * 4.184, DRINK_ENERGY_KJ) + points(p.sugarsG, DRINK_SUGARS) + points(p.satFatG, SAT_FAT) + points(p.saltG, SALT) + (p.sweeteners ? 4 : 0);
  const positive = (p.proteinG == null ? 0 : points(p.proteinG, DRINK_PROTEIN)) + (p.fiberG == null ? 0 : points(p.fiberG, FIBER));
  const score = negative - positive;
  return score <= 2 ? 'b' : score <= 6 ? 'c' : score <= 9 ? 'd' : 'e';
}

const ORDER: Grade[] = ['a', 'b', 'c', 'd', 'e'];

/** a meal's grade: the grades of its parts, weighted by their calories (a guide, not an official score) */
export function averageGrade(parts: { grade: Grade | null; kcal: number }[]): Grade | null {
  const graded = parts.filter((p) => p.grade && p.kcal > 0);
  const total = graded.reduce((t, p) => t + p.kcal, 0);
  if (!total) return null;
  const mean = graded.reduce((t, p) => t + ORDER.indexOf(p.grade!) * p.kcal, 0) / total;
  return ORDER[Math.round(mean)];
}
