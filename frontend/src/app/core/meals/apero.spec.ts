import { APERO, aperoDrink, aperoTotal } from './apero';

describe('apéro', () => {
  it('counts the glasses of a beer, its alcohol in standard drinks, and gives no Nutri-Score to alcohol', () => {
    const beer = aperoDrink('beer')!;
    const t = aperoTotal(beer, { item: 'blonde', size: 'c33', mixer: 'none', count: 2 });
    // 2 × 33 cl at 39 kcal per 100 ml (Ciqual)
    expect(Math.round(t.kcal)).toBe(257);
    expect(t.ml).toBe(660);
    // 660 ml at 5 %: 26 g of alcohol, 2.6 standard drinks
    expect(Math.round(t.alcoholG)).toBe(26);
    expect(t.standard).toBeCloseTo(2.6, 1);
    expect(t.grade).toBeNull();
  });

  it('adds the mixer of a spirit, and grades the drinks without alcohol on the beverages scale', () => {
    const spirit = aperoDrink('spirit')!;
    const neat = aperoTotal(spirit, { item: 'rum', size: 'single', mixer: 'none', count: 1 });
    const coke = aperoTotal(spirit, { item: 'rum', size: 'single', mixer: 'cola', count: 1 });
    expect(Math.round(coke.kcal - neat.kcal)).toBe(60);
    expect(coke.sugarsG).toBe(15);
    expect(coke.grade).toBeNull();

    const mocktail = aperoTotal(aperoDrink('mocktail')!, { item: 'virginMojito', size: '', mixer: 'none', count: 1 });
    expect(mocktail.alcoholG).toBe(0);
    expect(mocktail.grade).not.toBeNull();
    // the alcohol-free beer is graded too (under 1.2 %)
    expect(aperoTotal(aperoDrink('beer')!, { item: 'free', size: 'demi', mixer: 'none', count: 1 }).grade).not.toBeNull();
  });

  it('serves each cocktail in its own glass', () => {
    const cocktail = aperoDrink('cocktail')!;
    expect(cocktail.sizes).toEqual([]);
    for (const it of cocktail.items) expect(it.servingMl).toBeGreaterThan(0);
    const mojito = aperoTotal(cocktail, { item: 'mojito', size: '', mixer: 'none', count: 1 });
    expect(mojito.ml).toBe(250);
    expect(Math.round(mojito.kcal)).toBe(180);
    expect(APERO.map((d) => d.key)).toEqual(['beer', 'wine', 'bubbles', 'cocktail', 'spirit', 'cider', 'mocktail']);
  });
});
