import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Recipe, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { shiftDay } from '../../core/meals/meals.store';
import { PLAN_DAYS, PlanStore } from '../../core/meals/plan.store';
import { localDay } from '../../core/tracking/tracking.store';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';

/** 1.20: « Prévoir », from a recipe's page: which day of the next two weeks, which meal, how many servings */
@Component({
  selector: 'app-plan-when-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, NumberStepperComponent],
  template: `
    <dialog class="sheet" #dlg [attr.aria-label]="'plan.whenTitle' | t">
      <div class="sheet-grip"></div>
      @if (recipe(); as r) {
        <div class="stack">
          <div>
            <h2 class="h3">{{ 'plan.whenTitle' | t }}</h2>
            <p class="small muted">{{ r.name }}</p>
          </div>
          <div class="days" role="group" [attr.aria-label]="'plan.whichDay' | t">
            @for (d of days; track d) {
              <button type="button" class="day-chip" [attr.aria-pressed]="day() === d" (click)="day.set(d)">{{ chip(d) }}</button>
            }
          </div>
          <div class="seg" role="group" [attr.aria-label]="'plan.slot' | t">
            @for (s of slots; track s) {
              <button type="button" [attr.aria-pressed]="slot() === s" (click)="slot.set(s)">{{ 'meals.slots.' + s | t }}</button>
            }
          </div>
          <app-number-stepper [(value)]="servings" [step]="0.5" [min]="0.5" [max]="20" [decimals]="1" [label]="'meals.quantity.servingsLabel' | t" />
          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="save(r)"><app-icon name="calendar" /> {{ 'plan.planIt' | t }}</button>
        </div>
      }
    </dialog>
  `,
  styles: `
    .days {
      display: flex;
      gap: 8px;
      margin: 0 calc(var(--space-5) * -1);
      padding: 2px var(--space-5);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .days::-webkit-scrollbar {
      display: none;
    }
    .day-chip {
      flex: none;
      padding: 8px 12px;
      border: 1.5px solid var(--line-strong);
      border-radius: var(--radius-pill);
      background: var(--surface);
      color: var(--fg);
      font: inherit;
      font-size: var(--fs-s);
      font-weight: 650;
      white-space: nowrap;
      cursor: pointer;
    }
    .day-chip[aria-pressed='true'] {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent-text);
    }
  `,
})
export class PlanWhenSheetComponent {
  private readonly store = inject(PlanStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly slots: Slot[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
  private readonly today = localDay();
  protected readonly days = Array.from({ length: PLAN_DAYS }, (_, i) => shiftDay(this.today, i));
  protected readonly recipe = signal<Recipe | null>(null);
  protected readonly day = signal(this.today);
  protected readonly slot = signal<Slot>('DINNER');
  protected readonly servings = signal(1);
  protected readonly busy = signal(false);

  open(r: Recipe, slot: Slot): void {
    this.recipe.set(r);
    this.day.set(shiftDay(this.today, 1));
    this.slot.set(slot);
    this.servings.set(1);
    this.dlg().nativeElement.showModal();
  }

  protected chip(d: string): string {
    if (d === this.today) return this.i18n.t('plan.today');
    if (d === shiftDay(this.today, 1)) return this.i18n.t('plan.tomorrow');
    return this.i18n.date(d, { weekday: 'short', day: 'numeric' });
  }

  protected async save(r: Recipe): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.add({ day: this.day(), slot: this.slot(), recipeId: r.id, servings: this.servings() });
      closeSheet(this.dlg().nativeElement);
      const when = `${this.chip(this.day()).toLowerCase()} · ${this.i18n.t('meals.slots.' + this.slot()).toLowerCase()}`;
      this.toast.show(this.i18n.t('plan.planned', { name: r.name, day: when }), 'info', 5000, {
        label: this.i18n.t('plan.see'),
        run: () => void this.router.navigate(['/app/meals/plan']),
      });
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
