import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import type { Food, Grade, HealthDto, Nutrients, Recipe } from '../../core/api/models';
import { healthAlerts } from '../../core/meals/health';
import { cupsFor, isAlcohol } from '../../core/meals/products';
import { errorCode } from '../../core/api/api.service';
import { FavoritesStore } from '../../core/meals/favorites.store';
import { HapticDirective } from '../../core/ui/haptics';
import { ToastService } from '../../core/ui/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsStore, scaled } from '../../core/meals/meals.store';
import { DayPlan } from '../../core/meals/day-plan';
import { FoodThumbComponent } from '../../shared/food-thumb.component';
import { NutrientBarsComponent } from '../../shared/nutrient-bars.component';
import { IconComponent } from '../../shared/icon.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { HealthScoreComponent } from '../../shared/health-score.component';

/** what is being added: a food (by grams, nutrients per 100 g) or a recipe (by servings, per serving) */
export interface QuantityTarget {
  name: string;
  detail?: string;
  unit: 'g' | 'serving';
  /** per 100 g, or per serving */
  base: Nutrients;
  servingG?: number;
  /** the official Nutri-Score of a product (said in words under its health score) */
  nutriscore?: Grade;
  estimated?: boolean;
  /** 1.13: a health score given as is (a drink, a dish estimated); else the food's or the recipe's */
  health?: HealthDto | null;
  initial?: number;
  /** the food or the recipe itself: a heart to keep it in the favourites (1.9) */
  food?: Food;
  recipe?: Recipe;
  /** 1.12: the day it goes to: its bars show the rest of that day */
  day?: string;
}

/**
 * The amount of a food or recipe, with the nutrients updating as it changes. 1.13: its health score with its reasons,
 * a warning for a product rich in saturated fat, sugar or salt, and a drink measured in millilitres (a cup, a glass…).
 */
@Component({
  selector: 'app-quantity-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, NumberStepperComponent, HealthScoreComponent, HapticDirective, FoodThumbComponent, NutrientBarsComponent],
  template: `
    <dialog class="sheet" #dlg (close)="target.set(null)">
      <div class="sheet-grip"></div>
      @if (target(); as t) {
        <div class="stack">
          <div class="head">
            <!-- 1.12: the product's picture (Open Food Facts) or the recipe's photo -->
            @if (t.food?.imageUrl || t.recipe?.thumbUrl) {
              <app-food-thumb class="q-thumb" [url]="t.food?.imageUrl ?? t.recipe?.thumbUrl" [group]="t.recipe ? t.recipe.type : 'PRODUCT'" />
            }
            <div class="head-copy">
              <h2 class="h3">{{ t.name }}</h2>
              @if (t.detail) {
                <p class="small muted">{{ t.detail }}</p>
              }
            </div>
            @if (t.food || t.recipe) {
              <span class="haptic">
                <button type="button" class="icon-btn fav" [class.on]="favorite()" [attr.aria-pressed]="favorite()"
                  [attr.aria-label]="(favorite() ? 'meals.favorites.remove' : 'meals.favorites.add') | t" (click)="toggleFavorite(t)">
                  <app-icon name="heart" />
                </button><input appHaptic="success" />
              </span>
            }
          </div>
          <!-- 1.13: the health score, what makes it good and what costs it points -->
          @if (health(); as h) {
            <div class="health">
              <app-health-score [score]="h.score" size="full" />
              @if (h.pros.length || h.cons.length) {
                <ul class="reasons" role="list">
                  @for (p of h.pros; track p) {
                    <li class="pro"><app-icon name="check" [size]="13" [stroke]="3" /> {{ 'meals.health.pros.' + p | t }}</li>
                  }
                  @for (c of h.cons; track c) {
                    <li class="con"><app-icon name="minus" [size]="13" [stroke]="3" /> {{ 'meals.health.cons.' + c | t }}</li>
                  }
                </ul>
              }
            </div>
          } @else if (t.food && alcohol()) {
            <p class="tiny muted">{{ 'meals.health.alcohol' | t }}</p>
          }
          <!-- 1.12: how fresh the product's data is, on its own line under the name -->
          @if (t.food?.dataUpdatedAt; as at) {
            <p class="tiny muted updated"><app-icon name="clock" [size]="13" /> {{ 'meals.quantity.offUpdated' | t: { date: i18n.date(at, { day: 'numeric', month: 'long', year: 'numeric' }) } }}</p>
          }
          @if (t.unit === 'g' && liquid()) {
            <!-- 1.13: a drink, a milk, a soup: a cup, a glass, a mug, a bowl, its can or bottle -->
            <div class="presets" role="group" [attr.aria-label]="'meals.quantity.mlLabel' | t">
              @for (c of cups(); track c.key) {
                <button type="button" class="chip" [class.chip-accent]="qty() === c.ml" (click)="qty.set(c.ml)">
                  {{ 'meals.quantity.cups.' + c.key | t }} · {{ c.ml }} ml
                </button>
              }
              @if (t.servingG && !cupMl(t.servingG)) {
                <button type="button" class="chip" [class.chip-accent]="qty() === t.servingG" (click)="qty.set(t.servingG)">
                  {{ 'meals.quantity.portionMl' | t: { ml: i18n.number(t.servingG) } }}
                </button>
              }
            </div>
            <app-number-stepper [(value)]="qty" [step]="10" [min]="1" [max]="5000" [decimals]="0" unit="ml" [label]="'meals.quantity.mlLabel' | t"
              [minusLabel]="'meals.quantity.minus' | t" [plusLabel]="'meals.quantity.plus' | t" />
          } @else if (t.unit === 'g') {
            <div class="presets" role="group" [attr.aria-label]="'meals.quantity.gramsLabel' | t">
              @if (t.servingG) {
                <button type="button" class="chip" [class.chip-accent]="qty() === t.servingG" (click)="qty.set(t.servingG)">
                  {{ 'meals.quantity.portion' | t: { g: i18n.number(t.servingG) } }}
                </button>
              }
              @for (g of presets; track g) {
                <button type="button" class="chip" [class.chip-accent]="qty() === g" (click)="qty.set(g)">{{ g }} g</button>
              }
            </div>
            <app-number-stepper [(value)]="qty" [step]="5" [min]="1" [max]="5000" [decimals]="0" unit="g" [label]="'meals.quantity.gramsLabel' | t"
              [minusLabel]="'meals.quantity.minus' | t" [plusLabel]="'meals.quantity.plus' | t" />
          } @else {
            <app-number-stepper [(value)]="qty" [step]="0.5" [min]="0.25" [max]="20" [decimals]="2" [label]="'meals.quantity.servingsLabel' | t"
              [minusLabel]="'meals.quantity.minus' | t" [plusLabel]="'meals.quantity.plus' | t" />
          }
          <!-- 1.12: what it brings, with the bars of the Meals tab (the rest of the day paler) -->
          <app-nutrient-bars [item]="live()" [plan]="plan.bars()" [dayTotals]="rest()" />
          <!-- 1.13: a product rich in saturated fat, sugar or salt says so, and why it matters -->
          @for (a of alerts(); track a.key) {
            <p class="alert small"><app-icon name="alert" [size]="16" /> <span>{{ 'meals.health.alerts.' + a.key | t: { v: i18n.number(a.value, 1), u: liquid() ? 'ml' : 'g' } }}</span></p>
          }
          @if (t.food?.source === 'OFF' && t.food.nutriscore && !t.food.nutriscoreEstimated) {
            <p class="tiny muted">{{ 'meals.health.official' | t: { grade: t.food!.nutriscore!.toUpperCase() } }}</p>
          }
          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="confirm.emit(qty())">
            <app-icon name="plus" /> {{ confirmLabel() || ('meals.quantity.confirm' | t) }}
          </button>
        </div>
      }
    </dialog>
  `,
  styles: `
    .head {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
    }
    .head-copy {
      flex: 1;
      min-width: 0;
    }
    .fav {
      color: var(--fg-3);
      transition: color var(--dur-2);
    }
    .fav.on {
      color: #e5484d;
    }
    .fav.on ::ng-deep svg {
      fill: currentColor;
      animation: heart 420ms var(--ease-out);
    }
    @keyframes heart {
      40% {
        transform: scale(1.3);
      }
    }
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .presets .chip {
      cursor: pointer;
    }
    .q-thumb {
      --thumb: 64px;
      --thumb-radius: 16px;
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .health {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      margin-top: calc(-1 * var(--space-1));
    }
    .reasons {
      display: flex;
      flex: 1 1 100%;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .reasons li {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px 4px 7px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 650;
    }
    .pro {
      background: color-mix(in srgb, var(--success, #1f9d55) 13%, transparent);
      color: color-mix(in srgb, var(--success, #1f9d55) 55%, var(--fg));
    }
    .con {
      background: color-mix(in srgb, #e2711d 13%, transparent);
      color: color-mix(in srgb, #e2711d 50%, var(--fg));
    }
    .alert {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0;
      padding: var(--space-3);
      border-radius: 16px;
      background: color-mix(in srgb, #e2711d 10%, transparent);
      color: var(--fg);
    }
    .alert app-icon {
      flex: none;
      margin-top: 1px;
      color: #e2711d;
    }
    .updated {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: calc(-1 * var(--space-2)) 0 0;
    }
  `,
})
export class QuantitySheetComponent {
  protected readonly i18n = inject(I18nService);
  private readonly favorites = inject(FavoritesStore);
  private readonly toast = inject(ToastService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly favorite = computed(() => {
    const t = this.target();
    return t?.food ? this.favorites.isFood(t.food.id) : t?.recipe ? this.favorites.isRecipe(t.recipe.id) : false;
  });

  protected async toggleFavorite(t: QuantityTarget): Promise<void> {
    try {
      const on = t.food ? await this.favorites.toggleFood(t.food) : await this.favorites.toggleRecipe(t.recipe!);
      this.toast.show(this.i18n.t(on ? 'meals.favorites.added' : 'meals.favorites.removed', { name: t.name }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
  readonly confirm = output<number>();

  protected readonly presets = [50, 100, 150, 200];
  protected readonly target = signal<QuantityTarget | null>(null);
  protected readonly qty = signal(100);
  readonly busy = signal(false);
  readonly confirmLabel = signal<string | null>(null);

  protected readonly plan = inject(DayPlan);
  private readonly meals = inject(MealsStore);
  /** the day it goes to, as it stands (when it is the one loaded) */
  protected readonly rest = computed<Nutrients | null>(() => {
    const t = this.target();
    const d = this.meals.data();
    return t?.day && d?.day === t.day ? d.totals : null;
  });

  /** 1.13: the health score shown: the one given, else the food's, else the recipe's */
  protected readonly health = computed<HealthDto | null>(() => {
    const t = this.target();
    if (!t) return null;
    if (t.health !== undefined) return t.health;
    return t.food?.health ?? t.recipe?.health ?? null;
  });
  protected readonly alcohol = computed(() => !!this.target()?.food && isAlcohol(this.target()!.food!));
  /** a drink, a milk, a soup: in millilitres */
  protected readonly liquid = computed(() => {
    const t = this.target();
    return t?.unit === 'g' && !!t.food?.liquid;
  });
  protected readonly cups = computed(() => (this.target()?.food ? cupsFor(this.target()!.food!) : []));
  protected cupMl(ml: number): boolean {
    return this.cups().some((c) => c.ml === ml);
  }
  /** the guides of the traffic lights, per 100 g (half for a drink) */
  protected readonly alerts = computed(() => {
    const f = this.target()?.food;
    if (!f) return [];
    return healthAlerts({ ...f.per100, drink: !!f.liquid && f.kind !== 'Milk and yogurt' && f.category !== 'laits', alcohol: this.alcohol() });
  });

  protected readonly live = computed<Nutrients>(() => {
    const t = this.target();
    if (!t) return { kcal: 0 };
    return scaled(t.base, t.unit === 'g' ? this.qty() / 100 : this.qty());
  });

  open(t: QuantityTarget, confirmLabel: string | null = null): void {
    this.target.set(t);
    this.confirmLabel.set(confirmLabel);
    // a drink starts at a glass
    const serving = t.food?.liquid && (t.servingG ?? 0) < 150 ? 200 : (t.servingG ?? (t.food?.liquid ? 200 : 100));
    this.qty.set(t.initial ?? (t.unit === 'g' ? serving : 1));
    this.busy.set(false);
    if (t.food || t.recipe) void this.favorites.ensure();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }
}
