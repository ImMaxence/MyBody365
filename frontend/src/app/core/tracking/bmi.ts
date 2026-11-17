/**
 * The body mass index and the World Health Organization's adult bands. A landmark, not a diagnosis: it
 * does not tell muscle from fat.
 */
export type BmiClass = 'under' | 'normal' | 'over' | 'obese1' | 'obese2' | 'obese3';

export interface BmiBand {
  cls: BmiClass;
  /** inclusive lower bound */
  from: number;
  /** exclusive upper bound, null for the last band */
  to: number | null;
}

export const BMI_BANDS: readonly BmiBand[] = [
  { cls: 'under', from: 0, to: 18.5 },
  { cls: 'normal', from: 18.5, to: 25 },
  { cls: 'over', from: 25, to: 30 },
  { cls: 'obese1', from: 30, to: 35 },
  { cls: 'obese2', from: 35, to: 40 },
  { cls: 'obese3', from: 40, to: null },
];

export function bmiOf(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiBand(bmi: number): BmiBand {
  return BMI_BANDS.find((b) => bmi >= b.from && (b.to === null || bmi < b.to)) ?? BMI_BANDS[0];
}

/** the weight that gives this index at this height */
export function weightForBmi(bmi: number, heightCm: number): number {
  const m = heightCm / 100;
  return bmi * m * m;
}

/**
 * An ideal weight for a height, a sex and an age: the mean of Lorentz (height and sex) and Creff (height
 * and age, normal build). For "other", Lorentz is the mean of both sexes. Estimates, not targets.
 */
export function idealWeight(sex: 'MALE' | 'FEMALE' | 'OTHER', age: number, heightCm: number): number {
  const male = heightCm - 100 - (heightCm - 150) / 4;
  const female = heightCm - 100 - (heightCm - 150) / 2.5;
  const lorentz = sex === 'MALE' ? male : sex === 'FEMALE' ? female : (male + female) / 2;
  const creff = (heightCm - 100 + age / 10) * 0.9;
  return (lorentz + creff) / 2;
}

/** the BMI band advised for an age (US National Research Council, 1989): a little higher with the years */
export function ageBmiRange(age: number): { from: number; to: number } {
  if (age < 25) return { from: 19, to: 24 };
  if (age < 35) return { from: 20, to: 25 };
  if (age < 45) return { from: 21, to: 26 };
  if (age < 55) return { from: 22, to: 27 };
  if (age < 65) return { from: 23, to: 28 };
  return { from: 24, to: 29 };
}

/**
 * Beyond the BMI, which does not tell muscle from fat: the waist-to-height ratio (NICE 2022, Ashwell),
 * the same for everyone whatever the sex or the build. Under 0.5: healthy.
 */
export type WaistClass = 'thin' | 'healthy' | 'raised' | 'high';

export function waistClass(waistCm: number, heightCm: number): WaistClass {
  const r = waistCm / heightCm;
  return r < 0.4 ? 'thin' : r < 0.5 ? 'healthy' : r < 0.6 ? 'raised' : 'high';
}

/** body fat percentage, by sex (American Council on Exercise bands); "other": between both */
export type FatClass = 'low' | 'athletic' | 'fit' | 'average' | 'high';

export function bodyFatClass(sex: 'MALE' | 'FEMALE' | 'OTHER', pct: number): FatClass {
  const men = [6, 14, 18, 25];
  const women = [14, 21, 25, 32];
  const t = sex === 'MALE' ? men : sex === 'FEMALE' ? women : men.map((m, i) => (m + women[i]) / 2);
  return pct < t[0] ? 'low' : pct < t[1] ? 'athletic' : pct < t[2] ? 'fit' : pct < t[3] ? 'average' : 'high';
}

/**
 * The next band towards the healthy one: its threshold, the weight that reaches it and the band beyond.
 * Null when already in the healthy band.
 */
export function nextBmiStep(bmi: number, heightCm: number): { threshold: number; weightKg: number; cls: BmiClass } | null {
  const band = bmiBand(bmi);
  if (band.cls === 'normal') return null;
  if (band.cls === 'under') {
    return { threshold: 18.5, weightKg: weightForBmi(18.5, heightCm), cls: 'normal' };
  }
  const below = BMI_BANDS[BMI_BANDS.indexOf(band) - 1];
  // just under the threshold: 34.9 is already "obesity class I"
  return { threshold: band.from, weightKg: weightForBmi(band.from, heightCm) - 0.1, cls: below.cls };
}
