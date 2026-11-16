import { Injectable, computed, inject, signal } from '@angular/core';
import type { DayTotal, MealDay, MealEntry, MealInput, Nutrients, RecentItem, Slot } from '../api/models';
import { localDay } from '../tracking/tracking.store';
import { MealsApi } from './meals-api';

export const SLOTS: Slot[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** a slot by the time of day: what someone opening the app is most likely about to log */
export function slotNow(d = new Date()): Slot {
  const h = d.getHours();
  if (h < 11) return 'BREAKFAST';
  if (h < 15) return 'LUNCH';
  if (h < 18) return 'SNACK';
  return 'DINNER';
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return localDay(d);
}

/** the 7 days (Monday first) of the week of a day */
export function weekOf(day: string): string[] {
  const dow = (new Date(day + 'T12:00:00').getDay() + 6) % 7;
  const monday = shiftDay(day, -dow);
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}

/** the days of a month view (YYYY-MM): whole weeks, Monday first, 5 or 6 rows */
export function monthGrid(month: string): string[] {
  const first = month + '-01';
  const start = weekOf(first)[0];
  const last = shiftDay(shiftDay(first, 32).slice(0, 7) + '-01', -1);
  const out: string[] = [];
  for (let d = start; d <= last || out.length % 7; d = shiftDay(d, 1)) out.push(d);
  return out;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * How a day went against the target: within ±10 % (ok), above, below; a day not over yet is "ongoing"
 * while still below; "logged" without a target; null when nothing was logged.
 */
export type DayStatus = 'ok' | 'over' | 'under' | 'ongoing' | 'logged' | null;

export function dayStatus(kcal: number | undefined, target: number | null | undefined, day: string, today: string): DayStatus {
  if (!kcal) return null;
  if (!target) return 'logged';
  const r = kcal / target;
  if (r > 1.1) return 'over';
  if (r >= 0.9) return 'ok';
  return day >= today ? 'ongoing' : 'under';
}

/** what the add screen should open once back (a scanned product, a food just created) */
export interface Pick {
  kind: 'FOOD' | 'RECIPE';
  id: string;
}

/** The meals of the day on screen, and what was logged lately. */
@Injectable({ providedIn: 'root' })
export class MealsStore {
  private readonly api = inject(MealsApi);

  readonly day = signal(localDay());
  readonly data = signal<MealDay | null>(null);
  readonly recent = signal<RecentItem[] | null>(null);
  readonly pick = signal<Pick | null>(null);
  /** today's totals, whatever day is on screen (the Today tab shows them) */
  readonly today = signal<MealDay | null>(null);
  /** the calendar: totals of the days already fetched (a day missing from a fetched range: nothing logged) */
  readonly totals = signal<Record<string, DayTotal>>({});
  readonly target = signal<number | null>(null);
  private readonly ranges = new Set<string>();

  readonly bySlot = computed(() => {
    const out: Record<Slot, MealEntry[]> = { BREAKFAST: [], LUNCH: [], DINNER: [], SNACK: [] };
    for (const e of this.data()?.entries ?? []) out[e.slot].push(e);
    return out;
  });

  async load(day = this.day()): Promise<MealDay> {
    this.day.set(day);
    const d = await this.api.day(day);
    this.apply(d);
    return d;
  }

  async loadToday(): Promise<void> {
    try {
      this.apply(await this.api.day(localDay()));
    } catch {
      /* the line just stays without numbers */
    }
  }

  async add(input: MealInput): Promise<MealDay> {
    const d = await this.api.add(input);
    this.apply(d);
    this.recent.set(null);
    return d;
  }

  async update(id: string, patch: { slot?: Slot; grams?: number; servings?: number }): Promise<void> {
    this.apply(await this.api.update(id, patch));
  }

  async remove(id: string): Promise<void> {
    this.apply(await this.api.remove(id));
  }

  /** the same slot as the day before; false when it was empty */
  async copyFromYesterday(slot: Slot): Promise<boolean> {
    const before = this.data()?.entries.filter((e) => e.slot === slot).length ?? 0;
    const d = await this.api.copy(shiftDay(this.day(), -1), this.day(), slot);
    this.apply(d);
    return d.entries.filter((e) => e.slot === slot).length > before;
  }

  /** the totals of a range of days, once (the changes made in the app keep them up to date) */
  async loadRange(from: string, to: string): Promise<void> {
    const key = from + '_' + to;
    if (this.ranges.has(key)) return;
    this.ranges.add(key);
    try {
      const r = await this.api.days(from, to);
      this.target.set(r.targetKcal ?? null);
      this.totals.update((all) => {
        const next = { ...all };
        for (let d = from; d <= to; d = shiftDay(d, 1)) delete next[d];
        for (const t of r.days) next[t.day] = t;
        return next;
      });
    } catch {
      this.ranges.delete(key);
    }
  }

  async loadRecent(): Promise<RecentItem[]> {
    const r = await this.api.recent();
    this.recent.set(r);
    return r;
  }

  clear(): void {
    this.data.set(null);
    this.today.set(null);
    this.recent.set(null);
    this.totals.set({});
    this.target.set(null);
    this.ranges.clear();
    this.day.set(localDay());
  }

  private apply(d: MealDay): void {
    if (d.day === this.day()) this.data.set(d);
    if (d.day === localDay()) this.today.set(d);
    if (d.targetKcal != null) this.target.set(d.targetKcal);
    this.totals.update((all) => {
      const next = { ...all };
      if (d.entries.length) {
        next[d.day] = {
          day: d.day,
          kcal: d.totals.kcal,
          proteinG: d.totals.proteinG ?? 0,
          carbsG: d.totals.carbsG ?? 0,
          fatG: d.totals.fatG ?? 0,
          entries: d.entries.length,
        };
      } else {
        delete next[d.day];
      }
      return next;
    });
  }
}

/** grams of protein, carbs and fat matching a calorie target (25 / 45 / 30 %) */
export function macroTargets(kcal: number): { proteinG: number; carbsG: number; fatG: number } {
  return { proteinG: Math.round((kcal * 0.25) / 4), carbsG: Math.round((kcal * 0.45) / 4), fatG: Math.round((kcal * 0.3) / 9) };
}

export function scaled(n: Nutrients, f: number): Nutrients {
  const m = (v?: number) => (v == null ? undefined : v * f);
  return {
    kcal: n.kcal * f,
    proteinG: m(n.proteinG),
    carbsG: m(n.carbsG),
    sugarsG: m(n.sugarsG),
    fatG: m(n.fatG),
    satFatG: m(n.satFatG),
    fiberG: m(n.fiberG),
    saltG: m(n.saltG),
  };
}
