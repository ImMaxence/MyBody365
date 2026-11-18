import { Injectable, computed, inject, signal } from '@angular/core';
import type { Food, Recipe } from '../api/models';
import { MealsApi } from './meals-api';

/**
 * Favourite foods and recipes (1.9), for the whole app: a heart on a food (when adding it) and on a recipe, and the
 * favourites at the top of « Ajouter un repas ». Toggled at once on screen, saved behind (put back if refused).
 */
@Injectable({ providedIn: 'root' })
export class FavoritesStore {
  private readonly api = inject(MealsApi);
  readonly foods = signal<Food[] | null>(null);
  readonly recipes = signal<Recipe[] | null>(null);
  private readonly foodIds = computed(() => new Set((this.foods() ?? []).map((f) => f.id)));
  private readonly recipeIds = computed(() => new Set((this.recipes() ?? []).map((r) => r.id)));
  private loading: Promise<void> | null = null;

  /** once a session, then kept up to date here */
  ensure(): Promise<void> {
    this.loading ??= this.api
      .favorites()
      .then((f) => {
        this.foods.set(f.foods);
        this.recipes.set(f.recipes);
      })
      .catch(() => {
        this.loading = null;
      });
    return this.loading;
  }

  isFood(id: string | null | undefined): boolean {
    return !!id && this.foodIds().has(id);
  }

  isRecipe(id: string | null | undefined): boolean {
    return !!id && this.recipeIds().has(id);
  }

  /** a heart tapped: on screen at once; the error is thrown (the caller says it) */
  async toggleFood(food: Food): Promise<boolean> {
    const on = !this.isFood(food.id);
    const before = this.foods();
    this.foods.set(on ? [food, ...(before ?? [])] : (before ?? []).filter((f) => f.id !== food.id));
    try {
      await this.api.setFavorite('foods', food.id, on);
    } catch (e) {
      this.foods.set(before);
      throw e;
    }
    return on;
  }

  async toggleRecipe(recipe: Recipe): Promise<boolean> {
    const on = !this.isRecipe(recipe.id);
    const before = this.recipes();
    this.recipes.set(on ? [recipe, ...(before ?? [])] : (before ?? []).filter((r) => r.id !== recipe.id));
    try {
      await this.api.setFavorite('recipes', recipe.id, on);
    } catch (e) {
      this.recipes.set(before);
      throw e;
    }
    return on;
  }

  clear(): void {
    this.loading = null;
    this.foods.set(null);
    this.recipes.set(null);
  }
}
