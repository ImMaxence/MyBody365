import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import type { Food, Recipe, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { MealsStore, slotNow } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { FoodPickerComponent, Picked } from './food-picker.component';
import { QuantitySheetComponent } from './quantity-sheet.component';

const SLOTS: Slot[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** Adding to a meal: search, recents, recipes, barcode, then the amount. */
@Component({
  selector: 'app-meal-add',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, BackButtonComponent, FoodPickerComponent, QuantitySheetComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.addTo.' + slot() | t }}</h1>
      </header>
      <app-food-picker
        [recent]="store.recent() ?? []"
        [recipes]="recipes()"
        scanLink="/app/meals/scan"
        createLink="/app/meals/food/new"
        (picked)="pick($event)"
      />
      <app-quantity-sheet (confirm)="add($event)" />
    </main>
  `,
})
export class MealAddPage {
  readonly slotParam = input<string | undefined>(undefined, { alias: 'slot' });
  readonly dayParam = input<string | undefined>(undefined, { alias: 'day' });
  protected readonly store = inject(MealsStore);
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  private readonly i18n = inject(I18nService);
  private readonly sheet = viewChild.required(QuantitySheetComponent);

  protected readonly slot = computed<Slot>(() => {
    const s = this.slotParam() as Slot | undefined;
    return s && SLOTS.includes(s) ? s : slotNow();
  });
  protected readonly day = computed(() => (this.dayParam() && /^\d{4}-\d{2}-\d{2}$/.test(this.dayParam()!) ? this.dayParam()! : localDay()));
  protected readonly recipes = signal<Recipe[]>([]);
  private current: { kind: 'FOOD' | 'RECIPE'; id: string; name: string } | null = null;

  constructor() {
    void this.store.loadRecent().catch(() => undefined);
    void this.api
      .myRecipes()
      .then((r) => this.recipes.set(r))
      .catch(() => undefined);
    // back from the scanner or from a new food: open its amount straight away
    effect(() => {
      const p = this.store.pick();
      if (!p) return;
      this.store.pick.set(null);
      const load = p.kind === 'FOOD' ? this.api.food(p.id).then((f) => this.openFood(f)) : this.api.recipe(p.id).then((r) => this.openRecipe(r));
      load.catch((e) => this.toast.error(this.i18n.error(errorCode(e))));
    });
  }

  protected pick(p: Picked): void {
    if (p.kind === 'FOOD') this.openFood(p.food);
    else if (p.kind === 'RECIPE') this.openRecipe(p.recipe);
    else {
      const r = p.item;
      const load = r.kind === 'FOOD' ? this.api.food(r.id).then((f) => this.openFood(f, r.grams)) : this.api.recipe(r.id).then((x) => this.openRecipe(x, r.servings));
      load.catch((e) => this.toast.error(this.i18n.error(errorCode(e))));
    }
  }

  private openFood(f: Food, initial?: number): void {
    this.current = { kind: 'FOOD', id: f.id, name: f.name };
    this.sheet().open({
      name: f.name,
      detail: f.brand ?? f.category ?? this.i18n.t('meals.search.sources.' + f.source),
      unit: 'g',
      base: f.per100,
      servingG: f.servingG,
      nutriscore: f.nutriscore,
      estimated: f.nutriscoreEstimated,
      initial,
    });
  }

  private openRecipe(r: Recipe, initial?: number): void {
    this.current = { kind: 'RECIPE', id: r.id, name: r.name };
    this.sheet().open({ name: r.name, detail: this.i18n.t('meals.perServing'), unit: 'serving', base: r.perServing, nutriscore: r.nutriscore, estimated: true, initial });
  }

  protected async add(qty: number): Promise<void> {
    const c = this.current;
    if (!c) return;
    this.sheet().busy.set(true);
    try {
      await this.store.add({
        day: this.day(),
        slot: this.slot(),
        ...(c.kind === 'FOOD' ? { foodId: c.id, grams: qty } : { recipeId: c.id, servings: qty }),
      });
      this.sheet().close();
      this.toast.show(this.i18n.t('meals.search.added', { name: c.name }));
      this.stack.back('/app/meals');
    } catch (e) {
      this.sheet().busy.set(false);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
