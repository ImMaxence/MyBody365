import type { MealStats } from '../api/models';
import { macroPlan } from './macro-plan';
import { trends } from './trends';
import { sourcesFor } from './sources';

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

  it('the WHO’s guides (1.19): salt over 5 g a day, saturated fat over 10 % of the calories, each with its source', () => {
    const plan = macroPlan(2000, 'BALANCED', 70, 65);
    // 5.5 g of salt, 24 g of saturated fat for 2 000 kcal (10.8 %): both said, which the 6 g and 12 % of before let pass
    const t = trends(week({ kcal: 7 * 2000, sugarsG: 7 * 30, fiberG: 7 * 28, saltG: 7 * 5.5, satFatG: 7 * 24, proteinG: 7 * 120 }), plan);
    expect(t.map((x) => [x.key, x.guide])).toEqual([
      ['salt', 5],
      ['satFat', 22],
    ]);
    expect(sourcesFor(t.map((x) => x.key))).toEqual(['who', 'whoSalt']);
    expect(sourcesFor(['sugars', 'fiber'])).toEqual(['who', 'sugarsNote', 'ansesFibre']);
    // right at the guide: nothing to say
    expect(trends(week({ kcal: 7 * 2000, sugarsG: 7 * 30, fiberG: 7 * 28, saltG: 7 * 5, satFatG: 7 * 22, proteinG: 7 * 120 }), plan)[0].key).toBe('balanced');
  });

  it('a balanced week, and nothing before 3 days', () => {
    const good = { kcal: 7 * 1800, sugarsG: 7 * 30, fiberG: 7 * 28, saltG: 7 * 4, satFatG: 7 * 15, proteinG: 7 * 120 };
    expect(trends(week(good), macroPlan(1800, 'BALANCED', 80, 75))[0].key).toBe('balanced');
    expect(trends(week(good, 2), null)).toEqual([]);
  });
});
