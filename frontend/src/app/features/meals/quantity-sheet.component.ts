import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import type { Food, Grade, Nutrients, Recipe } from '../../core/api/models';
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
import { NutriscoreComponent } from '../../shared/nutriscore.component';

/** what is being added: a food (by grams, nutrients per 100 g) or a recipe (by servings, per serving) */
export interface QuantityTarget {
  name: string;
  detail?: string;
  unit: 'g' | 'serving';
  /** per 100 g, or per serving */
  base: Nutrients;
  servingG?: number;
  nutriscore?: Grade;
  estimated?: boolean;
  initial?: number;
  /** the food or the recipe itself: a heart to keep it in the favourites (1.9) */
  food?: Food;
  recipe?: Recipe;
  /** 1.12: the day it goes to: its bars show the rest of that day */
  day?: string;
}

/** The amount of a food or recipe, with the nutrients updating as it changes. */
@Component({
  selector: 'app-quantity-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, NumberStepperComponent, NutriscoreComponent, HapticDirective, FoodThumbComponent, NutrientBarsComponent],
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
            @if (t.nutriscore) {
              <app-nutriscore [grade]="t.nutriscore" [estimated]="!!t.estimated" size="full" />
            }
            @if (t.food || t.recipe) {
              <span class="haptic">
                <button type="button" class="icon-btn fav" [class.on]="favorite()" [attr.aria-pressed]="favorite()"
                  [attr.aria-label]="(favorite() ? 'meals.favorites.remove' : 'meals.favorites.add') | t" (click)="toggleFavorite(t)">
                  <app-icon name="heart" />
                </button><input appHaptic="success" />
              </span>
            }
          </div>
          <!-- 1.12: how fresh the product's data is, on its own line under the name -->
          @if (t.food?.dataUpdatedAt; as at) {
            <p class="tiny muted updated"><app-icon name="clock" [size]="13" /> {{ 'meals.quantity.offUpdated' | t: { date: i18n.date(at, { day: 'numeric', month: 'long', year: 'numeric' }) } }}</p>
          }
          @if (t.unit === 'g') {
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

  protected readonly live = computed<Nutrients>(() => {
    const t = this.target();
    if (!t) return { kcal: 0 };
    return scaled(t.base, t.unit === 'g' ? this.qty() / 100 : this.qty());
  });

  open(t: QuantityTarget, confirmLabel: string | null = null): void {
    this.target.set(t);
    this.confirmLabel.set(confirmLabel);
    this.qty.set(t.initial ?? (t.unit === 'g' ? (t.servingG ?? 100) : 1));
    this.busy.set(false);
    if (t.food || t.recipe) void this.favorites.ensure();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }
}
