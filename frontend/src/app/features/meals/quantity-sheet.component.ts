import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import type { Grade, Nutrients } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { scaled } from '../../core/meals/meals.store';
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
}

/** The amount of a food or recipe, with the nutrients updating as it changes. */
@Component({
  selector: 'app-quantity-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, NumberStepperComponent, NutriscoreComponent],
  template: `
    <dialog class="sheet" #dlg (close)="target.set(null)">
      <div class="sheet-grip"></div>
      @if (target(); as t) {
        <div class="stack">
          <div class="head">
            <div class="head-copy">
              <h2 class="h3">{{ t.name }}</h2>
              @if (t.detail) {
                <p class="small muted">{{ t.detail }}</p>
              }
            </div>
            @if (t.nutriscore) {
              <app-nutriscore [grade]="t.nutriscore" [estimated]="!!t.estimated" size="full" />
            }
          </div>
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
          <div class="facts">
            <div class="kcal"><span class="num">{{ i18n.number(live().kcal) }}</span> kcal</div>
            <dl>
              <div><dt>{{ 'meals.protein' | t }}</dt><dd class="num">{{ g(live().proteinG) }}</dd></div>
              <div><dt>{{ 'meals.carbs' | t }}</dt><dd class="num">{{ g(live().carbsG) }}</dd></div>
              <div><dt>{{ 'meals.fat' | t }}</dt><dd class="num">{{ g(live().fatG) }}</dd></div>
            </dl>
          </div>
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
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .presets .chip {
      cursor: pointer;
    }
    .facts {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--surface-2);
    }
    .kcal {
      font-weight: 650;
      color: var(--fg-2);
    }
    .kcal .num {
      display: block;
      font-weight: 850;
      font-size: 1.8rem;
      letter-spacing: -0.02em;
      color: var(--fg);
      line-height: 1;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin: 0;
    }
    dl div {
      display: grid;
      gap: 2px;
      text-align: center;
    }
    dt {
      font-size: var(--fs-xs);
      color: var(--fg-2);
      font-weight: 600;
    }
    dd {
      margin: 0;
      font-weight: 750;
    }
  `,
})
export class QuantitySheetComponent {
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  readonly confirm = output<number>();

  protected readonly presets = [50, 100, 150, 200];
  protected readonly target = signal<QuantityTarget | null>(null);
  protected readonly qty = signal(100);
  readonly busy = signal(false);
  readonly confirmLabel = signal<string | null>(null);

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
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected g(v?: number): string {
    return v == null ? '–' : `${this.i18n.number(v, v < 10 ? 1 : 0)} g`;
  }
}
