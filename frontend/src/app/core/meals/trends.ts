import type { MealStats, NutrientSource } from '../api/models';
import type { MacroPlan } from './macro-plan';

/**
 * What stands out in the last 7 days, the most useful first: too much sugar, salt or saturated fat (with the
 * foods that brought the most), too little fibre or protein, or a balanced week. Averages over the days logged,
 * from 3 days on (fewer say nothing yet). Guides (core/meals/sources.ts): the WHO's for sugars (under 50 g a day),
 * salt (under 5 g, 1.19: it said 6 g, the European labelling figure, while the rest of the app said the WHO's 5 g) and
 * saturated fat (under 10 % of the calories, 1.19: was 12 %, the Anses figure), the Anses's for fibre (about 30 g).
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
/** the WHO's: salt under 5 g a day, saturated fat under 10 % of the calories */
export const SALT_MAX = 5;
export const SAT_FAT_SHARE = 0.1;

export function trends(s: MealStats | null, plan: MacroPlan | null): Trend[] {
  const n = s?.daily.length ?? 0;
  if (!s || n < MIN_DAYS) return [];
  const per = (v?: number) => (v == null ? null : v / n);
  const out: Trend[] = [];
  // 1.20: the free sugars (estimated from what each food is), the total sugars for a server that does not say them
  const sugars = per(s.freeSugarsG ?? s.totals.sugarsG);
  if (sugars != null && sugars > 50) out.push({ key: 'sugars', tone: 'warn', value: Math.round(sugars), guide: 50, sources: s.sugarSources ?? [] });
  const salt = per(s.totals.saltG);
  if (salt != null && salt > SALT_MAX) out.push({ key: 'salt', tone: 'warn', value: Math.round(salt * 10) / 10, guide: SALT_MAX, sources: s.saltSources ?? [] });
  const satFat = per(s.totals.satFatG);
  const kcal = s.totals.kcal / n;
  if (satFat != null && kcal > 0 && (satFat * 9) / kcal > SAT_FAT_SHARE) {
    out.push({ key: 'satFat', tone: 'warn', value: Math.round(satFat), guide: Math.round((kcal * SAT_FAT_SHARE) / 9), sources: s.satFatSources ?? [] });
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
