import { TestBed } from '@angular/core/testing';
import { I18nService, interpolate } from './i18n.service';
import { en as enCore } from './locales/en';
import { enApp } from './locales/en-app';
import { fr as frCore } from './locales/fr';
import { frApp } from './locales/fr-app';

// 1.20: the site's texts and the app's (two files each), checked as one dictionary
const fr = { ...frCore, ...frApp };
const en = { ...enCore, ...enApp };

/** every leaf path of a dictionary, arrays included ("landing.faq.0.q") */
function paths(o: unknown, prefix = ''): string[] {
  if (o === null || typeof o !== 'object') return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
}

describe('I18nService', () => {
  let i18n: I18nService;

  beforeEach(() => {
    i18n = TestBed.inject(I18nService);
    i18n.set('fr');
  });

  it('the texts of the app come in a file of their own, in the language on screen (1.20)', async () => {
    expect(i18n.t('plan.title')).toBe('plan.title');
    await i18n.loadApp();
    expect(i18n.t('plan.title')).toBe('Mon planning');
    expect(i18n.t('common.cancel')).toBe('Annuler');
    i18n.set('en');
    await i18n.load('en');
    await i18n.loadApp('en');
    expect(i18n.t('plan.title')).toBe('My meal plan');
    expect(i18n.t('common.cancel')).toBe('Cancel');
  });

  it('French and English have exactly the same texts', () => {
    expect(paths(en).sort()).toEqual(paths(fr).sort());
  });

  it('no key contains a dot (dots separate the parts of a key: "setup.paces.0.25" would never resolve)', () => {
    const dotted: string[] = [];
    const walk = (o: unknown, at: string) => {
      if (o === null || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (k.includes('.')) dotted.push(`${at}${k}`);
        walk(v, `${at}${k}/`);
      }
    };
    walk(fr, '');
    expect(dotted).toEqual([]);
  });

  it('no text is left empty', () => {
    for (const dict of [fr, en]) {
      const empty = paths(dict).filter((p) => {
        const v = p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict);
        return typeof v === 'string' && v.trim() === '';
      });
      expect(empty).toEqual([]);
    }
  });

  it('interface texts never end with a full stop (the legal pages keep theirs)', () => {
    for (const dict of [fr, en]) {
      const ending = paths(dict)
        .filter((p) => !p.startsWith('legal.'))
        .filter((p) => {
          const v = p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict);
          return typeof v === 'string' && /[^.]\.$/.test(v.trim());
        });
      expect(ending).toEqual([]);
    }
  });

  it('translates with placeholders and follows the language (English loaded the first time it is needed)', async () => {
    expect(i18n.t('onboarding.hello', { name: 'Léa' })).toBe('Salut Léa 👋');
    i18n.set('en');
    expect(document.documentElement.lang).toBe('en');
    await i18n.load('en');
    expect(i18n.t('onboarding.hello', { name: 'Lea' })).toBe('Hi Lea 👋');
  });

  it('returns the key of an unknown text, and the generic message of an unknown error', () => {
    expect(i18n.t('nope.missing')).toBe('nope.missing');
    expect(i18n.error('link_used')).toBe('Ce lien a déjà été utilisé');
    expect(i18n.error('something_new')).toBe(fr.errors.generic);
    expect(i18n.error(null)).toBe(fr.errors.generic);
  });

  it('leaves unknown placeholders as they are', () => {
    expect(interpolate('{a} et {b}', { a: 1 })).toBe('1 et {b}');
  });

  it('formats relative dates', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    expect(i18n.relative('2026-11-17T12:00:00Z', now)).toBe('demain');
    expect(i18n.relative('2026-11-16T09:00:00Z', now)).toBe('il y a 3 heures');
  });
});
