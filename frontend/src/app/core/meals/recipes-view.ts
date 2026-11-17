import { Injectable, signal } from '@angular/core';
import type { Recipe, RecipeType } from '../api/models';

/**
 * Where one was on the recipes screen (1.8): the tab, the meal filter, the sort, the search, and the lists already
 * seen. Kept for the whole app: back from a recipe, the screen is as it was left, not reset to « Mes recettes ».
 * Cleared at sign-out (UserDataService).
 */
@Injectable({ providedIn: 'root' })
export class RecipesView {
  readonly tab = signal<'mine' | 'friends' | 'community'>('mine');
  readonly type = signal<RecipeType | null>(null);
  readonly sort = signal<'top' | 'new'>('top');
  /** what is typed in the search, and what is searched (a moment after the last key) */
  readonly term = signal('');
  readonly query = signal('');
  /** the lists already seen: back to a tab or a filter, it shows at once (and is refreshed behind) */
  readonly seen = new Map<string, Recipe[]>();

  clear(): void {
    this.tab.set('mine');
    this.type.set(null);
    this.sort.set('top');
    this.term.set('');
    this.query.set('');
    this.seen.clear();
  }
}
