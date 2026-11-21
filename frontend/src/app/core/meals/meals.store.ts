import { Injectable, computed, inject, signal } from '@angular/core';
import type { DayTotal, MealDay, MealEntry, MealInput, MealStats, Nutrients, RecentItem, Slot } from '../api/models';
import { fresh } from '../api/kept';
import { localDay } from '../tracking/tracking.store';
import { MealsApi } from './meals-api';
import { Outbox, isOffline } from '../offline/outbox';

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
/** what a meal noted offline is, to show it before the server has it */
export interface MealPreview {
  name: string;
  nutrients: Nutrients;
}

/** the id of a meal kept on the phone, not sent yet */
export const PENDING = 'pending-';

function plus(a: Nutrients, b: Nutrients): Nutrients {
  const add = (x?: number, y?: number) => (x == null && y == null ? undefined : (x ?? 0) + (y ?? 0));
  return {
    kcal: a.kcal + b.kcal,
    proteinG: add(a.proteinG, b.proteinG),
    carbsG: add(a.carbsG, b.carbsG),
    sugarsG: add(a.sugarsG, b.sugarsG),
    fatG: add(a.fatG, b.fatG),
    satFatG: add(a.satFatG, b.satFatG),
    fiberG: add(a.fiberG, b.fiberG),
    saltG: add(a.saltG, b.saltG),
  };
}

@Injectable({ providedIn: 'root' })
export class MealsStore {
  private readonly api = inject(MealsApi);
  private readonly outbox = inject(Outbox);
  /** the last add was kept on the phone (no network): the screens say so instead of « added » */
  readonly lastQueued = signal(false);

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

  constructor() {
    // a meal noted offline reached the server: its day again, as the server has it now
    this.outbox.sent.subscribe((p) => {
      if (p.kind !== 'meal') return;
      this.recent.set(null);
      if (p.day === this.day()) void this.load(p.day).catch(() => undefined);
      else if (p.day === localDay()) void this.loadToday();
    });
  }

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

  /** 1.16: a day seen less than FRESH_MS ago shown as it is (back on the Meals tab), else asked again */
  async ensure(day = this.day()): Promise<MealDay> {
    const known = this.server.get(day);
    if (known && fresh(this.fetchedAt.get(day) ?? 0)) {
      this.day.set(day);
      const d = this.withPending(known);
      this.data.set(d);
      return d;
    }
    return this.load(day);
  }

  /** 1.16: today's totals, asked again when older than FRESH_MS */
  ensureToday(): Promise<void> {
    if (this.server.has(localDay()) && fresh(this.fetchedAt.get(localDay()) ?? 0)) return Promise.resolve();
    return (this.loadingToday ??= this.loadToday().finally(() => (this.loadingToday = null)));
  }

  private loadingToday: Promise<void> | null = null;

  /** 1.16: the last 7 days' statistics (what stands out on the Meals tab), kept while fresh */
  readonly weekStats = signal<MealStats | null>(null);
  private weekStatsAt = 0;

  async ensureWeekStats(): Promise<void> {
    if (this.weekStats() && fresh(this.weekStatsAt)) return;
    try {
      this.weekStats.set(await this.api.stats(7));
      this.weekStatsAt = Date.now();
    } catch {
      /* the card stays hidden */
    }
  }

  /**
   * Without network, and with what it is (name and nutrients, the screen knows them): kept on the phone and
   * shown at once, marked as waiting (id « pending-… »), sent when the network is back.
   */
  async add(input: MealInput, preview?: MealPreview): Promise<MealDay> {
    try {
      const d = await this.api.add(input);
      this.weekStatsAt = 0;
      this.lastQueued.set(false);
      this.apply(d);
      this.recent.set(null);
      return d;
    } catch (e) {
      if (!isOffline(e) || !preview) throw e;
      this.outbox.add({
        kind: 'meal',
        method: 'POST',
        url: '/api/me/meals',
        body: input,
        day: input.day,
        preview: { slot: input.slot, name: preview.name, nutrients: { ...preview.nutrients }, grams: input.grams, servings: input.servings },
      });
      this.lastQueued.set(true);
      const d = this.server.get(input.day) ?? { day: input.day, targetKcal: this.target() ?? undefined, totals: { kcal: 0 }, entries: [] };
      this.apply(d);
      return this.data() ?? d;
    }
  }

  async update(id: string, patch: { slot?: Slot; grams?: number; servings?: number }): Promise<void> {
    this.apply(await this.api.update(id, patch));
    this.weekStatsAt = 0;
  }

  async remove(id: string): Promise<void> {
    this.apply(await this.api.remove(id));
    this.weekStatsAt = 0;
  }

  /** the same slot as the day before; false when it was empty */
  async copyFromYesterday(slot: Slot): Promise<boolean> {
    const before = this.data()?.entries.filter((e) => e.slot === slot).length ?? 0;
    const d = await this.api.copy(shiftDay(this.day(), -1), this.day(), slot);
    this.apply(d);
    this.weekStatsAt = 0;
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
    this.server.clear();
    this.fetchedAt.clear();
    this.weekStats.set(null);
    this.weekStatsAt = 0;
    this.day.set(localDay());
  }

  /** the days as the server sent them (the meals waiting for the network are added on top) */
  private readonly server = new Map<string, MealDay>();
  /** 1.16: when each of them came */
  private readonly fetchedAt = new Map<string, number>();

  /** a day from the server, with the meals of that day still waiting on the phone */
  private withPending(d: MealDay): MealDay {
    const waiting = this.outbox.pending().filter((p) => p.kind === 'meal' && p.day === d.day && p.preview);
    if (!waiting.length) return d;
    let totals = d.totals;
    const entries = [...d.entries];
    for (const p of waiting) {
      const v = p.preview!;
      entries.push({
        id: PENDING + p.id,
        day: p.day,
        slot: v.slot as Slot,
        name: v.name,
        grams: v.grams,
        servings: v.servings,
        nutrients: v.nutrients as Nutrients,
        createdAt: new Date(p.at).toISOString(),
      });
      totals = plus(totals, v.nutrients as Nutrients);
    }
    return { ...d, entries, totals };
  }

  private apply(server: MealDay): void {
    this.server.set(server.day, server);
    this.fetchedAt.set(server.day, Date.now());
    const d = this.withPending(server);
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
