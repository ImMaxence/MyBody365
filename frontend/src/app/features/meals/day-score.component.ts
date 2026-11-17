import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { MealDay } from '../../core/api/models';
import { DayScore, dayScore } from '../../core/meals/day-score';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';

const ICON: Record<string, string> = { kcal: 'flame', macros: 'pie', quality: 'leaf', nutrients: 'sparkles' };

/** The day's balance out of 10, and what it is made of (a sheet, opened from the score). */
@Component({
  selector: 'app-day-score',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (score(); as s) {
      <button type="button" class="pill" [attr.data-band]="s.band" (click)="sheet.showModal()" [attr.aria-label]="'meals.score.open' | t: { score: i18n.number(s.score, 1) }">
        <span class="mark num">{{ i18n.number(s.score, 1) }}<small>/10</small></span>
        <span class="words">
          <b>{{ 'meals.score.bands.' + s.band | t }}</b>
          <span class="tiny">{{ (s.ongoing ? 'meals.score.ongoing' : 'meals.score.title') | t }}</span>
        </span>
        <app-icon name="info" [size]="16" />
      </button>

      <dialog class="sheet" #sheet [attr.aria-label]="'meals.score.title' | t">
        <div class="sheet-grip"></div>
        <div class="stack">
          <div class="head">
            <span class="big num" [attr.data-band]="s.band">{{ i18n.number(s.score, 1) }}<small>/10</small></span>
            <div>
              <h2 class="h3">{{ 'meals.score.bands.' + s.band | t }}</h2>
              <p class="small muted">{{ (s.ongoing ? 'meals.score.ongoingText' : 'meals.score.text') | t }}</p>
            </div>
          </div>
          <ul class="parts">
            @for (p of s.parts; track p.key; let i = $index) {
              <li [style.--i]="i">
                <span class="p-ico" [attr.data-level]="level(p.points, p.max)"><app-icon [name]="icon[p.key]" [size]="16" /></span>
                <span class="p-body">
                  <span class="p-head"><b>{{ 'meals.score.parts.' + p.key + '.title' | t }}</b><span class="num">{{ i18n.number(p.points, 1) }} / {{ p.max }}</span></span>
                  <span class="small muted">{{ detail(p) }}</span>
                  <span class="meter"><i [style.width.%]="(p.points / p.max) * 100" [attr.data-level]="level(p.points, p.max)"></i></span>
                </span>
              </li>
            }
          </ul>
          <p class="tiny muted">{{ 'meals.score.note' | t }}</p>
        </div>
      </dialog>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    [data-band='good'] {
      --band: var(--success);
      --band-soft: var(--success-soft);
    }
    [data-band='fair'] {
      --band: var(--cool);
      --band-soft: var(--cool-soft);
    }
    [data-band='weak'] {
      --band: var(--warning);
      --band-soft: var(--warning-soft);
    }
    [data-band='poor'] {
      --band: var(--danger);
      --band-soft: var(--danger-soft);
    }
    .pill {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 12px;
      border-radius: var(--radius-m);
      background: var(--band-soft);
      color: var(--fg);
      text-align: left;
      transition: transform var(--dur-1) var(--ease-out);
      animation: pop-in 420ms var(--ease-out) both;
    }
    .pill:active {
      transform: scale(0.98);
    }
    .pill app-icon {
      color: var(--fg-2);
    }
    .mark {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--band);
      line-height: 1;
    }
    .mark small,
    .big small {
      font-size: 0.55em;
      font-weight: 700;
      color: var(--fg-2);
    }
    .words {
      display: grid;
      flex: 1;
      min-width: 0;
      line-height: 1.2;
    }
    .words .tiny {
      color: var(--fg-2);
    }
    @keyframes pop-in {
      from {
        opacity: 0;
        transform: scale(0.94);
      }
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .big {
      display: grid;
      place-items: center;
      flex: none;
      width: 76px;
      height: 76px;
      border-radius: 50%;
      background: var(--band-soft);
      color: var(--band);
      font-size: 1.7rem;
      font-weight: 800;
    }
    .parts {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .parts li {
      display: flex;
      gap: var(--space-3);
      animation: rise 320ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 60ms);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
    .p-ico {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      flex: none;
      border-radius: 10px;
      background: var(--surface-3);
      color: var(--fg-2);
    }
    [data-level='good'] {
      --lv: var(--success);
      --lv-soft: var(--success-soft);
    }
    [data-level='mid'] {
      --lv: var(--warning);
      --lv-soft: var(--warning-soft);
    }
    [data-level='low'] {
      --lv: var(--danger);
      --lv-soft: var(--danger-soft);
    }
    .p-ico[data-level] {
      background: var(--lv-soft);
      color: var(--lv);
    }
    .p-body {
      display: grid;
      gap: 3px;
      flex: 1;
      min-width: 0;
    }
    .p-head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .meter {
      height: 6px;
      border-radius: 3px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .meter i {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: var(--lv);
      animation: grow 700ms var(--ease-out) both;
    }
    @keyframes grow {
      from {
        width: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pill,
      .parts li,
      .meter i {
        animation: none;
      }
    }
  `,
})
export class DayScoreComponent {
  readonly day = input.required<MealDay>();
  /** the member's split, in % of the calories (the macros are judged against it) */
  readonly shares = input<{ p: number; c: number; f: number } | undefined>(undefined);
  protected readonly i18n = inject(I18nService);
  protected readonly icon = ICON;
  protected readonly score = computed(() => dayScore(this.day(), localDay(), this.shares()));

  protected level(points: number, max: number): 'good' | 'mid' | 'low' {
    const r = points / max;
    return r >= 0.75 ? 'good' : r >= 0.4 ? 'mid' : 'low';
  }

  protected detail(p: DayScore['parts'][number]): string {
    const v = p.values;
    const n = (x: number | string) => (typeof x === 'number' ? this.i18n.number(x, x % 1 ? 1 : 0) : x);
    if (p.key === 'nutrients') {
      return Object.entries(v)
        .map(([k, x]) => this.i18n.t('meals.score.parts.nutrients.' + k, { v: n(x) }))
        .join(' · ');
    }
    const params: Record<string, string> = {};
    for (const [k, x] of Object.entries(v)) params[k] = String(n(x));
    return this.i18n.t('meals.score.parts.' + p.key + '.detail', params);
  }
}
