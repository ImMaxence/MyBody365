import { DISHES, DRINKS, dish, estimate, gradeOf } from './fast-food';

describe('fast food estimates', () => {
  it('adds the dish, the fries, the extras and the drink', () => {
    const kebab = dish('kebab')!;
    const e = estimate(kebab, 'sandwich', 'medium', ['sauce'], 'cola');
    expect(e.lines.map((l) => l.portion.key)).toEqual(['sandwich', 'medium', 'sauce', 'cola']);
    expect(e.total.kcal).toBe(700 + 340 + 100 + 139);
    expect(e.total.carbsG).toBe(68 + 43 + 3 + 35);
  });

  it('1.16: sushi by the piece, soy sauces with them and with a poke bowl only', () => {
    const sushi = dish('sushi')!;
    // 9 pieces: one and a half times 6
    const nine = estimate(sushi, 'p12', 'none', ['soy'], 'none', undefined, 1, 9);
    expect(nine.lines.map((l) => l.portion.key)).toEqual(['pieces', 'soy']);
    expect(nine.lines[0].portion.kcal).toBe(375);
    expect(nine.lines[0].portion.grams).toBe(225);
    // the salt of a tablespoon of soy sauce counts
    expect(nine.lines[1].portion.saltG).toBe(2.2);
    // the shortcuts are worth what they say
    expect(estimate(sushi, 'p12', 'none', [], 'none', undefined, 1, 12).total.kcal).toBe(500);
    const salad = dish('salad')!;
    expect(estimate(salad, 'poke', 'none', ['soySweet'], 'none').lines.map((l) => l.portion.key)).toEqual(['poke', 'soySweet']);
    // a Caesar salad has no soy sauce on offer, even ticked before switching
    expect(estimate(salad, 'caesar', 'none', ['soySweet'], 'none').lines).toHaveLength(1);
  });

  it('1.17: sushi by kind (a sashimi about half a nigiri), soy sauce by the spoon', () => {
    const sushi = dish('sushi')!;
    // the assortment stays the formats' own average
    expect(estimate(sushi, 'p12', 'none', [], 'none', undefined, 1, 12, 'mix').total.kcal).toBe(500);
    const nigiri = estimate(sushi, 'p6', 'none', [], 'none', undefined, 1, 6, 'nigiri').total.kcal;
    const sashimi = estimate(sushi, 'p6', 'none', [], 'none', undefined, 1, 6, 'sashimi').total.kcal;
    expect(nigiri).toBe(6 * 58);
    expect(sashimi).toBe(6 * 32);
    // two spoons of salty soy: twice the salt, three at most
    const two = estimate(sushi, 'p6', 'none', ['soy', 'soy'], 'none', undefined, 1, 6);
    expect(two.lines[1].portion.saltG).toBe(4.4);
    expect(estimate(sushi, 'p6', 'none', ['soy', 'soy', 'soy', 'soy'], 'none', undefined, 1, 6).lines[1].portion.kcal).toBe(21);
  });

  it('1.17: nuggets, tenders, wings and fried chicken by the piece', () => {
    expect(estimate(dish('nuggets')!, 'n6', 'none', [], 'none', undefined, 1, 9).total.kcal).toBe(Math.round(170 * (9 / 4)));
    expect(estimate(dish('tenders')!, 't3', 'medium', ['dip'], 'none', undefined, 1, 4).total.kcal).toBe(460 + 340 + 50);
    expect(estimate(dish('wings')!, 'w4', 'none', [], 'none', undefined, 1, 4).total.kcal).toBe(340);
    // fried and ultra-processed: a low health score
    expect(estimate(dish('tenders')!, 't3', 'none', [], 'none', undefined, 1, 3).health!).toBeLessThan(5);
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

  it('a choice changes the dish, scaled to its size: tacos without cheese sauce, pizza on a cream base', () => {
    const tacos = dish('tacos')!;
    const m = estimate(tacos, 'm', 'none', [], 'none').total.kcal;
    expect(estimate(tacos, 'm', 'none', [], 'none', 'without').total.kcal).toBe(m - 180);
    // an XL holds twice as much
    const xl = estimate(tacos, 'xl', 'none', [], 'none').total.kcal;
    expect(estimate(tacos, 'xl', 'none', [], 'none', 'without').total.kcal).toBe(xl - 360);
    // the sauces of a tacos, to tick
    expect(estimate(tacos, 'm', 'none', ['algerienne', 'blanche'], 'none').total.kcal).toBe(m + 110 + 75);
    const pizza = dish('pizza')!;
    expect(estimate(pizza, 'whole', 'none', [], 'none', 'cream').total.kcal).toBe(1040 + 175);
    expect(estimate(pizza, 'half', 'none', [], 'none', 'cream').total.kcal).toBe(520 + Math.round(175 / 2));
    // still graded, with its own values
    expect(estimate(tacos, 'm', 'none', [], 'none', 'without').grade).not.toBeNull();
  });

  it('the share eaten of a dish one may not finish (pizzas have their slices)', () => {
    const kebab = dish('kebab')!;
    // half the sandwich, all the fries
    expect(estimate(kebab, 'sandwich', 'medium', [], 'none', undefined, 0.5).total.kcal).toBe(350 + 340);
    expect(estimate(kebab, 'sandwich', 'none', [], 'none', undefined, 0.5).grade).toBe(estimate(kebab, 'sandwich', 'none', [], 'none').grade);
    // a quarter of an M tacos without its cheese sauce
    expect(estimate(dish('tacos')!, 'm', 'none', [], 'none', 'without', 0.25).total.kcal).toBe(Math.round((950 - 180) * 0.25));
    expect(dish('pizza')!.share).toBeFalsy();
  });

  it('keeps every portion plausible: calories match the macros (±25 %)', () => {
    for (const p of [...DISHES.flatMap((d) => [...d.formats, ...d.extras]), ...DRINKS]) {
      const fromMacros = p.proteinG * 4 + p.carbsG * 4 + p.fatG * 9;
      if (p.kcal < 20 || p.key === 'beer') continue;
      expect(Math.abs(fromMacros - p.kcal) / p.kcal, p.key).toBeLessThan(0.25);
    }
  });
});
