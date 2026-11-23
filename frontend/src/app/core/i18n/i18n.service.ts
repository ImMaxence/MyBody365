import { DOCUMENT, Injectable, InjectionToken, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { fr, type AppDictionary, type CoreDictionary, type Dictionary } from './locales/fr';

/**
 * The English texts, given at once where the size of the bundle does not matter (the server, which
 * prerenders /en). In the browser they are a file of their own, loaded the first time English is needed.
 */
export const ENGLISH = new InjectionToken<CoreDictionary>('english texts');
/** 1.20: the texts of the app's own screens, given at once on the server (a file of their own in the browser) */
export const FRENCH_APP = new InjectionToken<AppDictionary>('french texts of the app');
export const ENGLISH_APP = new InjectionToken<AppDictionary>('english texts of the app');

export type Lang = 'fr' | 'en';
type Params = Record<string, string | number>;

const LANG_KEY = 'mb.lang';

/** Runtime i18n on signals: the active language drives every template through the `t` pipe. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly lang = signal<Lang>('fr');
  private readonly english = signal<CoreDictionary | null>(inject(ENGLISH, { optional: true }));
  private loading: Promise<void> | null = null;
  /** 1.20: the texts of the app's own screens, in each language, once their file is there */
  private readonly frenchApp = signal<AppDictionary | null>(inject(FRENCH_APP, { optional: true }));
  private readonly englishApp = signal<AppDictionary | null>(inject(ENGLISH_APP, { optional: true }));
  private appLoading: Partial<Record<Lang, Promise<void>>> = {};
  /** the app's screens were opened: a change of language brings their texts in the new one too */
  private appWanted = false;
  /** English once its file is there (French for the instant it takes); the app's texts once loaded */
  readonly dict = computed<Dictionary>(() => {
    const en = this.lang() === 'en';
    const core = en ? (this.english() ?? fr) : fr;
    const app = en ? (this.englishApp() ?? this.frenchApp()) : this.frenchApp();
    return (app ? { ...core, ...app } : core) as Dictionary;
  });
  readonly locale = computed(() => (this.lang() === 'fr' ? 'fr-FR' : 'en-GB'));
  readonly other = computed<Lang>(() => (this.lang() === 'fr' ? 'en' : 'fr'));

  /** The language the app should use when no page imposes one: saved choice, then the device. */
  preferred(): Lang {
    return this.chosen() ?? this.device();
  }

  /** 1.14: the language chosen on this device (null: none yet) */
  chosen(): Lang | null {
    if (!this.browser) return null;
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'fr' || saved === 'en') return saved;
    } catch {
      /* storage blocked */
    }
    return null;
  }

  /** 1.14: the language of the browser or the system, among the app's (French for any French, English otherwise) */
  device(): Lang {
    if (!this.browser) return 'fr';
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'fr'];
    const first = langs.map((l) => l.toLowerCase()).find((l) => l.startsWith('fr') || l.startsWith('en'));
    return first ? (first.startsWith('fr') ? 'fr' : 'en') : 'en';
  }

  /**
   * 1.20: the texts of the app's own screens in the language on screen (the app's routes wait for them, guard appTexts).
   * English ones that cannot load (offline before they were ever kept) fall back on the French ones.
   */
  loadApp(lang: Lang = this.lang()): Promise<void> {
    this.appWanted = true;
    const has = lang === 'en' ? this.englishApp() : this.frenchApp();
    if (has) return Promise.resolve();
    return (this.appLoading[lang] ??= (lang === 'en' ? import('./locales/en-app').then((m) => this.englishApp.set(m.enApp)) : import('./locales/fr-app').then((m) => this.frenchApp.set(m.frApp)))
      .catch(() => {
        this.appLoading[lang] = undefined;
        if (lang === 'en') return this.loadApp('fr');
        return undefined;
      }));
  }

  /** the texts of a language, ready (the app waits for them before its first screen) */
  load(lang: Lang): Promise<void> {
    if (this.appWanted) void this.loadApp(lang);
    if (lang !== 'en' || this.english()) return Promise.resolve();
    this.loading ??= import('./locales/en')
      .then((m) => this.english.set(m.en))
      .catch(() => {
        // offline before the file was ever kept: French for now, another try next time
        this.loading = null;
      });
    return this.loading;
  }

  set(lang: Lang, remember = false): void {
    void this.load(lang);
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
