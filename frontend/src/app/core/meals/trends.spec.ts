import type { MealStats } from '../api/models';
import { macroPlan } from './macro-plan';
import { trends } from './trends';

const week = (totals: MealStats['totals'], days = 7): MealStats => ({
  days: 7,
  from: '2026-11-10',
  to: '2026-11-16',
  daily: Array.from({ length: days }, (_, i) => ({ day: `2026-11-1${i}`, kcal: totals.kcal / days, proteinG: 0, carbsG: 0, fatG: 0, entries: 3 })),
  totals,
  topByCount: [],
  topByKcal: [],
  slots: [],
  grades: [],
  sugarSources: [{ name: 'Soda', times: 6, grams: 210 }],
});

describe('trends of the week', () => {
  it('says when there is too much sugar, and what brings it', () => {
    const t = trends(week({ kcal: 14000, sugarsG: 7 * 80, fiberG: 7 * 25, saltG: 7 * 5, satFatG: 7 * 15, proteinG: 7 * 110 }), macroPlan(2000, 'BALANCED', 70, 65));
    expect(t.map((x) => x.key)).toEqual(['sugars']);
    expect(t[0].value).toBe(80);
    expect(t[0].sources[0].name).toBe('Soda');
  });

  it('too little fibre or protein, too much salt or saturated fat', () => {
    const plan = macroPlan(1800, 'BALANCED', 80, 75);
    const t = trends(week({ kcal: 7 * 1800, sugarsG: 7 * 30, fiberG: 7 * 12, saltG: 7 * 9, satFatG: 7 * 35, proteinG: 7 * 60 }), plan);
    expect(t.map((x) => x.key)).toEqual(['salt', 'satFat', 'fiber']);
    expect(trends(week({ kcal: 7 * 1800, sugarsG: 7 * 30, fiberG: 7 * 28, saltG: 7 * 4, satFatG: 7 * 15, proteinG: 7 * 60 }), plan)[0].key).toBe('protein');
  });

  it('a balanced week, and nothing before 3 days', () => {
    const good = { kcal: 7 * 1800, sugarsG: 7 * 30, fiberG: 7 * 28, saltG: 7 * 4, satFatG: 7 * 15, proteinG: 7 * 120 };
    expect(trends(week(good), macroPlan(1800, 'BALANCED', 80, 75))[0].key).toBe('balanced');
    expect(trends(week(good, 2), null)).toEqual([]);
  });
});
