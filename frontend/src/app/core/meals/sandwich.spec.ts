import { BREADS, INGREDIENTS, PRESETS, bread, ingredient, portionKcal, sandwichHealth, totals } from './sandwich';

describe('sandwich made up (1.17)', () => {
  it('adds the bread and each portion inside, the share eaten applied', () => {
    // half a baguette (125 g at 270 kcal) + 2 slices of ham (2 × 40 g at 115) + a knob of butter (10 g at 745)
    const t = totals('baguette', 'half', { ham: 2, butter: 1 });
    expect(t.kcal).toBe(Math.round(337.5 + 92 + 74.5));
    expect(t.grams).toBe(125 + 80 + 10);
    expect(totals('baguette', 'half', { ham: 2, butter: 1 }, [], 0.5).kcal).toBe(Math.round(t.kcal / 2));
    // a raw food of the table by the gram
    const withPepper = totals('baguette', 'half', {}, [{ id: 'x', name: 'Poivron', grams: 50, per100: { kcal: 30, proteinG: 1, carbsG: 5, fatG: 0.3 } }]);
    expect(withPepper.kcal).toBe(Math.round(337.5 + 15));
  });

  it('the raclette classic is there, and every classic uses known bread and ingredients', () => {
    expect(PRESETS.some((p) => p.key === 'raclette' && p.filling['raclette'] > 0)).toBe(true);
    for (const p of PRESETS) {
      expect(bread(p.bread).key).toBe(p.bread);
      expect(bread(p.bread).sizes.some((s) => s.key === p.size), p.key).toBe(true);
      for (const k of Object.keys(p.filling)) expect(ingredient(k), k).toBeDefined();
    }
  });

  it('keeps every value plausible: calories match the macros (±15 %)', () => {
    for (const x of [...BREADS.map((b) => ({ key: b.key, per100: b.per100 })), ...INGREDIENTS]) {
      const [kcal, p, c, f, , , , fib] = x.per100;
      if (kcal < 50) continue;
      const fromMacros = p * 4 + c * 4 + f * 9 + fib * 2;
      expect(Math.abs(fromMacros - kcal) / kcal, x.key).toBeLessThan(0.15);
    }
    expect(portionKcal(ingredient('raclette')!, 2)).toBe(210);
  });

  it('grades the sandwich: vegetables and wholemeal bread score better than cheese and bacon on sliced bread', () => {
    const veggie = sandwichHealth('cereal', 'half', { chicken: 1, lettuce: 2, tomato: 2, cucumber: 1 })!;
    const rich = sandwichHealth('sliced', 's3', { cheddar: 3, bacon: 4, mayo: 2 })!;
    expect(veggie).toBeGreaterThan(rich);
  });
});
