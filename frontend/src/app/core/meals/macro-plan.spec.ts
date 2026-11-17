import { macroPlan } from './macro-plan';

describe('macro plan', () => {
  it('counts protein by the kilo of the lower weight, fat at 30 %, carbs for the rest', () => {
    // 1 600 kcal, 95 kg aiming at 80 kg: 1.6 g × 80 kg = 128 g (25 % would give only 100 g)
    const p = macroPlan(1600, 'BALANCED', 95, 80);
    expect(p.refKg).toBe(80);
    expect(p.proteinG).toBe(128);
    expect(p.fatG).toBe(Math.round((1600 * 0.3) / 9));
    expect(p.proteinG * 4 + p.carbsG * 4 + p.fatG * 9).toBeGreaterThan(1580);
    expect(p.shares.p + p.shares.c + p.shares.f).toBe(100);
    expect(p.fiberG).toBe(30);
    // gaining: the current weight counts
    expect(macroPlan(2600, 'BALANCED', 60, 66).refKg).toBe(60);
  });

  it('keeps protein within bounds, and without a weight falls back to 25 %', () => {
    // a small target and a heavy goal: protein stops at 35 % of the calories
    expect(macroPlan(1400, 'BALANCED', 130, 110).shares.p).toBe(35);
    expect(macroPlan(2000, 'BALANCED').proteinG).toBe(125);
  });

  it('more protein, or fewer carbs (25 %, the fat taking the rest up to 45 %)', () => {
    const hi = macroPlan(1800, 'PROTEIN', 70, 65);
    expect(hi.proteinG).toBe(130);
    const low = macroPlan(1800, 'LOW_CARB', 70, 65);
    expect(low.shares.c).toBeGreaterThanOrEqual(25);
    expect(low.shares.f).toBeLessThanOrEqual(45);
    expect(low.carbsG).toBeLessThan(macroPlan(1800, 'BALANCED', 70, 65).carbsG);
  });
});
