import { SWEETS, sweetGroup, sweetTotal } from './sweets';
import { fr } from '../i18n/locales/fr';
import { en } from '../i18n/locales/en';

describe('pastries and chocolates (1.18)', () => {
  it('counts a croissant, two squares of dark chocolate and five chocolate almonds from their weight', () => {
    const croissant = sweetGroup('viennoiserie')!.items.find((x) => x.key === 'croissant')!;
    // 60 g at 420 kcal per 100 g (Ciqual 7620)
    expect(Math.round(sweetTotal(croissant, 1).kcal)).toBe(252);
    const dark = sweetGroup('chocolate')!.items.find((x) => x.key === 'dark')!;
    const two = sweetTotal(dark, 2);
    expect(two.grams).toBe(10);
    expect(Math.round(two.kcal)).toBe(59);
    const almonds = sweetGroup('chocolate')!.items.find((x) => x.key === 'almonds')!;
    expect(Math.round(sweetTotal(almonds, 5).kcal)).toBe(113);
  });

  it('gives every item a health score, a weight and a usual count, and a pastry scores below a dark chocolate square', () => {
    for (const g of SWEETS) {
      expect(g.items.find((x) => x.key === g.usual)).toBeTruthy();
      for (const x of g.items) {
        expect(x.g).toBeGreaterThan(0);
        expect(x.usual ?? 1).toBeGreaterThanOrEqual(1);
        const h = sweetTotal(x, 1).health;
        expect(h).not.toBeNull();
        expect(h!).toBeGreaterThanOrEqual(0);
        expect(h!).toBeLessThanOrEqual(10);
      }
    }
    const gummies = sweetTotal(sweetGroup('candy')!.items[0], 1).health!;
    const dark = sweetTotal(sweetGroup('chocolate')!.items[0], 1).health!;
    expect(gummies).toBeLessThan(dark);
  });

  it('has a name in French and in English for every group and item', () => {
    const frSweets = (fr as unknown as { meals: { sweets: { groups: Record<string, string>; items: Record<string, string> } } }).meals.sweets;
    const enSweets = (en as unknown as { meals: { sweets: { groups: Record<string, string>; items: Record<string, string> } } }).meals.sweets;
    for (const g of SWEETS) {
      expect(frSweets.groups[g.key]).toBeTruthy();
      expect(enSweets.groups[g.key]).toBeTruthy();
      for (const x of g.items) {
        expect(frSweets.items[x.key], x.key).toBeTruthy();
        expect(enSweets.items[x.key], x.key).toBeTruthy();
      }
    }
  });
});
