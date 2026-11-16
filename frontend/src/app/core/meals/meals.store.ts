import { Injectable, computed, inject, signal } from '@angular/core';
import type { MealDay, MealEntry, MealInput, Nutrients, RecentItem, Slot } from '../api/models';
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

  async loadRecent(): Promise<RecentItem[]> {
    const r = await this.api.recent();
    this.recent.set(r);
    return r;
  }

  clear(): void {
    this.data.set(null);
    this.today.set(null);
    this.recent.set(null);
    this.day.set(localDay());
  }

  private apply(d: MealDay): void {
    if (d.day === this.day()) this.data.set(d);
    if (d.day === localDay()) this.today.set(d);
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
