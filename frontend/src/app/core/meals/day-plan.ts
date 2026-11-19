import { Injectable, computed, inject } from '@angular/core';
import type { MacroSplit } from '../api/models';
import { TrackingStore } from '../tracking/tracking.store';
import { macroPlan } from './macro-plan';
import { MealsStore } from './meals.store';
import type { BarsPlan } from '../../shared/nutrient-bars.component';

/** 1.12: the day's guides (calories and macros in grams) wherever a food's bars are drawn, as the Meals tab counts them */
@Injectable({ providedIn: 'root' })
export class DayPlan {
  private readonly tracking = inject(TrackingStore);
  private readonly meals = inject(MealsStore);

  readonly kcal = computed(() => this.meals.data()?.targetKcal ?? this.tracking.summary()?.energy.targetKcal ?? 2000);
  private readonly split = computed<MacroSplit>(() => this.tracking.summary()?.profile.macroSplit ?? 'BALANCED');
  readonly bars = computed<BarsPlan>(() => {
    const s = this.tracking.summary();
    const p = macroPlan(this.kcal(), this.split(), s?.current.weightKg ?? s?.profile.startWeightKg, s?.profile.goalWeightKg);
    return { kcal: this.kcal(), proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG, fiberG: p.fiberG };
  });
}
