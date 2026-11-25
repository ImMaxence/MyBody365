/**
 * 1.14: the vitamins and minerals the app follows, as the server keeps them (backend nutrition/Micros.java): their keys,
 * their units and the European reference intakes of the labels (NRV, regulation 1169/2011, annex XIII).
 */
export type MicroKey = 'a' | 'd' | 'e' | 'c' | 'b1' | 'b2' | 'b6' | 'b9' | 'b12' | 'ca' | 'fe' | 'mg' | 'k' | 'zn';

export interface Micro {
  key: MicroKey;
  unit: 'µg' | 'mg';
  nrv: number;
}

export const MICROS: Micro[] = [
  { key: 'a', unit: 'µg', nrv: 800 },
  { key: 'd', unit: 'µg', nrv: 5 },
  { key: 'e', unit: 'mg', nrv: 12 },
  { key: 'c', unit: 'mg', nrv: 80 },
  { key: 'b1', unit: 'mg', nrv: 1.1 },
  { key: 'b2', unit: 'mg', nrv: 1.4 },
  { key: 'b6', unit: 'mg', nrv: 1.4 },
  { key: 'b9', unit: 'µg', nrv: 200 },
  { key: 'b12', unit: 'µg', nrv: 2.5 },
  { key: 'ca', unit: 'mg', nrv: 800 },
  { key: 'fe', unit: 'mg', nrv: 14 },
  { key: 'mg', unit: 'mg', nrv: 375 },
  { key: 'k', unit: 'mg', nrv: 2000 },
  { key: 'zn', unit: 'mg', nrv: 10 },
];

export type Micros = Partial<Record<MicroKey, number>>;

/** the share of the daily reference, in % */
export function pctOf(m: Micro, v: number | undefined): number {
  return v == null ? 0 : Math.round((100 * v) / m.nrv);
}

/** what an amount brings the most of: the micros at 15 % of their reference or more, the richest first */
export function richIn(micros: Micros | undefined | null, factor = 1, min = 15): { key: MicroKey; pct: number }[] {
  if (!micros) return [];
  return MICROS.map((m) => ({ key: m.key, pct: pctOf(m, (micros[m.key] ?? 0) * factor) }))
    .filter((x) => x.pct >= min)
    .sort((a, b) => b.pct - a.pct);
}

/**
 * 1.21: the most a day should bring, for adults (EFSA tolerable upper intakes; iron: the safe level of 2024), for those a lot
 * of food could reach. Vitamin A is left out (the tables count the carotene of carrots in it, which is no risk), so are
 * magnesium and vitamin B9 (their limits are for supplements and added folic acid only); the others have none.
 */
export const UPPER: Partial<Record<MicroKey, number>> = { d: 100, e: 300, b6: 12, ca: 2500, fe: 40, zn: 25 };

/** 1.21: those most often short in France (Anses, INCA 3): vitamin D, B9 and iron (women above all), magnesium, calcium */
export const OFTEN_SHORT: MicroKey[] = ['d', 'b9', 'fe', 'mg', 'ca'];

export type MicroStatus = 'over' | 'none' | 'low' | 'fair' | 'good' | 'unknown';

/** where a mean a day stands: above the safety limit, almost none (under 20 %), not enough (under 50 %), a bit short, covered */
export function microStatus(m: Micro, perDay: number | undefined | null): MicroStatus {
  if (perDay == null) return 'unknown';
  const up = UPPER[m.key];
  if (up != null && perDay > up) return 'over';
  const pct = (100 * perDay) / m.nrv;
  return pct < 20 ? 'none' : pct < 50 ? 'low' : pct < 100 ? 'fair' : 'good';
}

/**
 * « Pois chiches - Boîte 530g · U » → « Pois chiches », « Carotte, crue » → « Carotte », « Pain complet ou intégral (à la farine
 * T150) » → « Pain complet » (as the server's MealService.sourceName)
 */
export function shortName(name: string): string {
  const head = name
    .split(' · ')[0]
    .split(',')[0]
    .split(' - ')[0]
    .replace(/\s*\([^)]*\)/g, '')
    .split(' ou ')[0]
    .trim();
  return head || name;
}

/** 1.21: the ingredients of a recipe that bring a vitamin the most: 3 at most, each a tenth of it at least, the first one first */
export function sourcesOf(lines: { name: string; micros?: Partial<Record<string, number>> }[] | null | undefined, key: MicroKey): string[] {
  const by = new Map<string, number>();
  for (const l of lines ?? []) {
    const v = l.micros?.[key];
    if (v && v > 0) by.set(shortName(l.name), (by.get(shortName(l.name)) ?? 0) + v);
  }
  const total = [...by.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  return [...by]
    .filter(([, v]) => v / total >= 0.1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([n]) => n);
}
