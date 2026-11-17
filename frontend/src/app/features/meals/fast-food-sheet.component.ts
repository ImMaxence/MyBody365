import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DRINKS, Dish, FRIES, Portion, dish, estimate, gradeOf } from '../../core/meals/fast-food';
import type { Grade } from '../../core/meals/nutriscore';
import { NutriscoreComponent } from '../../shared/nutriscore.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { closeSheet } from '../../core/ui/sheets';
import { IconComponent } from '../../shared/icon.component';

/** what the meal page adds: one line per item (the dish, its fries, an extra, the drink) */
export interface EstimatedItem {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarsG?: number;
  satFatG?: number;
  saltG?: number;
  fiberG?: number;
  nutriscore?: Grade;
}

/**
 * A meal at the snack bar or the restaurant, by estimate: the format, fries with it, a sauce, a drink.
 * The total updates at each choice; each item is then added on its own line (handy in the statistics).
 */
@Component({
  selector: 'app-fast-food-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NutriscoreComponent, TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="d() ? ('meals.quick.dishes.' + d()!.key | t) : ''">
      <div class="sheet-grip"></div>
      @if (d(); as dish) {
        <div class="stack">
          <div>
            <h2 class="h3"><span aria-hidden="true">{{ dish.emoji }}</span> {{ 'meals.quick.dishes.' + dish.key | t }}</h2>
            <p class="small muted">{{ 'meals.estimate.text' | t }}</p>
          </div>

          <h3 class="section-title">{{ 'meals.estimate.format' | t }}</h3>
          <div class="opts" role="radiogroup" [attr.aria-label]="'meals.estimate.format' | t">
            @for (f of dish.formats; track f.key) {
              <button type="button" class="opt" role="radio" [attr.aria-checked]="format() === f.key" (click)="format.set(f.key)">
                <span class="opt-name">{{ 'meals.estimate.formats.' + dish.key + '.' + f.key | t }}</span>
                <span class="opt-foot">
                  <span class="opt-kcal num">≈ {{ i18n.number(f.kcal) }} kcal</span>
                  @if (grade(f); as g) {
                    <i class="ns" [attr.data-g]="g" [attr.aria-label]="'meals.estimate.gradeOf' | t: { g: g.toUpperCase() }">{{ g.toUpperCase() }}</i>
                  }
                </span>
              </button>
            }
          </div>

          @if (dish.fries) {
            <h3 class="section-title">{{ 'meals.estimate.fries' | t }}</h3>
            <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.fries' | t">
              @for (f of friesOptions; track f.key) {
                <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="fries() === f.key" (click)="fries.set(f.key)">
                  {{ 'meals.estimate.friesSizes.' + f.key | t }}
                  @if (f.kcal) {
                    <small class="num">{{ i18n.number(f.kcal) }}</small>
                  }
                  @if (grade(f); as g) {
                    <i class="ns" [attr.data-g]="g" [attr.aria-label]="'meals.estimate.gradeOf' | t: { g: g.toUpperCase() }">{{ g.toUpperCase() }}</i>
                  }
                </button>
              }
            </div>
          }

          @if (dish.extras.length) {
            <h3 class="section-title">{{ 'meals.estimate.extras' | t }}</h3>
            <div class="chips" role="group" [attr.aria-label]="'meals.estimate.extras' | t">
              @for (x of dish.extras; track x.key) {
                <button type="button" class="chip-opt" [attr.aria-pressed]="extras().includes(x.key)" (click)="toggle(x.key)">
                  {{ 'meals.estimate.extraNames.' + x.key | t }} <small class="num">+{{ i18n.number(x.kcal) }}</small>
                  @if (grade(x); as g) {
                    <i class="ns" [attr.data-g]="g" [attr.aria-label]="'meals.estimate.gradeOf' | t: { g: g.toUpperCase() }">{{ g.toUpperCase() }}</i>
                  }
                </button>
              }
            </div>
          }

          <h3 class="section-title">{{ 'meals.estimate.drink' | t }}</h3>
          <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.drink' | t">
            @for (x of drinks; track x.key) {
              <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="drink() === x.key" (click)="drink.set(x.key)">
                {{ 'meals.estimate.drinks.' + x.key | t }}
                @if (x.kcal > 1) {
                  <small class="num">{{ i18n.number(x.kcal) }}</small>
                }
                @if (grade(x); as g) {
                  <i class="ns" [attr.data-g]="g" [attr.aria-label]="'meals.estimate.gradeOf' | t: { g: g.toUpperCase() }">{{ g.toUpperCase() }}</i>
                }
              </button>
            }
          </div>
          <p class="tiny muted">{{ 'meals.estimate.otherDrink' | t }}</p>

          <section class="total" aria-live="polite">
            <div class="total-head">
              <span class="small muted">{{ 'meals.estimate.total' | t }}</span>
              <b class="num">≈ {{ i18n.number(result().total.kcal) }} kcal</b>
            </div>
            <p class="tiny muted num">
              {{ 'meals.estimate.macros' | t: { p: i18n.number(result().total.proteinG), c: i18n.number(result().total.carbsG), f: i18n.number(result().total.fatG) } }}
            </p>
            @if (result().grade; as g) {
              <div class="total-ns">
                <span class="small">{{ 'meals.estimate.mealGrade' | t }}</span>
                <app-nutriscore [grade]="g" [estimated]="true" />
              </div>
            }
          </section>

          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="add()">
            <app-icon name="plus" /> {{ 'meals.estimate.add' | t: { slot: slotLower() } }}
          </button>
          <p class="tiny muted center">{{ 'meals.estimate.note' | t }}</p>
        </div>
      }
    </dialog>
  `,
  styles: `
    .opts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .opt {
      display: grid;
      gap: 2px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      box-shadow: inset 0 0 0 1px var(--line);
      text-align: left;
      transition: background-color var(--dur-2), box-shadow var(--dur-2), transform var(--dur-1) var(--ease-out);
    }
    .opt:active,
    .chip-opt:active {
      transform: scale(0.97);
    }
    .opt[aria-checked='true'] {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent);
    }
    .opt-name {
      font-weight: 650;
      line-height: 1.25;
    }
    .opt-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .opt-kcal {
      font-size: var(--fs-s);
      color: var(--fg-2);
    }
    /* a portion's estimated Nutri-Score: its letter in the colour of the scale */
    .ns {
      display: inline-grid;
      place-items: center;
      width: 20px;
      height: 20px;
      flex: none;
      align-self: center;
      border-radius: 6px;
      font-style: normal;
      font-size: 11px;
      font-weight: 800;
      color: #fff;
    }
    .ns[data-g='a'] {
      background: #038141;
    }
    .ns[data-g='b'] {
      background: #4f7a1d;
    }
    .ns[data-g='c'] {
      background: #fecb02;
      color: #16130f;
    }
    .ns[data-g='d'] {
      background: #ee8100;
      color: #16130f;
    }
    .ns[data-g='e'] {
      background: #c8330b;
    }
    .total-ns {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-top: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--line);
    }
    .opt[aria-checked='true'] .opt-kcal {
      color: var(--accent-text);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip-opt {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      min-height: 40px;
      padding: 9px 14px;
      border-radius: var(--radius-pill);
      box-shadow: inset 0 0 0 1px var(--line-strong);
      color: var(--fg-2);
      font-size: var(--fs-s);
      font-weight: 650;
      transition: background-color var(--dur-2), color var(--dur-2), transform var(--dur-1) var(--ease-out);
    }
    /* the calories of a choice: smaller, in the secondary ink (contrast AA, no transparency) */
    .chip-opt small {
      font-size: 11px;
      font-weight: 600;
      color: var(--fg-2);
    }
    .chip-opt[aria-checked='true'] small,
    .chip-opt[aria-pressed='true'] small {
      color: var(--accent-text);
    }
    .chip-opt[aria-checked='true'],
    .chip-opt[aria-pressed='true'] {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent);
      color: var(--accent-text);
    }
    .total {
      display: grid;
      gap: 2px;
      padding: 14px 16px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .total-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .total b {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .center {
      text-align: center;
    }
  `,
})
export class FastFoodSheetComponent {
  /** the meal it goes to, for the button */
  readonly slotLabel = input('');
  /** « Au déjeuner » → « Ajouter au déjeuner » */
  protected readonly slotLower = computed(() => this.slotLabel().charAt(0).toLowerCase() + this.slotLabel().slice(1));
  readonly busy = signal(false);
  /** the items to add, one per line */
  readonly confirm = output<EstimatedItem[]>();
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly d = signal<Dish | null>(null);
  protected readonly format = signal('');
  protected readonly fries = signal('none');
  protected readonly extras = signal<string[]>([]);
  protected readonly drink = signal('none');
  protected readonly friesOptions = FRIES;
  protected readonly drinks = DRINKS;

  protected readonly result = computed(() => {
    const d = this.d();
    return d
      ? estimate(d, this.format(), this.fries(), this.extras(), this.drink())
      : { lines: [], total: { key: 'total', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, grade: null };
  });

  open(key: string): void {
    const d = dish(key);
    if (!d) return;
    this.d.set(d);
    this.format.set(d.usual);
    this.fries.set('none');
    this.extras.set([]);
    this.drink.set('none');
    this.busy.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dialog().nativeElement);
  }

  protected grade(x: Portion): Grade | null {
    return gradeOf(x);
  }

  protected toggle(key: string): void {
    this.extras.update((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  protected add(): void {
    const d = this.d();
    if (!d) return;
    const name = (kind: string, p: Portion) => {
      switch (kind) {
        case 'main':
          return `${this.i18n.t('meals.quick.dishes.' + d.key)} (${this.i18n.t('meals.estimate.formats.' + d.key + '.' + p.key)})`;
        case 'fries':
          return `${this.i18n.t('meals.quick.dishes.fries')} (${this.i18n.t('meals.estimate.friesSizes.' + p.key)})`;
        case 'extra':
          return this.i18n.t('meals.estimate.extraNames.' + p.key);
        default:
          return this.i18n.t('meals.estimate.drinks.' + p.key);
      }
    };
    this.confirm.emit(
      this.result().lines.map((l) => ({
        name: name(l.kind, l.portion),
        kcal: l.portion.kcal,
        proteinG: l.portion.proteinG,
        carbsG: l.portion.carbsG,
        fatG: l.portion.fatG,
        sugarsG: l.portion.sugarsG,
        satFatG: l.portion.satFatG,
        saltG: l.portion.saltG,
        fiberG: l.portion.fiberG,
        nutriscore: l.grade ?? undefined,
      })),
    );
  }
}
