import { Pipe, PipeTransform, inject } from '@angular/core';
import type { Recipe } from '../core/api/models';
import { I18nService } from '../core/i18n/i18n.service';

/**
 * 1.18: a recipe's serving as a member can picture it: « 412 kcal la part · ≈ 380 g » (its weight once cooked, estimated by
 * the server from the raw ingredients), else « 412 kcal la part · 1 sur 6 » (entered with its calories only), « 412 kcal
 * la recette » for a recipe of one.
 */
export function servingText(r: Pick<Recipe, 'perServing' | 'plateG' | 'servings'>, i18n: I18nService): string {
  const kcal = i18n.number(r.perServing.kcal);
  if (r.plateG) return i18n.t('meals.serving.g', { kcal, g: i18n.number(r.plateG) });
  if ((r.servings ?? 1) > 1) return i18n.t('meals.serving.share', { kcal, n: r.servings });
  return i18n.t('meals.serving.one', { kcal });
}

@Pipe({ name: 'serving', pure: false })
export class ServingPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(r: Pick<Recipe, 'perServing' | 'plateG' | 'servings'>): string {
    return servingText(r, this.i18n);
  }
}
