import { bmiBand, bmiOf, nextBmiStep, weightForBmi } from './bmi';

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
