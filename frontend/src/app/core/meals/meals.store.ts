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

  /**
   * 1.17: the calendar day, which moves at midnight. A phone keeps the app in memory all night: the screen that was on
   * « today » goes to the new day (back in the app, or at midnight with the app open), never stays on « yesterday »
   */
  readonly calendarDay = signal(localDay());

  /** the date changed since the last look: the screen on « today » follows it; true when it did */
  checkDay(load = true): boolean {
    const now = localDay();
    const was = this.calendarDay();
    if (now === was) return false;
    this.calendarDay.set(now);
    if (this.day() === was) {
      this.day.set(now);
      if (load) void this.ensure(now).catch(() => undefined);
    }
    void this.ensureToday();
    return true;
  }

  constructor() {
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.checkDay();
      });
      window.setInterval(() => this.checkDay(), 60_000);
    }
    // a meal noted offline reached the server: its day again, as the server has it now; 1.17: the lines that were waiting
    // show as arrived for a moment (they lose their grey)
    this.outbox.sent.subscribe((p) => {
      if (p.kind !== 'meal' && p.kind !== 'meal-edit' && p.kind !== 'meal-delete') return;
      this.recent.set(null);
      this.weekStatsAt = 0;
      const before = new Set((this.data()?.entries ?? []).filter((e) => !e.pending).map((e) => e.id));
      const reload = p.day === this.day() ? this.load(p.day) : p.day === localDay() ? this.loadToday() : Promise.resolve(null);
      void reload
        .then(() => {
          const now = this.data()?.entries ?? [];
          const arrived = now.filter((e) => !e.pending && (!before.has(e.id) || e.id === p.target)).map((e) => e.id);
          if (arrived.length) this.markArrived(arrived);
        })
        .catch(() => undefined);
    });
  }

  /** 1.17: the lines that just reached the server (their grey fades out) */
  readonly arrived = signal<ReadonlySet<string>>(new Set());
  private arrivedTimer: ReturnType<typeof setTimeout> | null = null;

  private markArrived(ids: string[]): void {
    this.arrived.update((s) => new Set([...s, ...ids]));
    if (this.arrivedTimer) clearTimeout(this.arrivedTimer);
    this.arrivedTimer = setTimeout(() => this.arrived.set(new Set()), 1600);
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
  async ensure(asked?: string): Promise<MealDay> {
    // 1.17: opened on « today » after midnight: the new day
    if (asked == null) this.checkDay(false);
    const day = asked ?? this.day();
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

  /** 1.17: without network, kept on the phone and shown at once, greyed, until it is sent */
  async update(id: string, patch: { slot?: Slot; grams?: number; servings?: number }): Promise<void> {
    try {
      this.apply(await this.api.update(id, patch));
      this.lastQueued.set(false);
      this.weekStatsAt = 0;
    } catch (e) {
      const day = this.dayOf(id);
      if (!isOffline(e) || !day) throw e;
      this.outbox.add({ kind: 'meal-edit', method: 'PATCH', url: `/api/me/meals/${id}`, body: patch, day, target: id });
      this.lastQueued.set(true);
      this.reapply(day);
    }
  }

  /** 1.17: without network, shown crossed out and greyed until it is sent */
  async remove(id: string): Promise<void> {
    try {
      this.apply(await this.api.remove(id));
      this.lastQueued.set(false);
      this.weekStatsAt = 0;
    } catch (e) {
      const day = this.dayOf(id);
      if (!isOffline(e) || !day) throw e;
      this.outbox.add({ kind: 'meal-delete', method: 'DELETE', url: `/api/me/meals/${id}`, body: null, day, target: id });
      this.lastQueued.set(true);
      this.reapply(day);
    }
  }

  /** the day a line of the server belongs to */
  private dayOf(id: string): string | null {
    for (const [day, d] of this.server) if (d.entries.some((e) => e.id === id)) return day;
    return null;
  }

  /** the day as the server sent it, with what waits on the phone on top (after a change kept offline) */
  private reapply(day: string): void {
    const d = this.server.get(day);
    if (d) this.apply(d, false);
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
    this.calendarDay.set(localDay());
  }

  /** the days as the server sent them (the meals waiting for the network are added on top) */
  private readonly server = new Map<string, MealDay>();
  /** 1.16: when each of them came */
  private readonly fetchedAt = new Map<string, number>();

  /**
   * a day from the server, with the meals of that day still waiting on the phone: added (1.17: greyed), changed (1.17: the
   * new amount, greyed), deleted (1.17: crossed out, out of the totals)
   */
  private withPending(d: MealDay): MealDay {
    const all = this.outbox.pending().filter((p) => p.day === d.day);
    const waiting = all.filter((p) => p.kind === 'meal' && p.preview);
    const edits = new Map(all.filter((p) => p.kind === 'meal-edit' && p.target).map((p) => [p.target!, p]));
    const deletes = new Map(all.filter((p) => p.kind === 'meal-delete' && p.target).map((p) => [p.target!, p]));
    if (!waiting.length && !edits.size && !deletes.size) return d;
    let totals = d.totals;
    const entries = d.entries.map((e): MealEntry => {
      const del = deletes.get(e.id);
      if (del) {
        totals = plus(totals, scaled(e.nutrients, -1));
        return { ...e, pending: 'delete', waitId: del.id };
      }
      const edit = edits.get(e.id);
      if (!edit) return e;
      const patch = edit.body as { slot?: Slot; grams?: number; servings?: number };
      const f = patch.grams != null && e.grams ? patch.grams / e.grams : patch.servings != null && e.servings ? patch.servings / e.servings : 1;
      const nutrients = scaled(e.nutrients, f);
      totals = plus(plus(totals, scaled(e.nutrients, -1)), nutrients);
      return {
        ...e,
        slot: patch.slot ?? e.slot,
        grams: patch.grams ?? e.grams,
        servings: patch.servings ?? e.servings,
        nutrients,
        pending: 'edit',
        waitId: edit.id,
      };
    });
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
        pending: 'add',
        waitId: p.id,
      });
      totals = plus(totals, v.nutrients as Nutrients);
    }
    return { ...d, entries, totals };
  }

  private apply(server: MealDay, fetched = true): void {
    this.server.set(server.day, server);
    if (fetched) this.fetchedAt.set(server.day, Date.now());
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
