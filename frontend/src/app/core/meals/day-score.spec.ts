import type { MealDay, MealEntry } from '../api/models';
import { monthlyForecast } from '../../features/app/monthly-forecast.component';
import { dayScore } from './day-score';

function entry(kcal: number, grade?: string): MealEntry {
  return { id: String(Math.random()), day: '2026-11-10', slot: 'LUNCH', name: 'x', nutrients: { kcal }, nutriscore: grade } as unknown as MealEntry;
}

function day(over: Partial<MealDay['totals']>, entries: MealEntry[], d = '2026-11-10', target = 2000): MealDay {
  return { day: d, targetKcal: target, totals: { kcal: 2000, ...over }, entries } as MealDay;
}

describe('day score', () => {
  const today = '2026-11-16';

  it('gives 10 to a balanced day', () => {
    // 2000 kcal: 125 g protein (25 %), 225 g carbs (45 %), 67 g fat (30 %), rated A, good nutrients
    const s = dayScore(day({ proteinG: 125, carbsG: 225, fatG: 66.7, fiberG: 30, sugarsG: 40, saltG: 4, satFatG: 18 }, [entry(2000, 'a')]), today)!;
    expect(s.score).toBe(10);
    expect(s.band).toBe('good');
    expect(s.parts.map((p) => p.key)).toEqual(['kcal', 'macros', 'quality', 'nutrients']);
  });

  it('marks down too much, unbalanced and poorly rated food', () => {
    const s = dayScore(day({ kcal: 3200, proteinG: 60, carbsG: 300, fatG: 180, sugarsG: 120, saltG: 9, satFatG: 70 }, [entry(3200, 'e')]), today)!;
    expect(s.score).toBeLessThan(3);
    expect(s.band).toBe('poor');
  });

  it('leaves out what is not known and does not judge a day in progress for being under', () => {
    const s = dayScore(day({ kcal: 900, proteinG: 56, carbsG: 101, fatG: 30 }, [entry(900)]), today)!;
    expect(s.ongoing).toBe(false);
    expect(s.parts.map((p) => p.key)).toEqual(['kcal', 'macros']);
    // today: neither the calories under the target nor the macros of a single meal, nothing else known
    expect(dayScore(day({ kcal: 900, proteinG: 56, carbsG: 101, fatG: 30 }, [entry(900)], today), today)).toBeNull();
    expect(dayScore(day({}, []), today)).toBeNull();
  });

  it('never goes up today with crisps that reach the target (1.9)', () => {
    // a balanced lunch rated B, rich in protein
    const lunch = dayScore(day({ kcal: 1300, proteinG: 110, carbsG: 120, fatG: 40, sugarsG: 12, saltG: 2, satFatG: 9 }, [entry(1300, 'b')], today), today)!;
    // then a big bag of crisps rated D: the target is reached, the fat « balances » the macros
    const crisps = dayScore(
      day({ kcal: 2000, proteinG: 118, carbsG: 190, fatG: 85, sugarsG: 15, saltG: 3.5, satFatG: 14 }, [entry(1300, 'b'), entry(700, 'd')], today),
      today,
    )!;
    expect(lunch.parts.map((p) => p.key)).toEqual(['quality', 'nutrients']);
    expect(crisps.score).toBeLessThan(lunch.score);
    // well over the target, today already: the calories count
    const over = dayScore(day({ kcal: 2600, sugarsG: 20, saltG: 3, satFatG: 15 }, [entry(2600, 'b')], today), today)!;
    expect(over.parts.map((p) => p.key)).toContain('kcal');
  });
});

describe('monthly forecast', () => {
  it('goes month by month to the goal and says when it is reached', () => {
    // 80 → 76 kg at 0.5 kg a week from 16 November: 8 weeks, around 11 January
    const rows = monthlyForecast(80, 76, 0.5, '2026-11-16');
    expect(rows.map((r) => r.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(rows[0].change).toBeCloseTo(-1, 0);
    expect(rows.at(-1)!.kg).toBe(76);
    expect(rows.at(-1)!.reachedOn).toBe('2027-01-11');
    expect(rows.at(-1)!.progress).toBe(1);
  });

  it('works the other way for a gain, and gives nothing without a pace', () => {
    const rows = monthlyForecast(60, 62, 0.25, '2026-11-16');
    expect(rows[0].change).toBeGreaterThan(0);
    expect(rows.at(-1)!.kg).toBe(62);
    expect(monthlyForecast(70, 70, 0.5)).toEqual([]);
    expect(monthlyForecast(80, 70, 0)).toEqual([]);
  });
});
