import { DOCUMENT, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { en } from './locales/en';
import { fr, type Dictionary } from './locales/fr';

export type Lang = 'fr' | 'en';
type Params = Record<string, string | number>;

const LANG_KEY = 'mb.lang';

/** Runtime i18n on signals: the active language drives every template through the `t` pipe. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly lang = signal<Lang>('fr');
  readonly dict = computed<Dictionary>(() => (this.lang() === 'en' ? en : fr));
  readonly locale = computed(() => (this.lang() === 'fr' ? 'fr-FR' : 'en-GB'));
  readonly other = computed<Lang>(() => (this.lang() === 'fr' ? 'en' : 'fr'));

  /** The language the app should use when no page imposes one: saved choice, then the device. */
  preferred(): Lang {
    if (!this.browser) return 'fr';
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'fr' || saved === 'en') return saved;
    } catch {
      /* storage blocked */
    }
    return (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }

  set(lang: Lang, remember = false): void {
    this.lang.set(lang);
    if (this.document.documentElement.lang !== lang) this.document.documentElement.lang = lang;
    if (remember && this.browser) {
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        /* storage blocked: the choice lasts for this visit */
      }
    }
  }

  /** Translates a dotted key with {placeholder} interpolation; unknown keys return the key itself. */
  t(key: string, params?: Params): string {
    const value = this.get<unknown>(key);
    if (typeof value !== 'string') return key;
    return params ? interpolate(value, params) : value;
  }

  /** Raw access for structured entries (arrays, nested maps). */
  get<T>(key: string): T {
    return key
      .split('.')
      .reduce<unknown>(
        (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
        this.dict(),
      ) as T;
  }

  /** The translated message of an API error code, or the generic one. */
  error(code: string | null | undefined): string {
    const v = code ? this.get<unknown>(`errors.${code}`) : null;
    return typeof v === 'string' ? v : this.t('errors.generic');
  }

  date(iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return new Intl.DateTimeFormat(this.locale(), options).format(d);
  }

  dateTime(iso: string | null | undefined): string {
    return this.date(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  /** "il y a 3 h", "in 2 days"… */
  relative(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) return '';
    const diff = new Date(iso).getTime() - now;
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(this.locale(), { numeric: 'auto' });
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ['day', 86_400_000],
      ['hour', 3_600_000],
      ['minute', 60_000],
    ];
    for (const [unit, ms] of units) {
      if (abs >= ms || unit === 'minute') return rtf.format(Math.round(diff / ms), unit);
    }
    return '';
  }

  number(n: number, digits = 0): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  }
}

export function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}
