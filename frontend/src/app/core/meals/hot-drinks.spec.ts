import { DrinkChoice, HOT_DRINKS, MILKS, drinkTotal, hotDrink } from './hot-drinks';
import { drinkScore } from './nutriscore';

const choice = (c: Partial<DrinkChoice>): DrinkChoice => ({ format: '', milk: 'semi', dash: false, sugars: 0, extras: [], ...c });

describe('hot drinks', () => {
  it('adds the milk, the sugar and the extras', () => {
    const coffee = hotDrink('coffee')!;
    expect(drinkTotal(coffee, choice({ format: 'espresso' })).kcal).toBe(1);
    // a latte: an espresso and 220 ml of semi-skimmed milk
    const latte = drinkTotal(coffee, choice({ format: 'latte' }));
    expect(latte.milkMl).toBe(220);
    expect(Math.round(latte.kcal)).toBe(1 + Math.round(2.2 * 46));
    // oat milk, a sugar and a syrup
    const sweet = drinkTotal(coffee, choice({ format: 'cappuccino', milk: 'oat', sugars: 1, extras: ['syrup'] }));
    expect(Math.round(sweet.kcal)).toBe(Math.round(1 + 1.2 * 46 + 20 + 33));
    // a dash of milk only where there is none
    expect(drinkTotal(coffee, choice({ format: 'long', dash: true })).milkMl).toBe(20);
    expect(drinkTotal(coffee, choice({ format: 'latte', dash: true })).milkMl).toBe(220);
    expect(drinkTotal(hotDrink('infusion')!, choice({ format: 'cup', dash: true })).milkMl).toBe(0);
  });

  it('grades on the beverages’ scale, per 100 ml of the cup', () => {
    // milk itself: semi-skimmed B, whole C (2023)
    expect(drinkScore(MILKS.semi)).toBe('b');
    expect(drinkScore(MILKS.whole)).toBe('c');
    const coffee = hotDrink('coffee')!;
    // a black coffee: B (A is for water only); a sugar in an espresso is a very sweet little drink
    expect(drinkTotal(coffee, choice({ format: 'espresso' })).grade).toBe('b');
    expect(drinkTotal(coffee, choice({ format: 'espresso', sugars: 1 })).grade).toBe('e');
    expect(drinkTotal(coffee, choice({ format: 'latte' })).grade).toBe('b');
    expect(drinkTotal(coffee, choice({ format: 'latte', milk: 'whole' })).grade).toBe('c');
    expect(drinkTotal(hotDrink('tea')!, choice({ format: 'cup' })).grade).toBe('b');
    expect(drinkTotal(hotDrink('infusion')!, choice({ format: 'cup', extras: ['honey'] })).grade).toBe('c');
  });

  it('keeps every cup plausible: calories match the macros (±25 %)', () => {
    for (const d of HOT_DRINKS) {
      for (const f of d.formats) {
        const t = drinkTotal(d, choice({ format: f.key, sugars: 1 }));
        const fromMacros = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
        expect(Math.abs(fromMacros - t.kcal) / t.kcal, d.key + ' ' + f.key).toBeLessThan(0.25);
      }
    }
  });
});
