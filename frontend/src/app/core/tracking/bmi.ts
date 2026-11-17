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
