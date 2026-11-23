import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { SweetGroup, SweetItem, sweetGroup, sweetTotal } from '../../core/meals/sweets';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { closeSheet } from '../../core/ui/sheets';
import { IconComponent } from '../../shared/icon.component';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { ESTIMATE_STYLES, EstimatedItem } from './fast-food-sheet.component';

/**
 * 1.18: « Pâtisseries et chocolats »: a viennoiserie, a pastry of the window, a small cake, chocolates or sweets, how many
 * (pieces, slices, squares, spoons, a handful), with its calories and its health score. One line is added to the meal.
 */
@Component({
  selector: 'app-sweets-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HealthScoreComponent, TranslatePipe, IconComponent, NumberStepperComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="g() ? ('meals.sweets.groups.' + g()!.key | t) : ''">
      <div class="sheet-grip"></div>
      @if (g(); as group) {
        <div class="stack">
          <div>
            <h2 class="h3"><span aria-hidden="true">{{ group.emoji }}</span> {{ 'meals.sweets.groups.' + group.key | t }}</h2>
            <p class="small muted">{{ 'meals.sweets.text' | t }}</p>
          </div>

          <div class="opts" role="radiogroup" [attr.aria-label]="'meals.sweets.which' | t">
            @for (x of group.items; track x.key) {
              <button type="button" class="opt" role="radio" [attr.aria-checked]="item()?.key === x.key" (click)="choose(x)">
                <span class="opt-name">{{ 'meals.sweets.items.' + x.key | t }}</span>
                <span class="opt-foot">
                  <span class="opt-kcal num">≈ {{ i18n.number(oneKcal(x)) }} kcal</span>
                  <span class="tiny muted num">{{ unitOf(x, 1) }} · {{ i18n.number(x.g, x.g % 1 ? 1 : 0) }} g</span>
                </span>
              </button>
            }
          </div>

          @if (item(); as x) {
            <p class="tiny muted center">{{ 'meals.sweets.note' | t }}</p>
            <!-- always in view at the bottom of the sheet, however long the list above: how many, what it makes, add -->
            <div class="foot">
              <div class="count-row">
                <div class="count">
                  <app-number-stepper [(value)]="count" [step]="1" [min]="1" [max]="maxOf(x)" [decimals]="0" [compact]="true"
                    [label]="'meals.sweets.count' | t" />
                </div>
                <div class="sum" aria-live="polite">
                  <span class="sum-top">
                    <b class="num">≈ {{ i18n.number(total().kcal) }} kcal</b>
                    @if (total().health != null) {
                      <app-health-score [score]="total().health!" />
                    }
                  </span>
                  <span class="tiny muted num">{{ unitOf(x, count()) }} · {{ i18n.number(total().grams) }} g</span>
                </div>
              </div>
              <p class="tiny muted num macros">
                {{ 'meals.estimate.macros' | t: { p: i18n.number(total().proteinG, 1), c: i18n.number(total().carbsG, 1), f: i18n.number(total().fatG, 1) } }}
                · {{ 'meals.sweets.sugars' | t: { s: i18n.number(total().sugarsG, 1) } }}
              </p>
              <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="add()">
                <app-icon name="plus" /> {{ 'meals.estimate.add' | t: { slot: slotLower() } }}
              </button>
            </div>
          }
        </div>
      }
    </dialog>
  `,
  styles: [
    ESTIMATE_STYLES,
    `
      .opt-foot {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 2px 6px;
      }
      /* stuck to the bottom of the sheet (the sheet itself scrolls), over the list, reaching its edges */
      .foot {
        position: sticky;
        bottom: calc(-1 * (var(--space-6) + var(--safe-bottom)));
        z-index: 2;
        display: grid;
        gap: 6px;
        margin: 0 calc(-1 * var(--space-5)) calc(-1 * (var(--space-6) + var(--safe-bottom)));
        padding: var(--space-3) var(--space-5) calc(var(--space-4) + var(--safe-bottom));
        border-top: 1px solid var(--line);
        background: var(--surface);
        box-shadow: 0 -12px 24px -18px rgba(0, 0, 0, 0.35);
      }
      .count-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .count {
        flex: none;
        width: 168px;
      }
      .sum {
        display: grid;
        flex: 1;
        min-width: 0;
        justify-items: end;
        gap: 2px;
        text-align: right;
      }
      .sum-top {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      }
      .sum b {
        font-size: 1.2rem;
      }
      .sum span {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .macros {
        margin: 0;
        text-align: right;
      }
    `,
  ],
})
export class SweetsSheetComponent {
  readonly slotLabel = input('');
  protected readonly slotLower = computed(() => this.slotLabel().charAt(0).toLowerCase() + this.slotLabel().slice(1));
  readonly busy = signal(false);
  readonly confirm = output<EstimatedItem[]>();
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly g = signal<SweetGroup | null>(null);
  protected readonly item = signal<SweetItem | null>(null);
  protected readonly count = signal(1);
  protected readonly total = computed(() => sweetTotal(this.item()!, this.count()));

  open(key: string): void {
    const g = sweetGroup(key);
    if (!g) return;
    this.g.set(g);
    this.choose(g.items.find((x) => x.key === g.usual) ?? g.items[0]);
    this.busy.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dialog().nativeElement);
  }

  protected choose(x: SweetItem): void {
    this.item.set(x);
    this.count.set(x.usual ?? 1);
  }

  protected oneKcal(x: SweetItem): number {
    return Math.round((x.per100.kcal * x.g) / 100);
  }

  /** a box of chocolates, a bag of sweets: more of the small ones */
  protected maxOf(x: SweetItem): number {
    return x.g <= 15 ? 30 : 10;
  }

  /** « 1 pièce », « 3 carrés », « 1 part » */
  protected unitOf(x: SweetItem, n: number): string {
    const u = 'meals.sweets.units.' + x.unit + (n === 1 ? '.one' : '.many');
    return this.i18n.t(u, { n });
  }


  /** « Éclair », « Chocolat noir 70 % · 2 carrés », « Macaron · 3 pièces » */
  protected add(): void {
    const x = this.item();
    if (!x) return;
    const n = this.count();
    const t = this.total();
    let name = this.i18n.t('meals.sweets.items.' + x.key);
    if (n > 1 || x.unit !== 'piece') name += ` · ${this.unitOf(x, n)}`;
    const r = (v: number) => Math.round(v * 10) / 10;
    this.confirm.emit([
      {
        name,
        kcal: Math.round(t.kcal),
        proteinG: r(t.proteinG),
        carbsG: r(t.carbsG),
        fatG: r(t.fatG),
        sugarsG: r(t.sugarsG),
        satFatG: r(t.satFatG),
        fiberG: r(t.fiberG),
        saltG: Math.round(t.saltG * 100) / 100,
        health: t.health,
      },
    ]);
  }
}
