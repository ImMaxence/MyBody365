import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import type { MacroSplit } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import type { MacroPlan } from '../../core/meals/macro-plan';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

/**
 * « Tes repères du jour »: what protein, carbohydrates, fat and fibre are for, in grams for the target, and the
 * split to choose (saved at once), with what to know about it.
 */
@Component({
  selector: 'app-guides-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #guidesDialog [attr.aria-label]="'meals.guides.title' | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div>
          <h2 class="h3">{{ 'meals.guides.title' | t }}</h2>
          <p class="small muted">{{ 'meals.guides.text' | t: { kcal: i18n.number(planKcal()) } }}</p>
        </div>
        <ul class="guides" role="list">
          @for (g of guideRows(); track g.key) {
            <li>
              <span class="g-dot" [style.background]="g.color" aria-hidden="true"></span>
              <span class="g-body">
                <b>{{ g.label | t }} · <span class="num">{{ g.grams }} g</span>@if (g.pct) {<span class="g-pct num"> · {{ g.pct }} %</span>}</b>
                <span class="small muted">{{ 'meals.guides.' + g.key | t }}</span>
              </span>
            </li>
          }
        </ul>
        <h3 class="section-title">{{ 'meals.guides.split' | t }}</h3>
        <div class="splits" role="radiogroup" [attr.aria-label]="'meals.guides.split' | t">
          @for (sp of splits; track sp) {
            <button type="button" role="radio" class="split" [attr.aria-checked]="split() === sp" [disabled]="busy()" (click)="setSplit(sp)">
              <b>{{ 'meals.guides.splits.' + sp + '.label' | t }}</b>
              <span class="small muted">{{ 'meals.guides.splits.' + sp + '.hint' | t }}</span>
            </button>
          }
        </div>
        <p class="small honest"><app-icon name="bulb" [size]="16" /> <span>{{ 'meals.guides.honest' | t }}</span></p>
        @if (plan().refKg; as kg) {
          <p class="tiny muted">{{ 'meals.guides.basis' | t: { perKg: i18n.number(plan().perKg, 1), kg: i18n.number(kg, 1) } }}</p>
        }
        <p class="tiny muted">{{ 'meals.stats.tipsNote' | t }}</p>
      </div>
    </dialog>
  `,
  styles: `
    .guides {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .guides li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .g-dot {
      width: 12px;
      height: 12px;
      flex: none;
      margin-top: 4px;
      border-radius: 4px;
    }
    .g-body {
      display: grid;
      gap: 2px;
    }
    .g-pct {
      color: var(--fg-2);
      font-weight: 600;
    }
    .splits {
      display: grid;
      gap: var(--space-2);
    }
    .split {
      display: grid;
      gap: 2px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      box-shadow: inset 0 0 0 1px var(--line);
      text-align: left;
      transition: background-color var(--dur-2), box-shadow var(--dur-2);
    }
    .split[aria-checked='true'] {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent);
    }
    .honest {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--cool-soft);
      line-height: 1.45;
    }
    .honest app-icon {
      flex: none;
      color: var(--cool);
    }
  `,
})
export class GuidesSheetComponent {
  readonly plan = input.required<MacroPlan>();
  /** the calorie target the grams are for */
  readonly kcal = input(2000);
  private readonly tracking = inject(TrackingStore);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly guidesDialog = viewChild.required<ElementRef<HTMLDialogElement>>('guidesDialog');
  protected readonly busy = signal(false);
  protected readonly split = computed<MacroSplit>(() => this.tracking.summary()?.profile.macroSplit ?? 'BALANCED');
  protected readonly planKcal = this.kcal;
  protected readonly splits: MacroSplit[] = ['BALANCED', 'PROTEIN', 'LOW_CARB'];
  protected readonly guideRows = computed(() => {
    const p = this.plan();
    return [
      { key: 'protein', label: 'meals.protein', grams: p.proteinG, pct: p.shares.p, color: 'var(--macro-protein)' },
      { key: 'carbs', label: 'meals.carbs', grams: p.carbsG, pct: p.shares.c, color: 'var(--macro-carbs)' },
      { key: 'fat', label: 'meals.fat', grams: p.fatG, pct: p.shares.f, color: 'var(--macro-fat)' },
      { key: 'fiber', label: 'meals.fiber', grams: p.fiberG, pct: 0, color: 'var(--success)' },
    ];
  });

  open(): void {
    this.guidesDialog().nativeElement.showModal();
  }

  protected async setSplit(split: MacroSplit): Promise<void> {
    if (split === this.split()) return;
    this.busy.set(true);
    try {
      await this.tracking.setMacroSplit(split);
      this.toast.show(this.i18n.t('meals.guides.saved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
