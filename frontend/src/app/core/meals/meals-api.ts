import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CiqualImport, Favorites, FoodSources, OffImport, Food, FoodInput, FoodsOverview, MealDay, MealDays, MealInput, MealStats, RecipeDraft, RecentItem, Recipe, RecipeInput, RecipeType, RecipeVisibility, Slot } from '../api/models';

/** an ingredient of imported recipes the tables do not know (FOOD) or cannot weigh (WEIGHT) */
/** the community's first recipes (written by the team, computed from Ciqual) */
export interface CommunitySeeds {
  total: number;
  added: number;
  waiting: number;
  /** Ciqual codes the waiting ones need */
  missing: string[];
}

export interface IngredientMiss {
  key: string;
  reason: 'FOOD' | 'WEIGHT';
  example: string;
  count: number;
  lastAt: string;
}

/** Foods, meals and recipes (the server asks Open Food Facts itself: the app never calls a third party). */
@Injectable({ providedIn: 'root' })
export class MealsApi {
  private readonly http = inject(HttpClient);

  // ── foods ─────────────────────────────────────────────────────────────────
  /** local: mine, Ciqual and the products already known; ciqual: mine and Ciqual only; off: Open Food Facts */
  search(q: string, source: 'local' | 'ciqual' | 'off'): Promise<Food[]> {
    return firstValueFrom(this.http.get<Food[]>('/api/foods/search', { params: { q, source } }));
  }

  /** the Ciqual table in use and the copy of Open Food Facts, with their dates */
  sources(): Promise<FoodSources> {
    return firstValueFrom(this.http.get<FoodSources>('/api/foods/sources'));
  }

  // ── favourites (1.9) ─────────────────────────────────────────────────────
  favorites(): Promise<Favorites> {
    return firstValueFrom(this.http.get<Favorites>('/api/me/favorites'));
  }

  setFavorite(kind: 'foods' | 'recipes', id: string, on: boolean): Promise<void> {
    const url = `/api/me/favorites/${kind}/${id}`;
    return firstValueFrom(on ? this.http.put<void>(url, null) : this.http.delete<void>(url));
  }

  barcode(code: string): Promise<Food> {
    return firstValueFrom(this.http.get<Food>(`/api/foods/barcode/${encodeURIComponent(code)}`));
  }

  food(id: string): Promise<Food> {
    return firstValueFrom(this.http.get<Food>(`/api/foods/${id}`));
  }

  myFoods(): Promise<Food[]> {
    return firstValueFrom(this.http.get<Food[]>('/api/me/foods'));
  }

  createFood(input: FoodInput): Promise<Food> {
    return firstValueFrom(this.http.post<Food>('/api/me/foods', input));
  }

  updateFood(id: string, input: FoodInput): Promise<Food> {
    return firstValueFrom(this.http.put<Food>(`/api/me/foods/${id}`, input));
  }

  deleteFood(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/foods/${id}`));
  }

  // ── meals ─────────────────────────────────────────────────────────────────
  day(day: string): Promise<MealDay> {
    return firstValueFrom(this.http.get<MealDay>('/api/me/meals', { params: { day } }));
  }

  add(input: MealInput): Promise<MealDay> {
    return firstValueFrom(this.http.post<MealDay>('/api/me/meals', input));
  }

  update(id: string, patch: { slot?: Slot; grams?: number; servings?: number }): Promise<MealDay> {
    return firstValueFrom(this.http.patch<MealDay>(`/api/me/meals/${id}`, patch));
  }

  remove(id: string): Promise<MealDay> {
    return firstValueFrom(this.http.delete<MealDay>(`/api/me/meals/${id}`));
  }

  /** the totals of each day of a range (the calendar) */
  days(from: string, to: string): Promise<MealDays> {
    return firstValueFrom(this.http.get<MealDays>('/api/me/meals/days', { params: { from, to } }));
  }

  stats(days: 7 | 30 | 90): Promise<MealStats> {
    return firstValueFrom(this.http.get<MealStats>('/api/me/meals/stats', { params: { days } }));
  }

  copy(fromDay: string, toDay: string, slot: Slot): Promise<MealDay> {
    return firstValueFrom(this.http.post<MealDay>('/api/me/meals/copy', { fromDay, toDay, slot }));
  }

  recent(): Promise<RecentItem[]> {
    return firstValueFrom(this.http.get<RecentItem[]>('/api/me/meals/recent'));
  }

  // ── recipes ───────────────────────────────────────────────────────────────
  /** who sees one of my recipes, without the rest of it */
  setVisibility(id: string, visibility: RecipeVisibility): Promise<Recipe> {
    return firstValueFrom(this.http.put<Recipe>(`/api/me/recipes/${id}/visibility`, { visibility }));
  }

  myRecipes(): Promise<Recipe[]> {
    return firstValueFrom(this.http.get<Recipe[]>('/api/me/recipes'));
  }

  /** reads a recipe site (the server goes there, the app never calls a third party) */
  importRecipe(url: string): Promise<RecipeDraft> {
    return firstValueFrom(this.http.post<RecipeDraft>('/api/me/recipes/import', { url }));
  }

  /** my friends' recipes (shown to friends or to everyone), newest first */
  friendsRecipes(type: RecipeType | null): Promise<Recipe[]> {
    return firstValueFrom(this.http.get<Recipe[]>('/api/recipes/friends', { params: type ? { type } : {} }));
  }

  /** 30 a page; q: words of the name */
  community(type: RecipeType | null, sort: 'top' | 'new', page = 0, q = ''): Promise<Recipe[]> {
    const params: Record<string, string | number> = { sort, page };
    if (type) params['type'] = type;
    if (q.trim()) params['q'] = q.trim();
    return firstValueFrom(this.http.get<Recipe[]>('/api/recipes/community', { params }));
  }

  recipe(id: string): Promise<Recipe> {
    return firstValueFrom(this.http.get<Recipe>(`/api/recipes/${id}`));
  }

  createRecipe(input: RecipeInput): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>('/api/me/recipes', input));
  }

  updateRecipe(id: string, input: RecipeInput): Promise<Recipe> {
    return firstValueFrom(this.http.put<Recipe>(`/api/me/recipes/${id}`, input));
  }

  deleteRecipe(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/recipes/${id}`));
  }

  setRecipeImage(id: string, file: Blob): Promise<Recipe> {
    const form = new FormData();
    form.append('file', file, file.type === 'image/webp' ? 'recipe.webp' : 'recipe.jpg');
    return firstValueFrom(this.http.post<Recipe>(`/api/me/recipes/${id}/image`, form));
  }

  deleteRecipeImage(id: string): Promise<Recipe> {
    return firstValueFrom(this.http.delete<Recipe>(`/api/me/recipes/${id}/image`));
  }

  vote(id: string, value: -1 | 0 | 1): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>(`/api/recipes/${id}/vote`, { value }));
  }

  copyRecipe(id: string): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>(`/api/recipes/${id}/copy`, null));
  }

  // ── admin ─────────────────────────────────────────────────────────────────
  foodsOverview(): Promise<FoodsOverview> {
    return firstValueFrom(this.http.get<FoodsOverview>('/api/admin/foods'));
  }

  /** the ingredient lines of imported recipes that found no food or no weight, the most frequent first */
  misses(): Promise<IngredientMiss[]> {
    return firstValueFrom(this.http.get<IngredientMiss[]>('/api/admin/foods/misses'));
  }

  forgetMiss(m?: IngredientMiss): Promise<void> {
    const params: Record<string, string> = m ? { key: m.key, reason: m.reason } : {};
    return firstValueFrom(this.http.delete<void>('/api/admin/foods/misses', { params }));
  }

  /** the community's first recipes: how many are in, how many wait for their Ciqual foods */
  communitySeeds(): Promise<CommunitySeeds> {
    return firstValueFrom(this.http.get<CommunitySeeds>('/api/admin/foods/community'));
  }

  seedCommunity(): Promise<CommunitySeeds> {
    return firstValueFrom(this.http.post<CommunitySeeds>('/api/admin/foods/community', null));
  }

  startCiqual(): Promise<CiqualImport> {
    return firstValueFrom(this.http.post<CiqualImport>('/api/admin/foods/ciqual/import', null));
  }

  startOff(): Promise<OffImport> {
    return firstValueFrom(this.http.post<OffImport>('/api/admin/foods/off/import', null));
  }

  offImport(id: string): Promise<OffImport> {
    return firstValueFrom(this.http.get<OffImport>(`/api/admin/foods/off/imports/${id}`));
  }

  ciqualImport(id: string): Promise<CiqualImport> {
    return firstValueFrom(this.http.get<CiqualImport>(`/api/admin/foods/ciqual/imports/${id}`));
  }
}
