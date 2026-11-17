import type { MealStats, NutrientSource } from '../api/models';
import type { MacroPlan } from './macro-plan';

/**
 * What stands out in the last 7 days, the most useful first: too much sugar, salt or saturated fat (with the
 * foods that brought the most), too little fibre or protein, or a balanced week. Averages over the days logged,
 * from 3 days on (fewer say nothing yet). Guides: sugars under 50 g a day, salt under 6 g, saturated fat under
 * 12 % of the calories, fibre about 30 g (Anses, WHO).
 */
export interface Trend {
  key: 'sugars' | 'salt' | 'satFat' | 'fiber' | 'protein' | 'balanced';
  tone: 'warn' | 'info' | 'good';
  /** the average per day (g), and the guide */
  value: number;
  guide: number;
  sources: NutrientSource[];
}

export const MIN_DAYS = 3;

export function trends(s: MealStats | null, plan: MacroPlan | null): Trend[] {
  const n = s?.daily.length ?? 0;
  if (!s || n < MIN_DAYS) return [];
  const per = (v?: number) => (v == null ? null : v / n);
  const out: Trend[] = [];
  const sugars = per(s.totals.sugarsG);
  if (sugars != null && sugars > 50) out.push({ key: 'sugars', tone: 'warn', value: Math.round(sugars), guide: 50, sources: s.sugarSources ?? [] });
  const salt = per(s.totals.saltG);
  if (salt != null && salt > 6) out.push({ key: 'salt', tone: 'warn', value: Math.round(salt * 10) / 10, guide: 6, sources: s.saltSources ?? [] });
  const satFat = per(s.totals.satFatG);
  const kcal = s.totals.kcal / n;
  if (satFat != null && kcal > 0 && (satFat * 9) / kcal > 0.12) {
    out.push({ key: 'satFat', tone: 'warn', value: Math.round(satFat), guide: Math.round((kcal * 0.12) / 9), sources: s.satFatSources ?? [] });
  }
  const fiber = per(s.totals.fiberG);
  if (fiber != null && fiber < 20) out.push({ key: 'fiber', tone: 'info', value: Math.round(fiber), guide: plan?.fiberG ?? 30, sources: [] });
  const protein = per(s.totals.proteinG);
  if (plan && protein != null && protein < plan.proteinG * 0.8) {
    out.push({ key: 'protein', tone: 'info', value: Math.round(protein), guide: plan.proteinG, sources: [] });
  }
  if (!out.length && sugars != null && fiber != null) out.push({ key: 'balanced', tone: 'good', value: Math.round(sugars), guide: 50, sources: [] });
  return out.slice(0, 3);
}

/** « Beaucoup de sucre : 74 g par jour en moyenne, le repère est moins de 50 g. Surtout : soda, pâte à tartiner » */
export function trendText(t: Trend, i18n: { t: (key: string, params?: Record<string, string | number>) => string; number: (n: number, digits?: number) => string }): string {
  const g = t.key === 'salt' ? i18n.number(t.value, 1) : i18n.number(t.value);
  const text = i18n.t('meals.trends.' + t.key, { g, guide: i18n.number(t.guide) });
  const from = t.sources.slice(0, 2).map((x) => x.name);
  return from.length ? `${text}. ${i18n.t('meals.trends.mostly', { from: from.join(', ') })}` : text;
}
