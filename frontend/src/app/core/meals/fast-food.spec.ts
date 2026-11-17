import { DISHES, DRINKS, dish, estimate, gradeOf } from './fast-food';

describe('fast food estimates', () => {
  it('adds the dish, the fries, the extras and the drink', () => {
    const kebab = dish('kebab')!;
    const e = estimate(kebab, 'sandwich', 'medium', ['sauce'], 'cola');
    expect(e.lines.map((l) => l.portion.key)).toEqual(['sandwich', 'medium', 'sauce', 'cola']);
    expect(e.total.kcal).toBe(700 + 340 + 100 + 139);
    expect(e.total.carbsG).toBe(68 + 43 + 3 + 35);
  });

  it('leaves out what was not taken, and fries where they do not apply', () => {
    expect(estimate(dish('kebab')!, 'plate', 'none', [], 'none').lines).toHaveLength(1);
    // French tacos come with their fries inside
    expect(estimate(dish('tacos')!, 'm', 'large', [], 'water').lines.map((l) => l.kind)).toEqual(['main', 'drink']);
  });

  it('grades each part and the meal (weighted by calories)', () => {
    const g = (d: string, f: string) => gradeOf(dish(d)!.formats.find((x) => x.key === f)!);
    // a Big Mac style burger: D, a kebab sandwich: C, a mixed salad and a poke bowl: B
    expect(g('burger', 'classic')).toBe('d');
    expect(g('kebab', 'sandwich')).toBe('c');
    expect(g('salad', 'mixed')).toBe('b');
    expect(g('salad', 'poke')).toBe('b');
    // drinks on their own scale; beer is not graded
    expect(gradeOf(DRINKS.find((x) => x.key === 'cola')!)).toBe('e');
    expect(gradeOf(DRINKS.find((x) => x.key === 'water')!)).toBe('a');
    expect(gradeOf(DRINKS.find((x) => x.key === 'beer')!)).toBeNull();
    // kebab C (700) + fries C (340) + Coke E (139): C overall
    expect(estimate(dish('kebab')!, 'sandwich', 'medium', [], 'cola').grade).toBe('c');
    // a grade for every dish format, so the meal always gets one
    expect(DISHES.flatMap((d) => d.formats).every((f) => gradeOf(f) !== null)).toBe(true);
  });

  it('keeps every portion plausible: calories match the macros (±25 %)', () => {
    for (const p of [...DISHES.flatMap((d) => [...d.formats, ...d.extras]), ...DRINKS]) {
      const fromMacros = p.proteinG * 4 + p.carbsG * 4 + p.fatG * 9;
      if (p.kcal < 20 || p.key === 'beer') continue;
      expect(Math.abs(fromMacros - p.kcal) / p.kcal, p.key).toBeLessThan(0.25);
    }
  });
});
