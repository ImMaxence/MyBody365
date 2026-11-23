import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ShoppingList, Slot } from '../api/models';
import { FRESH_MS, fresh } from '../api/kept';
import { localDay } from '../tracking/tracking.store';
import { MealsStore, shiftDay } from './meals.store';
import { HabitsApi } from '../api/habits-api';

/** 1.20: a meal planned for a day to come (MealPlans on the server) */
export interface PlanItem {
  id: string;
  day: string;
  slot: Slot;
  kind: 'RECIPE' | 'TEMPLATE' | 'NOTE';
  recipeId?: string | null;
  templateId?: string | null;
  name: string;
  servings?: number | null;
  /** what it is worth (null for a note) */
  kcal?: number | null;
  thumbUrl?: string | null;
}

export interface PlanInput {
  day: string;
  slot: Slot;
  recipeId?: string;
  templateId?: string;
  servings?: number;
  note?: string;
}

/** the plan's window: yesterday to two weeks ahead */
export const PLAN_DAYS = 14;
/** the lines eaten while offline, taken off the plan once the network is back */
const EATEN_KEY = 'mb.plan.eaten';

/**
 * 1.20: the meals planned for the next two weeks (and yesterday's, still to note). Shown at once when known, asked again
 * when older than FRESH_MS. A plan eaten without network is hidden at once and taken off the plan at the next chance.
 */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  private readonly http = inject(HttpClient);
  private readonly meals = inject(MealsStore);
  private readonly habits = inject(HabitsApi);
  readonly items = signal<PlanItem[] | null>(null);
  /** the ids eaten offline, not yet taken off on the server */
  private readonly eaten = signal<ReadonlySet<string>>(new Set(readEaten()));
  readonly visible = computed(() => (this.items() ?? []).filter((p) => !this.eaten().has(p.id)));
  private at = 0;
  private loading: Promise<void> | null = null;

  /** the plan of a day, by meal */
  forDay(day: string): PlanItem[] {
    return this.visible().filter((p) => p.day === day);
  }

  range(): { from: string; to: string } {
    const today = localDay();
    return { from: shiftDay(today, -1), to: shiftDay(today, PLAN_DAYS - 1) };
  }

  ensure(maxAge = FRESH_MS): Promise<void> {
    if (fresh(this.at, maxAge)) return Promise.resolve();
    return (this.loading ??= this.load().finally(() => (this.loading = null)));
  }

  private async load(): Promise<void> {
    const { from, to } = this.range();
    const list = await firstValueFrom(this.http.get<PlanItem[]>('/api/me/plan', { params: { from, to } }));
    this.items.set(list);
    this.at = Date.now();
    void this.flushEaten();
  }

  async add(input: PlanInput): Promise<PlanItem> {
    const item = await firstValueFrom(this.http.post<PlanItem>('/api/me/plan', input));
    this.items.update((list) => sort([...(list ?? []), item]));
    return item;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/me/plan/${id}`));
    this.items.update((list) => (list ?? []).filter((p) => p.id !== id));
  }

  /**
   * eaten: noted in the meals of its day like any line (a recipe for its servings, a usual meal line by line; offline too),
   * then off the plan. A note has nothing to note.
   */
  async eat(p: PlanItem): Promise<void> {
    if (p.kind === 'RECIPE' && p.recipeId) {
      await this.meals.add({ day: p.day, slot: p.slot, recipeId: p.recipeId, servings: p.servings ?? 1 }, { name: p.name, nutrients: { kcal: p.kcal ?? 0 } });
    } else if (p.kind === 'TEMPLATE' && p.templateId) {
      const t = (await this.habits.templates()).find((x) => x.id === p.templateId);
      if (!t) throw new Error('template_gone');
      for (const x of t.items) {
        const preview = { name: x.name, nutrients: x.nutrients };
        if (x.foodId && x.grams) await this.meals.add({ day: p.day, slot: p.slot, foodId: x.foodId, grams: x.grams }, preview);
        else if (x.recipeId && x.servings) await this.meals.add({ day: p.day, slot: p.slot, recipeId: x.recipeId, servings: x.servings }, preview);
        else await this.meals.add({ day: p.day, slot: p.slot, quick: { ...x.nutrients, name: x.name } }, preview);
      }
      void this.habits.templateUsed(t.id).catch(() => undefined);
    }
    await this.markEaten(p.id);
  }

  /** noted as eaten: off the plan at once; without network, hidden until it can be taken off */
  async markEaten(id: string): Promise<void> {
    try {
      await this.remove(id);
    } catch {
      this.eaten.update((s) => new Set([...s, id]));
      writeEaten([...this.eaten()]);
    }
  }

  private async flushEaten(): Promise<void> {
    for (const id of this.eaten()) {
      try {
        await firstValueFrom(this.http.delete<void>(`/api/me/plan/${id}`));
      } catch {
        // gone already (404) or still offline: a 404 is done too
      }
      this.eaten.update((s) => new Set([...s].filter((x) => x !== id)));
      this.items.update((list) => (list ?? []).filter((p) => p.id !== id));
    }
    writeEaten([...this.eaten()]);
  }

  /** the recipes and usual meals of a stretch of days, on the shopping list */
  toShopping(from: string, to: string): Promise<ShoppingList> {
    return firstValueFrom(this.http.post<ShoppingList>('/api/me/plan/shopping', { from, to }));
  }

  clear(): void {
    this.items.set(null);
    this.at = 0;
  }
}

const ORDER: Record<Slot, number> = { BREAKFAST: 0, LUNCH: 1, DINNER: 2, SNACK: 3 };

function sort(list: PlanItem[]): PlanItem[] {
  return list.sort((a, b) => a.day.localeCompare(b.day) || ORDER[a.slot] - ORDER[b.slot]);
}

function readEaten(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(EATEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeEaten(ids: string[]): void {
  try {
    if (ids.length) localStorage.setItem(EATEN_KEY, JSON.stringify(ids));
    else localStorage.removeItem(EATEN_KEY);
  } catch {
    /* storage blocked */
  }
}
