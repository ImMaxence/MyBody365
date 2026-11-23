/**
 * 1.19: where the app's nutrition guides come from, shown under the trends of the week, « Bon à savoir » and the
 * score of the day. The two WHO pages were read on 2026-11-23 and state these figures: salt under 5 g a day, free
 * sugars under 10 % of the energy (about 50 g for 2 000 kcal), saturated fat under 10 % of the energy. The Anses figure
 * (30 g of fibre a day, « un AS à 30 g de fibres totales alimentaires par jour a été retenu ») is its 2016 report on the
 * PNNS guidelines (1.20: found through a search engine, its site refusing automated reading). The protein guide is the
 * app's own (core/meals/macro-plan.ts).
 */
export type SourceKey = 'who' | 'whoSalt' | 'sugarsNote' | 'ansesFibre' | 'protein';

export interface Source {
  key: SourceKey;
  /** the page to read, in French and in English (none when there is no page to link) */
  url?: { fr: string; en: string };
  host?: string;
}

export const SOURCES: Record<SourceKey, Source> = {
  who: {
    key: 'who',
    url: { fr: 'https://www.who.int/fr/news-room/fact-sheets/detail/healthy-diet', en: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
    host: 'who.int',
  },
  whoSalt: {
    key: 'whoSalt',
    url: { fr: 'https://www.who.int/fr/news-room/fact-sheets/detail/salt-reduction', en: 'https://www.who.int/news-room/fact-sheets/detail/salt-reduction' },
    host: 'who.int',
  },
  sugarsNote: { key: 'sugarsNote' },
  ansesFibre: {
    key: 'ansesFibre',
    url: { fr: 'https://www.anses.fr/fr/system/files/NUT2012SA0103Ra-1.pdf', en: 'https://www.anses.fr/fr/system/files/NUT2012SA0103Ra-1.pdf' },
    host: 'anses.fr',
  },
  protein: { key: 'protein' },
};

/** the sources behind what a trend or a check says (each once, in a steady order) */
export function sourcesFor(keys: readonly string[]): SourceKey[] {
  const out = new Set<SourceKey>();
  for (const k of keys) {
    if (k === 'salt') out.add('whoSalt');
    if (k === 'sugars' || k === 'satFat' || k === 'balanced') out.add('who');
    if (k === 'sugars' || k === 'balanced') out.add('sugarsNote');
    if (k === 'fiber' || k === 'balanced') out.add('ansesFibre');
    if (k === 'protein') out.add('protein');
  }
  const order: SourceKey[] = ['who', 'whoSalt', 'sugarsNote', 'ansesFibre', 'protein'];
  return order.filter((k) => out.has(k));
}
