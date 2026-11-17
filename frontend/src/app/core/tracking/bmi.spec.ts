import { ageBmiRange, bmiBand, bmiOf, bodyFatClass, idealWeight, nextBmiStep, waistClass, weightForBmi } from './bmi';

describe('bmi', () => {
  it('computes the index and finds its band (WHO adult bands)', () => {
    expect(bmiOf(103.5, 165)).toBeCloseTo(38.02, 2);
    expect(bmiBand(17).cls).toBe('under');
    expect(bmiBand(18.5).cls).toBe('normal');
    expect(bmiBand(24.99).cls).toBe('normal');
    expect(bmiBand(25).cls).toBe('over');
    expect(bmiBand(30).cls).toBe('obese1');
    expect(bmiBand(38).cls).toBe('obese2');
    expect(bmiBand(52).cls).toBe('obese3');
  });

  it('estimates an ideal weight from height, sex and age, and the band advised for an age', () => {
    // a man of 24 at 1.65 m: Lorentz 61.25 kg, Creff 60.66 kg
    expect(idealWeight('MALE', 24, 165)).toBeCloseTo(60.96, 1);
    // a woman is lighter at the same height, an older person a little heavier
    expect(idealWeight('FEMALE', 24, 165)).toBeLessThan(idealWeight('MALE', 24, 165));
    expect(idealWeight('MALE', 60, 165)).toBeGreaterThan(idealWeight('MALE', 24, 165));
    expect(idealWeight('OTHER', 24, 165)).toBeCloseTo((idealWeight('MALE', 24, 165) + idealWeight('FEMALE', 24, 165)) / 2, 5);
    expect(ageBmiRange(24)).toEqual({ from: 19, to: 24 });
    expect(ageBmiRange(40)).toEqual({ from: 21, to: 26 });
    expect(ageBmiRange(70)).toEqual({ from: 24, to: 29 });
  });

  it('reads the waist against the height, and the body fat by sex', () => {
    // 84.5 cm at 1.70 m: 0.497, healthy; a muscular 100 kg man with an 80 cm waist at 1.80 m too
    expect(waistClass(84.5, 170)).toBe('healthy');
    expect(waistClass(80, 180)).toBe('healthy');
    expect(waistClass(95, 170)).toBe('raised');
    expect(waistClass(110, 170)).toBe('high');
    expect(waistClass(65, 170)).toBe('thin');
    expect(bodyFatClass('MALE', 12)).toBe('athletic');
    expect(bodyFatClass('FEMALE', 12)).toBe('low');
    expect(bodyFatClass('FEMALE', 27)).toBe('average');
    expect(bodyFatClass('MALE', 27)).toBe('high');
  });

  it('gives the next step towards the healthy band', () => {
    // 38 at 1.65 m: under 35 means 95.2 kg, so 95.1
    const step = nextBmiStep(38, 165)!;
    expect(step.threshold).toBe(35);
    expect(step.cls).toBe('obese1');
    expect(step.weightKg).toBeCloseTo(weightForBmi(35, 165) - 0.1, 5);
    expect(nextBmiStep(22, 165)).toBeNull();
    expect(nextBmiStep(17, 165)!.cls).toBe('normal');
  });
});
