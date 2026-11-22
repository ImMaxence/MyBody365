import { Injectable, computed, inject, signal } from '@angular/core';
import type { Aisle, ShoppingItem, ShoppingList } from '../api/models';
import { MealsApi } from './meals-api';
import { fresh } from '../api/kept';
import { Outbox, isOffline } from '../offline/outbox';

/** the aisles in the order they are walked in a French supermarket (the server sorts the same way) */
export const AISLES: Aisle[] = ['FRUITS_VEGETABLES', 'BAKERY', 'BUTCHER', 'FISHMONGER', 'DELI', 'CHEESE', 'DAIRY', 'SAVORY', 'SWEET', 'DRINKS', 'FROZEN', 'OTHER'];

export const AISLE_EMOJI: Record<Aisle, string> = {
  FRUITS_VEGETABLES: '🥦',
  BAKERY: '🥖',
  BUTCHER: '🥩',
  FISHMONGER: '🐟',
  DELI: '🥓',
  CHEESE: '🧀',
  DAIRY: '🥛',
  SAVORY: '🥫',
  SWEET: '🍫',
  DRINKS: '🧃',
  FROZEN: '🧊',
  OTHER: '🛒',
};

/** « Tomate, pelée, appertisée » → « Tomate » and « pelée, appertisée »: what to look for, then the detail */
export function splitName(name: string): { head: string; rest: string } {
  const [raw, brand] = name.split(' · ');
  const main = raw.replace(/\s*\((aliment moyen|par ex[^)]*)\)/g, '').replace(/ sans précision/g, '');
  const i = main.indexOf(',');
  const head = (i < 0 ? main : main.slice(0, i)).trim();
  const rest = [i < 0 ? '' : main.slice(i + 1).trim(), brand ?? ''].filter(Boolean).join(' · ');
  return { head, rest };
}

/** 1.11: the shopping list, kept between its screens (the meals tab shows how many lines are left). */
@Injectable({ providedIn: 'root' })
export class ShoppingStore {
  private readonly api = inject(MealsApi);
  private readonly outbox = inject(Outbox);
  readonly list = signal<ShoppingList | null>(null);
  /** 1.17: the lines ticked without network (their outbox id), greyed until sent */
  readonly waiting = computed(() => new Map(this.outbox.of('shopping').map((p) => [p.target!, p.id])));
  /** the lines not in the basket yet */
  readonly left = computed(() => (this.list()?.items ?? []).filter((i) => !i.checked).length);

  async load(): Promise<ShoppingList> {
    const l = await this.api.shopping();
    this.set(l);
    return l;
  }

  private at = 0;

  /** 1.17: the list seen less than FRESH_MS ago as it is (back on the Meals tab), else asked again */
  async ensure(): Promise<ShoppingList> {
    const l = this.list();
    return l && fresh(this.at) ? l : this.load();
  }

  set(l: ShoppingList): void {
    this.list.set(l);
    this.at = Date.now();
  }

  /** signed out: another account never sees this list */
  clear(): void {
    this.list.set(null);
    this.at = 0;
  }

  /** the aisles that have lines, in walking order */
  readonly aisles = computed(() => {
    const items = this.list()?.items ?? [];
    return AISLES.map((a) => ({ aisle: a, items: items.filter((i) => i.aisle === a) })).filter((g) => g.items.length > 0);
  });

  /** ticked at once on screen, then saved */
  async check(item: ShoppingItem, checked: boolean): Promise<void> {
    const l = this.list();
    if (l) this.list.set({ ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, checked } : i)) });
    try {
      this.set(await this.api.checkShopping(item.id, checked));
    } catch (e) {
      // 1.17: in the shop without network: ticked on the phone, sent when it is back
      if (isOffline(e)) {
        this.outbox.add({ kind: 'shopping', method: 'PUT', url: `/api/me/shopping/items/${item.id}`, body: { checked }, day: '', target: item.id });
        return;
      }
      if (l) this.list.set(l);
      throw e;
    }
  }
}
