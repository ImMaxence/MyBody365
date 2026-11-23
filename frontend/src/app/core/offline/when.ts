import type { I18nService } from '../i18n/i18n.service';
import { localDay } from '../tracking/tracking.store';

/** « 14:32 » */
export function clockOf(at: number, i18n: I18nService): string {
  return new Date(at).toLocaleTimeString(i18n.lang() === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** 1.18: « 14:32 » today, « hier 22:10 », « 21 nov. 22:10 » before */
export function whenOf(at: number, i18n: I18nService): string {
  const day = localDay(new Date(at));
  const clock = clockOf(at, i18n);
  if (day === localDay()) return clock;
  if (day === localDay(new Date(Date.now() - 86_400_000))) return `${i18n.t('meals.yesterday').toLowerCase()} ${clock}`;
  return `${i18n.date(day, { day: 'numeric', month: 'short' })} ${clock}`;
}

/** 1.18: how long it lasted: « 40 s », « 12 min », « 1 h 05 », « 2 jours » */
export function spanOf(ms: number, i18n: I18nService): string {
  const en = i18n.lang() === 'en';
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${String(min % 60).padStart(2, '0')}` : `${h} h`;
  const d = Math.round(h / 24);
  return en ? `${d} ${d === 1 ? 'day' : 'days'}` : `${d} ${d === 1 ? 'jour' : 'jours'}`;
}
