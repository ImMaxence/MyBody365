import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Food, Nutrients, Slot } from './models';

/** 1.19: a part of « Décris ton repas »: the food found (none: not found) and its weight, guessed when no quantity was said */
export interface DescribedPart {
  text: string;
  food: Food | null;
  grams: number;
  guessed: boolean;
}

/** 1.19: a line of « Mes repas habituels », as it was noted */
export interface TemplateItem {
  foodId?: string | null;
  recipeId?: string | null;
  name: string;
  detail?: string | null;
  grams?: number | null;
  servings?: number | null;
  nutrients: Nutrients;
  health?: number | null;
  liquid: boolean;
  thumbUrl?: string | null;
  group?: string | null;
}

export interface MealTemplate {
  id: string;
  name: string;
  slot: Slot | null;
  items: TemplateItem[];
  kcal: number;
  createdAt: string;
}

/** 1.19: the recap of a month */
export interface MonthRecap {
  month: string;
  daysInMonth: number;
  firstName: string;
  weight: { startKg: number | null; endKg: number | null; deltaKg: number | null; days: number; points: { day: string; kg: number }[] };
  bestRun: number;
  meals: { days: number; entries: number; avgKcal: number | null; avgHealth: number | null; top: { name: string; count: number }[] };
  waterGoal: number | null;
  waterDays: number;
  photos: { count: number; first: RecapPhoto | null; last: RecapPhoto | null };
  milestones: number[];
  targetKcal: number | null;
}

export interface RecapPhoto {
  id: string;
  day: string;
  pose: string;
  thumbUrl: string;
  fullUrl: string;
}

/** 1.19: a read-only link for a coach or a dietitian */
export type ShareScope = 'WEIGHT' | 'MEALS' | 'BP';

export interface ShareLink {
  id: string;
  label: string | null;
  scopes: ShareScope[];
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  openedCount: number;
  lastOpenedAt: string | null;
  active: boolean;
}

/** what a link shows to whoever holds it */
export interface SharedView {
  name: string;
  label: string | null;
  until: string;
  scopes: ShareScope[];
  generatedAt: string;
  weight: { startKg: number | null; startDate: string | null; goalKg: number | null; heightCm: number | null; logs: { day: string; kg: number; eveningKg: number | null }[] } | null;
  targetKcal: number | null;
  meals: { day: string; kcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null; lines: { slot: Slot; name: string; grams: number | null; servings: number | null; liquid: boolean; kcal: number }[] }[] | null;
  bp: { day: string; moment: 'MORNING' | 'EVENING'; systolic: number; diastolic: number; pulse: number | null; readings: number }[] | null;
}

/** 1.19: « Décris ton repas », « Mes repas habituels », the recap of a month, the links for a coach */
@Injectable({ providedIn: 'root' })
export class HabitsApi {
  private readonly http = inject(HttpClient);

  describe(text: string): Promise<DescribedPart[]> {
    return firstValueFrom(this.http.post<DescribedPart[]>('/api/me/meals/describe', { text }));
  }

  templates(): Promise<MealTemplate[]> {
    return firstValueFrom(this.http.get<MealTemplate[]>('/api/me/meal-templates'));
  }

  saveTemplate(name: string, day: string, slot: Slot): Promise<MealTemplate> {
    return firstValueFrom(this.http.post<MealTemplate>('/api/me/meal-templates', { name, day, slot }));
  }

  templateUsed(id: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/me/meal-templates/${id}/used`, null));
  }

  deleteTemplate(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/meal-templates/${id}`));
  }

  recap(month: string): Promise<MonthRecap> {
    return firstValueFrom(this.http.get<MonthRecap>('/api/me/recap', { params: { month } }));
  }

  shareLinks(): Promise<ShareLink[]> {
    return firstValueFrom(this.http.get<ShareLink[]>('/api/me/share-links'));
  }

  createShareLink(label: string | null, days: number, scopes: ShareScope[]): Promise<{ link: ShareLink; url: string }> {
    return firstValueFrom(this.http.post<{ link: ShareLink; url: string }>('/api/me/share-links', { label, days, scopes }));
  }

  revokeShareLink(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/share-links/${id}`));
  }

  shared(token: string): Promise<SharedView> {
    return firstValueFrom(this.http.get<SharedView>(`/api/shared/${encodeURIComponent(token)}`));
  }
}
