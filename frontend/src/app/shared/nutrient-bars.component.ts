import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Nutrients } from '../core/api/models';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** the day's guides the bars are measured against (core/meals/macro-plan.ts) */
export interface BarsPlan {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

/**
 * 1.12: what one food (or one recipe) brings, with the bars of the Meals tab: its calories and macros as a share of the
 * day's guides. With the day's totals, each bar also shows the rest of the day in a paler tint, so that one sees how
 * much of the day this line makes. Sugars, salt and saturated fat underneath.
 */
@Component({
  selector: 'app-nutrient-bars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="bars">
      <div class="kcal">
        <span class="kcal-v"><b class="num">{{ i18n.number(Math.round(item().kcal)) }}</b> kcal</span>
        <span class="tiny muted">{{ 'meals.bars.ofDay' | t: { pct: pctOf(item().kcal, plan().kcal) } }}</span>
      </div>
      @for (r of rows(); track r.key) {
        <div class="row">
          <div class="head small">
            <span>{{ r.label | t }}</span>
            <span class="num val"><b>{{ grams(r.value) }}</b><span class="muted">· {{ pctOf(r.value, r.target) }} %</span></span>
          </div>
          <div class="bar" aria-hidden="true" [style.--c]="r.color">
            <i class="mine" [style.width.%]="r.mine"></i>
            @if (r.rest > 0) {
              <i class="rest" [style.width.%]="r.rest"></i>
            }
          </div>
        </div>
      }
      @if (dayTotals()) {
        <p class="legend tiny muted">
          <span><i class="key mine"></i>{{ (entry() ? 'meals.bars.thisLine' : 'meals.bars.adding') | t }}</span>
          <span><i class="key rest"></i>{{ 'meals.bars.restOfDay' | t }}</span>
        </p>
      }
      @if (extras(); as x) {
        <p class="extras tiny muted">{{ x }}</p>
      }
    </div>
  `,
  styles: `
    .bars {
      display: grid;
      gap: 10px;
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--surface-2);
    }
    .kcal {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .kcal-v {
      color: var(--fg-2);
      font-weight: 650;
    }
    .kcal-v b {
      font-size: 1.6rem;
      font-weight: 850;
      letter-spacing: -0.02em;
      color: var(--fg);
    }
    .row {
      display: grid;
      gap: 5px;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .val {
      display: inline-flex;
      gap: 5px;
    }
    .bar {
      display: flex;
      height: 8px;
      border-radius: 4px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      transition: width 420ms var(--ease-out);
    }
    .bar .mine {
      background: var(--c);
      animation: grow 600ms var(--ease-out) both;
    }
    .bar .rest {
      background: color-mix(in srgb, var(--c) 28%, transparent);
    }
    @keyframes grow {
      from {
        width: 0;
      }
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      margin: 0;
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .key {
      width: 14px;
      height: 6px;
      border-radius: 3px;
      background: var(--fg-2);
    }
    .key.rest {
      background: color-mix(in srgb, var(--fg-2) 28%, transparent);
    }
    .extras {
      margin: 0;
    }
    @media (prefers-reduced-motion: reduce) {
      .bar i {
        transition: none;
        animation: none;
      }
    }
  `,
})
export class NutrientBarsComponent {
  /** what this line brings, for the amount chosen */
  readonly item = input.required<Nutrients>();
  readonly plan = input.required<BarsPlan>();
  /** the day's totals without this line (optional): the paler part of the bars */
  readonly dayTotals = input<Nutrients | null>(null);
  /** a line already noted (« cet aliment ») or one being added (« ce que tu ajoutes ») */
  readonly entry = input(false);
  protected readonly i18n = inject(I18nService);
  protected readonly Math = Math;

  protected readonly rows = computed(() => {
    const n = this.item();
    const d = this.dayTotals();
    const t = this.plan();
    const list = [
      { key: 'p', label: 'meals.protein', value: n.proteinG ?? 0, rest: d?.proteinG ?? 0, target: t.proteinG, color: 'var(--macro-protein)' },
      { key: 'c', label: 'meals.carbs', value: n.carbsG ?? 0, rest: d?.carbsG ?? 0, target: t.carbsG, color: 'var(--macro-carbs)' },
      { key: 'f', label: 'meals.fat', value: n.fatG ?? 0, rest: d?.fatG ?? 0, target: t.fatG, color: 'var(--macro-fat)' },
      { key: 'fi', label: 'meals.fiber', value: n.fiberG ?? 0, rest: d?.fiberG ?? 0, target: t.fiberG, color: 'var(--success)' },
    ];
    return list.map((r) => {
      const max = Math.max(1, r.target);
      const mine = Math.min(100, (r.value / max) * 100);
      const rest = Math.max(0, Math.min(100 - mine, (Math.max(0, r.rest) / max) * 100));
      return { ...r, mine, rest };
    });
  });

  /** « dont sucres 11 g · sel 1,7 g · graisses saturées 6 g », what is known */
  protected readonly extras = computed(() => {
    const n = this.item();
    const parts: string[] = [];
    if (n.sugarsG != null) parts.push(this.i18n.t('meals.bars.sugars', { v: this.grams(n.sugarsG) }));
    if (n.saltG != null) parts.push(this.i18n.t('meals.bars.salt', { v: this.grams(n.saltG) }));
    if (n.satFatG != null) parts.push(this.i18n.t('meals.bars.satFat', { v: this.grams(n.satFatG) }));
    return parts.length ? this.i18n.t('meals.bars.including', { list: parts.join(' · ') }) : null;
  });

  protected grams(v: number): string {
    // a trace (a pinch of salt) is not « 0,0 g »
    if (v > 0 && v < 0.1) return `< ${this.i18n.number(0.1, 1)} g`;
    return `${this.i18n.number(v, v > 0 && v < 10 ? 1 : 0)} g`;
  }

  protected pctOf(v: number, target: number): string {
    return this.i18n.number(Math.round((v / Math.max(1, target)) * 100));
  }
}
