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
