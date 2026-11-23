import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { MealDay } from '../../core/api/models';
import { DayScore, NutrientCheck, dayScore } from '../../core/meals/day-score';
import { MICROS, pctOf } from '../../core/meals/micros';
import { MealsApi } from '../../core/meals/meals-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';
import { SourcesComponent } from '../../shared/sources.component';
import type { SourceKey } from '../../core/meals/sources';

const ICON: Record<string, string> = { kcal: 'flame', macros: 'pie', quality: 'leaf', nutrients: 'sparkles' };

/** The day's balance out of 10, and what it is made of (a sheet, opened from the score). */
@Component({
  selector: 'app-day-score',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, TranslatePipe, IconComponent, SourcesComponent],
  template: `
    @if (score(); as s) {
      <button type="button" class="pill" [attr.data-band]="s.band" (click)="openSheet(sheet)" [attr.aria-label]="'meals.score.open' | t: { score: i18n.number(s.score, 1) }">
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
              <p class="small muted">{{ (s.ongoing ? 'meals.score.ongoing' : 'meals.score.title') | t }}</p>
            </div>
          </div>
          <!-- 1.12: what the mark is for, in one sentence; and why part of it waits for the end of the day -->
          <div class="why">
            <p class="small"><b>{{ 'meals.score.whyTitle' | t }}</b> {{ 'meals.score.why' | t }}</p>
            @if (s.ongoing && s.waiting.length) {
              <p class="small muted">{{ 'meals.score.ongoingWhy' | t }}</p>
            }
          </div>
          <ul class="parts">
            @for (p of s.parts; track p.key; let i = $index) {
              <li [style.--i]="i">
                <span class="p-ico" [attr.data-level]="level(p.points, p.max)"><app-icon [name]="icon[p.key]" [size]="16" /></span>
                <span class="p-body">
                  <span class="p-head"><b>{{ 'meals.score.parts.' + p.key + '.title' | t }}</b><span class="num">{{ i18n.number(p.points, 1) }} / {{ p.max }}</span></span>
                  @if (p.key === 'nutrients') {
                    <ng-container [ngTemplateOutlet]="checksList" [ngTemplateOutletContext]="{ $implicit: s.checks }" />
                  } @else {
                    <span class="small muted">{{ detail(p) }}</span>
                  }
                  <span class="meter"><i [style.width.%]="(p.points / p.max) * 100" [attr.data-level]="level(p.points, p.max)"></i></span>
                </span>
              </li>
            }
            @for (w of s.waiting; track w.key; let i = $index) {
              <li class="waiting" [style.--i]="s.parts.length + i">
                <span class="p-ico"><app-icon [name]="icon[w.key]" [size]="16" /></span>
                <span class="p-body">
                  <span class="p-head"><b>{{ 'meals.score.parts.' + w.key + '.title' | t }}</b>
                    <span class="later tiny"><app-icon name="clock" [size]="12" /> {{ 'meals.score.later' | t }}</span></span>
                  @if (w.key === 'nutrients') {
                    <ng-container [ngTemplateOutlet]="checksList" [ngTemplateOutletContext]="{ $implicit: s.checks }" />
                  } @else {
                    <span class="small muted">{{ soFar(w) }}</span>
                  }
                </span>
              </li>
            }
          </ul>
          <p class="tip small" [class.perfect]="s.tip === 'perfect'">
            <span class="tip-ico"><app-icon [name]="s.tip === 'perfect' ? 'check' : 'sparkles'" [size]="16" /></span>
            <span><b>{{ (s.tip === 'perfect' ? 'meals.score.tipDone' : 'meals.score.tipTitle') | t }}</b> {{ 'meals.score.tips.' + s.tip | t }}</span>
          </p>
          <!-- 1.14: the vitamins and minerals of the day, against their daily reference, and what ran low lately -->
          <h3 class="section-title micro-title">{{ 'meals.micros.title' | t }}</h3>
          @for (k of lowWeek(); track k) {
            <p class="alert small">
              <app-icon name="alert" [size]="16" />
              <span><b>{{ 'meals.micros.low' | t: { name: ('meals.micros.names.' + k | t) } }}</b> {{ 'meals.micros.sources.' + k | t }}</span>
            </p>
          }
          @if ((day().microsCoverage ?? 0) > 0 && microRows().length) {
            <ul class="micros" role="list">
              @for (m of microRows(); track m.key) {
                <li [class.low]="m.pct < 50">
                  <span class="mi-name">{{ 'meals.micros.names.' + m.key | t }}</span>
                  <span class="mi-bar" aria-hidden="true"><i [style.width.%]="Math.min(100, m.pct)"></i></span>
                  <span class="mi-pct num">{{ m.pct }} %</span>
                </li>
              }
            </ul>
            <p class="tiny muted">
              {{ 'meals.micros.note' | t }}
              @if ((day().microsCoverage ?? 0) < 0.9) {
                {{ 'meals.micros.partial' | t: { pct: Math.round((day().microsCoverage ?? 0) * 100) } }}
              }
            </p>
          } @else {
            <p class="small muted">{{ 'meals.micros.none' | t }}</p>
          }
          <p class="tiny muted">{{ 'meals.score.note' | t }}</p>
          <!-- 1.19: who says the limits of sugars, salt and saturated fat -->
          <app-sources [keys]="sourceKeys" />
        </div>
      </dialog>
      <ng-template #checksList let-checks>
        <ul class="checks">
          @for (x of checks; track x.key) {
            <li [attr.data-state]="x.waiting ? 'wait' : x.ok ? 'ok' : 'bad'">
              <span class="ck-ico"><app-icon [name]="x.waiting ? 'clock' : x.ok ? 'check' : 'alert'" [size]="12" [stroke]="2.6" /></span>
              <span class="ck-name">{{ 'meals.score.checks.' + x.key | t }}</span>
              <b class="num">{{ grams(x.value) }}</b>
              <span class="ck-limit tiny">{{ limitOf(x) }}</span>
            </li>
          }
        </ul>
      </ng-template>
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
    .why {
      display: grid;
      gap: 6px;
    }
    .why p {
      margin: 0;
    }
    /* a part judged once the day is over: in view, greyed, never counted */
    .waiting .p-ico {
      background: var(--surface-3);
      color: var(--fg-3);
    }
    /* a long title: its « at the end of the day » goes under it rather than squeezing it */
    .p-head {
      align-items: center;
      flex-wrap: wrap;
      row-gap: 4px;
    }
    .later {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--surface-3);
      color: var(--fg-2);
      font-weight: 650;
      white-space: nowrap;
    }
    /* 1.14: vitamins and minerals */
    .micro-title {
      margin-top: var(--space-2);
    }
    .micros {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .micros li {
      display: grid;
      grid-template-columns: minmax(0, 7.5rem) minmax(0, 1fr) 3.2rem;
      align-items: center;
      gap: var(--space-2);
      font-size: 13px;
    }
    .mi-name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .mi-bar {
      height: 6px;
      border-radius: 3px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .mi-bar i {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: var(--success, #1f9d55);
    }
    .micros li.low .mi-bar i {
      background: #e2711d;
    }
    .mi-pct {
      text-align: right;
      color: var(--fg-2);
    }
    .alert {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0;
      padding: var(--space-3);
      border-radius: 16px;
      background: color-mix(in srgb, #e2711d 10%, transparent);
    }
    .alert app-icon {
      flex: none;
      margin-top: 1px;
      color: #e2711d;
    }
    .checks {
      display: grid;
      gap: 5px;
      margin: 2px 0;
      padding: 0;
      list-style: none;
    }
    .checks li {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 8px;
      font-size: var(--fs-s);
    }
    .ck-ico {
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--success-soft);
      color: var(--success);
    }
    [data-state='bad'] .ck-ico {
      background: var(--warning-soft);
      color: var(--warning);
    }
    [data-state='wait'] .ck-ico {
      background: var(--surface-3);
      color: var(--fg-3);
    }
    .ck-name {
      color: var(--fg-2);
    }
    .ck-limit {
      min-width: 9ch;
      text-align: right;
      color: var(--fg-3);
    }
    .tip {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--accent-soft);
    }
    .tip.perfect {
      background: var(--success-soft);
    }
    .tip-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--surface);
      color: var(--accent-text);
    }
    .tip.perfect .tip-ico {
      color: var(--success);
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
  protected readonly sourceKeys: SourceKey[] = ['who', 'whoSalt'];
  readonly day = input.required<MealDay>();
  /** the member's split, in % of the calories (the macros are judged against it) */
  readonly shares = input<{ p: number; c: number; f: number } | undefined>(undefined);
  protected readonly i18n = inject(I18nService);
  protected readonly icon = ICON;
  protected readonly score = computed(() => dayScore(this.day(), localDay(), this.shares()));
  protected readonly Math = Math;
  private readonly api = inject(MealsApi);
  /** 1.14: what ran low over the last 7 days (asked when the sheet opens) */
  protected readonly lowWeek = signal<string[]>([]);
  /** the day's vitamins and minerals, in % of their reference */
  protected readonly microRows = computed(() => {
    // the server leaves out a vitamin unknown for most of the day: it is not shown, rather than shown as missing
    const known = this.day().micros ?? {};
    return MICROS.filter((m) => known[m.key] != null).map((m) => ({ key: m.key, pct: pctOf(m, known[m.key]) }));
  });

  protected openSheet(sheet: HTMLDialogElement): void {
    sheet.showModal();
    void this.api
      .micros(7)
      .then((m) => this.lowWeek.set(m.low))
      .catch(() => undefined);
  }

  protected level(points: number, max: number): 'good' | 'mid' | 'low' {
    const r = points / max;
    return r >= 0.75 ? 'good' : r >= 0.4 ? 'mid' : 'low';
  }

  protected grams(v: number): string {
    return `${this.i18n.number(v, v % 1 ? 1 : 0)} g`;
  }

  /** « 50 g max », « 25 g visés » */
  protected limitOf(x: NutrientCheck): string {
    return this.i18n.t(x.min ? 'meals.score.checks.min' : 'meals.score.checks.max', { v: this.i18n.number(x.limit) });
  }

  /** where the day stands so far, for a part judged once it is over */
  protected soFar(w: DayScore['waiting'][number]): string {
    const params: Record<string, string> = {};
    for (const [k, x] of Object.entries(w.values)) params[k] = typeof x === 'number' ? this.i18n.number(x) : x;
    return this.i18n.t('meals.score.parts.' + w.key + '.soFar', params);
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
