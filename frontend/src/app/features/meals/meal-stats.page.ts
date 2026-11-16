import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DayTotal, FoodStat, MealStats, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { SLOTS, shiftDay, weekOf } from '../../core/meals/meals.store';
import { localDay } from '../../core/tracking/tracking.store';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';

type Period = 7 | 30 | 90;
const PERIODS: Period[] = [7, 30, 90];
const SLOT_ICON: Record<Slot, string> = { BREAKFAST: 'sun', LUNCH: 'utensils', DINNER: 'moon', SNACK: 'leaf' };
const GRADES = ['A', 'B', 'C', 'D', 'E'];
const GRADE_COLOR: Record<string, string> = { A: '#038141', B: '#4a7a12', C: '#8a6900', D: '#a84309', E: '#c7290f' };

/** the bar chart's frame (viewBox units) */
const W = 320;
const H = 170;
const PAD = { l: 34, r: 6, t: 14, b: 22 };

interface Column {
  key: string;
  /** the day, or the Monday of the week */
  day: string;
  kcal: number | null;
  over: boolean;
  x: number;
  w: number;
  y: number;
  h: number;
  label: string | null;
  /** where the label sits: centred under its column, kept inside the frame at both ends */
  lx: number;
  anchor: 'start' | 'middle' | 'end';
  path: string;
}

interface Tip {
  icon: string;
  tone: 'good' | 'warn' | 'info';
  text: string;
}

/** a column with a 4px rounded top, square at the baseline */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

function niceStep(max: number): number {
  for (const s of [250, 500, 1000, 2000]) if (max / s <= 5) return s;
  return 5000;
}

/**
 * Meal stats over 7 days, 30 days or 3 months: the key figures, calories day by day (week by week over
 * 3 months) against the target, where the calories come from, what is eaten most, by meal, by
 * Nutri-Score, and tips drawn from all that. Every figure is also in the table under the chart.
 */
@Component({
  selector: 'app-meal-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.stats.title' | t }}</h1>
      </header>

      <div class="seg" role="group" [attr.aria-label]="'meals.stats.period' | t">
        @for (p of periods; track p) {
          <button type="button" [attr.aria-pressed]="period() === p" (click)="period.set(p)">{{ 'meals.stats.periods.d' + p | t }}</button>
        }
      </div>

      @if (data(); as s) {
        @if (s.daily.length) {
          <div class="body" [class.refreshing]="loading()">
            @for (k of [s.days]; track k) {
              <section class="kpis">
                <div class="kpi">
                  <span class="k-label"><span class="k-ico"><app-icon name="flame" [size]="15" /></span>{{ 'meals.stats.avg' | t }}</span>
                  <span class="k-value">{{ i18n.number(avg()) }}<small> kcal</small></span>
                  @if (s.targetKcal) {
                    <span class="k-delta" [class.up]="avg() > s.targetKcal * 1.1" [class.good]="avg() <= s.targetKcal * 1.1">
                      <app-icon [name]="avg() > s.targetKcal ? 'arrowUp' : 'arrowDown'" [size]="12" [stroke]="2.6" />
                      {{ 'meals.stats.avgVsTarget' | t: { delta: signed(avg() - s.targetKcal) } }}
                    </span>
                  }
                </div>
                <div class="kpi">
                  <span class="k-label"><span class="k-ico"><app-icon name="target" [size]="15" /></span>{{ 'meals.stats.balance' | t }}</span>
                  @if (balance(); as b) {
                    <span class="k-value">{{ signed(b.kcal) }}<small> kcal</small></span>
                    <span class="k-delta" [class.up]="b.kcal > 0" [class.good]="b.kcal <= 0">{{ 'meals.stats.balanceKg' | t: { kg: signed(b.kg, 1) } }}</span>
                  } @else {
                    <span class="small muted">{{ 'meals.stats.balanceNone' | t }}</span>
                  }
                </div>
                <div class="kpi">
                  <span class="k-label"><span class="k-ico ok"><app-icon name="check" [size]="15" /></span>{{ 'meals.stats.okDays' | t }}</span>
                  <span class="k-value">{{ okPct() }}<small> %</small></span>
                  <span class="k-sub">{{ 'meals.stats.outOf' | t: { n: okDays(), total: basis().length } }}</span>
                </div>
                <div class="kpi">
                  <span class="k-label"><span class="k-ico"><app-icon name="calendar" [size]="15" /></span>{{ 'meals.stats.logged' | t }}</span>
                  <span class="k-value">{{ s.daily.length }}</span>
                  <span class="k-sub">{{ 'meals.stats.ofDays' | t: { total: s.days } }}</span>
                </div>
              </section>
            }

            <section class="card chart-card">
              <h2 class="c-title"><app-icon name="bars" [size]="18" /> {{ (s.days === 90 ? 'meals.stats.weekly' : 'meals.stats.daily') | t }}</h2>
              <p class="tiny muted">
                @if (s.targetKcal) {
                  {{ (s.days === 90 ? 'meals.stats.weeklyHint' : 'meals.stats.dailyHint') | t: { kcal: i18n.number(s.targetKcal) } }}
                } @else {
                  {{ 'meals.stats.noTargetHint' | t }}
                }
              </p>
              @if (chart(); as c) {
                <div class="plot">
                  @if (active(); as a) {
                    <div class="tip" [style.left.%]="tipLeft(a)" role="status">
                      <strong class="num">{{ a.kcal === null ? ('meals.stats.nothing' | t) : i18n.number(a.kcal) + ' kcal' }}</strong>
                      <span>{{ tipDate(a) }}</span>
                      @if (a.kcal !== null && s.targetKcal) {
                        <span>{{ 'meals.stats.delta' | t: { delta: signed(a.kcal - s.targetKcal) } }}</span>
                      }
                    </div>
                  }
                  <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" role="img" [attr.aria-label]="chartLabel()" tabindex="0"
                    (pointermove)="hover($event)" (pointerdown)="hover($event)" (pointerleave)="leave($event)" (keydown)="key($event)" (blur)="activeIndex.set(null)">
                    @for (g of c.grid; track g.v) {
                      <line [attr.x1]="pad.l" [attr.x2]="w - pad.r" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" />
                      <text [attr.x]="pad.l - 6" [attr.y]="g.y + 3" class="axis" text-anchor="end">{{ g.label }}</text>
                    }
                    @for (col of c.cols; track col.key; let i = $index) {
                      @if (col.kcal !== null) {
                        <path [attr.d]="col.path" class="col" [class.over]="col.over" [class.plain]="!s.targetKcal" [class.dim]="activeIndex() !== null && activeIndex() !== i"
                          [style.--i]="i" />
                      } @else {
                        <rect [attr.x]="col.x + col.w / 2 - 1.5" [attr.y]="h - pad.b - 1.5" width="3" height="3" rx="1.5" class="none" />
                      }
                      @if (col.label) {
                        <text [attr.x]="col.lx" [attr.y]="h - 7" class="axis" [attr.text-anchor]="col.anchor">{{ col.label }}</text>
                      }
                    }
                    @if (c.targetY !== null) {
                      <line [attr.x1]="pad.l" [attr.x2]="w - pad.r" [attr.y1]="c.targetY" [attr.y2]="c.targetY" class="target" />
                    }
                    @if (active(); as a) {
                      <line [attr.x1]="a.x + a.w / 2" [attr.x2]="a.x + a.w / 2" [attr.y1]="pad.t" [attr.y2]="h - pad.b" class="cross" />
                    }
                  </svg>
                </div>
                @if (s.targetKcal) {
                  <div class="legend tiny">
                    <span><i class="sw over"></i>{{ 'meals.stats.overLabel' | t }}</span>
                    <span><i class="sw under"></i>{{ 'meals.stats.underLabel' | t }}</span>
                    <span><i class="sw line"></i>{{ 'meals.stats.target' | t }}</span>
                  </div>
                }
                <details class="table-view">
                  <summary class="small">{{ 'meals.stats.table' | t }}</summary>
                  <table class="small">
                    <thead>
                      <tr>
                        <th scope="col">{{ 'meals.stats.tableDay' | t }}</th>
                        <th scope="col" class="r">kcal</th>
                        @if (s.targetKcal) {
                          <th scope="col" class="r">{{ 'meals.stats.tableDelta' | t }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (col of c.cols; track col.key) {
                        @if (col.kcal !== null) {
                          <tr>
                            <td>{{ tipDate(col) }}</td>
                            <td class="r num">{{ i18n.number(col.kcal) }}</td>
                            @if (s.targetKcal) {
                              <td class="r num">{{ signed(col.kcal - s.targetKcal) }}</td>
                            }
                          </tr>
                        }
                      }
                    </tbody>
                  </table>
                </details>
              }
            </section>

            @if (macros(); as m) {
              <section class="card">
                <h2 class="c-title"><app-icon name="pie" [size]="18" /> {{ 'meals.stats.macros' | t }}</h2>
                <div class="segbar" role="img" [attr.aria-label]="macrosLabel()">
                  @for (p of m; track p.key; let i = $index) {
                    @if (p.pct > 0) {
                      <span class="block" [style.flex-grow]="p.pct" [style.background]="p.color" [style.color]="p.ink" [style.--i]="i">
                        @if (p.pct >= 14) {
                          <b class="num">{{ p.pct }} %</b>
                        }
                      </span>
                    }
                  }
                </div>
                <div class="legend tiny">
                  @for (p of m; track p.key) {
                    <span><i class="sw" [style.background]="p.color"></i>{{ p.label | t }} · <b class="num">{{ p.pct }} %</b> · {{ i18n.number(p.gPerDay) }} g/{{ 'meals.stats.perDayShort' | t }}</span>
                  }
                </div>
                <p class="tiny muted">{{ 'meals.stats.macrosHint' | t }}</p>
              </section>
            }

            <section class="card">
              <h2 class="c-title"><app-icon name="trophy" [size]="18" /> {{ 'meals.stats.top' | t }}</h2>
              <div class="seg small-seg" role="group" [attr.aria-label]="'meals.stats.top' | t">
                <button type="button" [attr.aria-pressed]="topBy() === 'count'" (click)="topBy.set('count')">{{ 'meals.stats.topCount' | t }}</button>
                <button type="button" [attr.aria-pressed]="topBy() === 'kcal'" (click)="topBy.set('kcal')">{{ 'meals.stats.topKcal' | t }}</button>
              </div>
              @for (k of [topBy() + s.days]; track k) {
                <ol class="ranked">
                  @for (f of top(); track f.name + f.detail; let i = $index) {
                    <li [style.--i]="i">
                      <span class="r-rank num">{{ i + 1 }}</span>
                      <span class="r-body">
                        <span class="r-head">
                          <span class="r-name">{{ f.name }}@if (f.detail) {<span class="muted"> · {{ f.detail }}</span>}</span>
                          <span class="r-value num">{{ topBy() === 'count' ? ('meals.stats.times' | t: { n: f.times }) : i18n.number(f.kcal) + ' kcal' }}</span>
                        </span>
                        <span class="meter"><i [style.width.%]="share(f)"></i></span>
                      </span>
                    </li>
                  }
                </ol>
              }
            </section>

            <section class="card">
              <h2 class="c-title"><app-icon name="utensils" [size]="18" /> {{ 'meals.stats.slots' | t }}</h2>
              <p class="tiny muted">{{ 'meals.stats.slotsHint' | t }}</p>
              <ul class="ranked slots">
                @for (r of slots(); track r.slot; let i = $index) {
                  <li [style.--i]="i">
                    <span class="r-ico"><app-icon [name]="slotIcon[r.slot]" [size]="16" /></span>
                    <span class="r-body">
                      <span class="r-head">
                        <span class="r-name">{{ 'meals.slots.' + r.slot | t }}</span>
                        <span class="r-value num">{{ i18n.number(r.avg) }} kcal <span class="muted">· {{ r.pct }} %</span></span>
                      </span>
                      <span class="meter"><i [style.width.%]="r.bar"></i></span>
                    </span>
                  </li>
                }
              </ul>
            </section>

            @if (grades(); as g) {
              <section class="card">
                <h2 class="c-title"><app-icon name="leaf" [size]="18" /> {{ 'meals.stats.grades' | t }}</h2>
                <div class="thinbar" role="img" [attr.aria-label]="gradesLabel()">
                  @for (p of g.parts; track p.grade; let i = $index) {
                    <span [style.flex-grow]="p.pct" [style.background]="p.color" [style.--i]="i"></span>
                  }
                </div>
                <div class="legend tiny">
                  @for (p of g.parts; track p.grade) {
                    <span><i class="sw" [style.background]="p.color"></i>{{ p.grade === '?' ? ('meals.stats.unknown' | t) : p.grade }} · <b class="num">{{ p.pct }} %</b></span>
                  }
                </div>
                @if (g.good !== null) {
                  <p class="small">{{ 'meals.stats.gradesGood' | t: { pct: g.good } }}</p>
                }
              </section>
            }

            @if (tips().length) {
              <section class="card tips">
                <h2 class="c-title"><app-icon name="bulb" [size]="18" /> {{ 'meals.stats.tips' | t }}</h2>
                <ul>
                  @for (tip of tips(); track tip.text; let i = $index) {
                    <li [class]="tip.tone" [style.--i]="i">
                      <span class="t-ico"><app-icon [name]="tip.icon" [size]="16" /></span>
                      <span>{{ tip.text }}</span>
                    </li>
                  }
                </ul>
                <p class="tiny muted">{{ 'meals.stats.tipsNote' | t }}</p>
              </section>
            }
          </div>
        } @else {
          <div class="card empty">
            <span class="empty-icon"><app-icon name="bars" /></span>
            <h2 class="h3">{{ 'meals.stats.emptyTitle' | t }}</h2>
            <p class="small">{{ 'meals.stats.emptyText' | t }}</p>
            <a routerLink="/app/meals" class="btn btn-primary"><app-icon name="plus" /> {{ 'meals.stats.emptyCta' | t }}</a>
          </div>
        }
      } @else {
        <div class="skeleton" style="height: 190px; border-radius: 24px"></div>
        <div class="skeleton" style="height: 260px; border-radius: 24px"></div>
      }
    </main>
  `,
  styles: `
    .body {
      display: grid;
      gap: var(--space-4);
      transition: opacity var(--dur-2);
    }
    /* a new period loads: the previous one stays, faded, with no jump */
    .body.refreshing {
      opacity: 0.55;
    }
    .card {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      animation: rise 420ms var(--ease-out) both;
    }
    .c-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.02rem;
      font-weight: 750;
    }
    .c-title app-icon {
      color: var(--accent-text);
    }
    .kpis {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .kpi {
      display: grid;
      align-content: start;
      gap: 4px;
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--surface);
      border: 1px solid var(--line);
      animation: rise 420ms var(--ease-out) both;
    }
    .kpi:nth-child(2) {
      animation-delay: 50ms;
    }
    .kpi:nth-child(3) {
      animation-delay: 100ms;
    }
    .kpi:nth-child(4) {
      animation-delay: 150ms;
    }
    .k-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: var(--fs-s);
      font-weight: 600;
      color: var(--fg-2);
    }
    .k-ico {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex: none;
      border-radius: 9px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .k-ico.ok {
      background: var(--cal-done);
      color: var(--cal-done-ink);
    }
    .k-value {
      font-size: 1.55rem;
      font-weight: 750;
      letter-spacing: -0.02em;
    }
    .k-value small {
      font-size: var(--fs-s);
      font-weight: 650;
      color: var(--fg-2);
      letter-spacing: 0;
    }
    .k-sub,
    .k-delta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--fs-xs);
      font-weight: 650;
      color: var(--fg-2);
    }
    /* text: the status colours, readable on the surface (the pastel inks are for icons) */
    .k-delta.up {
      color: var(--warning);
    }
    .k-delta.good {
      color: var(--success);
    }
    .plot {
      position: relative;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      touch-action: pan-y;
      border-radius: 8px;
    }
    svg:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 4px;
    }
    .grid {
      stroke: var(--line);
      stroke-width: 1;
    }
    .axis {
      fill: var(--fg-3);
      font-size: 9px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .col {
      fill: var(--chart-under);
      transform-box: fill-box;
      transform-origin: bottom;
      animation: grow 620ms var(--ease-out) both;
      animation-delay: calc(min(var(--i), 30) * 14ms);
      transition: opacity var(--dur-2);
    }
    .col.over {
      fill: var(--chart-over);
    }
    .col.plain {
      fill: var(--chart-1);
    }
    .col.dim {
      opacity: 0.35;
    }
    .none {
      fill: var(--fg-3);
      opacity: 0.35;
    }
    .target {
      stroke: var(--fg-2);
      stroke-width: 1.5;
      stroke-dasharray: 4 3;
    }
    .cross {
      stroke: var(--fg-3);
      stroke-width: 1;
    }
    @keyframes grow {
      from {
        transform: scaleY(0);
      }
    }
    .tip {
      position: absolute;
      bottom: calc(100% + 4px);
      z-index: 2;
      display: grid;
      gap: 1px;
      min-width: 120px;
      padding: 8px 10px;
      border-radius: 12px;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      box-shadow: var(--shadow-2);
      font-size: var(--fs-xs);
      color: var(--fg-2);
      transform: translateX(-50%);
      pointer-events: none;
      white-space: nowrap;
      animation: fade 160ms both;
    }
    .tip strong {
      font-size: var(--fs-s);
      color: var(--fg);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      color: var(--fg-2);
      font-weight: 600;
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .legend b {
      color: var(--fg);
    }
    .sw {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .sw.over {
      background: var(--chart-over);
    }
    .sw.under {
      background: var(--chart-under);
    }
    .sw.line {
      height: 0;
      width: 14px;
      border-radius: 0;
      border-top: 2px dashed var(--fg-2);
    }
    .table-view summary {
      cursor: pointer;
      font-weight: 650;
      color: var(--accent-text);
    }
    .table-view table {
      width: 100%;
      margin-top: var(--space-2);
      border-collapse: collapse;
    }
    .table-view th,
    .table-view td {
      padding: 6px 4px;
      border-bottom: 1px solid var(--line);
      text-align: left;
    }
    .table-view th {
      color: var(--fg-2);
      font-weight: 650;
    }
    .table-view .r {
      text-align: right;
    }
    .table-view td:first-child {
      text-transform: capitalize;
    }
    .segbar {
      display: flex;
      gap: 2px;
      height: 28px;
    }
    .segbar .block {
      display: flex;
      align-items: center;
      min-width: 0;
      padding: 0 8px;
      border-radius: 4px;
      overflow: visible;
      transform-origin: left;
      animation: stretch 700ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 80ms);
    }
    .segbar b {
      font-size: var(--fs-xs);
      font-weight: 750;
      white-space: nowrap;
    }
    @keyframes stretch {
      from {
        transform: scaleX(0);
        opacity: 0;
      }
    }
    .thinbar {
      display: flex;
      gap: 2px;
      height: 8px;
    }
    .thinbar span {
      min-width: 2px;
      border-radius: 4px;
      transform-origin: left;
      animation: stretch 700ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 70ms);
    }
    .ranked {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ranked li {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      animation: rise 380ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 40ms);
    }
    .r-rank {
      width: 1.4em;
      flex: none;
      text-align: center;
      font-weight: 750;
      color: var(--fg-3);
    }
    .r-ico {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      flex: none;
      border-radius: 10px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .r-body {
      display: grid;
      gap: 5px;
      flex: 1;
      min-width: 0;
    }
    .r-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      font-size: var(--fs-s);
    }
    .r-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 650;
    }
    .r-value {
      flex: none;
      font-weight: 700;
    }
    .meter {
      height: 8px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--chart-1) 14%, transparent);
      overflow: hidden;
    }
    .meter i {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--chart-1);
      animation: grow-x 800ms var(--ease-out) both;
    }
    @keyframes grow-x {
      from {
        width: 0;
      }
    }
    .tips ul {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tips li {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-m);
      background: var(--surface-2);
      font-size: var(--fs-s);
      line-height: 1.45;
      animation: rise 420ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 60ms);
    }
    .t-ico {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      flex: none;
      border-radius: 10px;
      background: var(--cal-under);
      color: var(--cal-under-ink);
    }
    .tips .good .t-ico {
      background: var(--cal-done);
      color: var(--cal-done-ink);
    }
    .tips .warn .t-ico {
      background: var(--cal-over);
      color: var(--cal-over-ink);
    }
    .empty .btn {
      justify-self: center;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .card,
      .kpi,
      .col,
      .segbar .block,
      .thinbar span,
      .ranked li,
      .meter i,
      .tips li {
        animation: none;
      }
    }
  `,
})
export class MealStatsPage {
  private readonly api = inject(MealsApi);
  protected readonly i18n = inject(I18nService);
  protected readonly periods = PERIODS;
  protected readonly slotIcon = SLOT_ICON;
  protected readonly w = W;
  protected readonly h = H;
  protected readonly pad = PAD;

  protected readonly period = signal<Period>(30);
  protected readonly data = signal<MealStats | null>(null);
  protected readonly loading = signal(false);
  protected readonly topBy = signal<'count' | 'kcal'>('count');
  protected readonly activeIndex = signal<number | null>(null);
  private readonly today = localDay();

  /** finished days (today only counts while it is the only one): averages and tips are not skewed by a day in progress */
  protected readonly basis = computed<DayTotal[]>(() => {
    const daily = this.data()?.daily ?? [];
    const closed = daily.filter((d) => d.day < this.today);
    return closed.length ? closed : daily;
  });
  protected readonly avg = computed(() => {
    const b = this.basis();
    return b.length ? Math.round(b.reduce((s, d) => s + d.kcal, 0) / b.length) : 0;
  });
  protected readonly balance = computed(() => {
    const target = this.data()?.targetKcal;
    if (!target) return null;
    const kcal = Math.round(this.basis().reduce((s, d) => s + d.kcal - target, 0));
    return { kcal, kg: Math.round((kcal / 7700) * 10) / 10 };
  });
  protected readonly okDays = computed(() => {
    const target = this.data()?.targetKcal;
    if (!target) return 0;
    return this.basis().filter((d) => d.kcal >= target * 0.9 && d.kcal <= target * 1.1).length;
  });
  protected readonly okPct = computed(() => (this.basis().length ? Math.round((this.okDays() / this.basis().length) * 100) : 0));

  /** columns: one per day, or one per week (average of the days logged) over 3 months */
  protected readonly chart = computed(() => {
    const s = this.data();
    if (!s) return null;
    const byDay = new Map(s.daily.map((d) => [d.day, d.kcal]));
    const weekly = s.days === 90;
    const buckets: { key: string; day: string; kcal: number | null }[] = [];
    if (weekly) {
      const weeks = new Map<string, number[]>();
      for (let d = s.from; d <= s.to; d = shiftDay(d, 1)) {
        const monday = weekOf(d)[0];
        if (!weeks.has(monday)) weeks.set(monday, []);
        const k = byDay.get(d);
        if (k != null) weeks.get(monday)!.push(k);
      }
      for (const [monday, list] of weeks) {
        buckets.push({ key: monday, day: monday, kcal: list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null });
      }
    } else {
      for (let d = s.from; d <= s.to; d = shiftDay(d, 1)) buckets.push({ key: d, day: d, kcal: byDay.get(d) ?? null });
    }
    const target = s.targetKcal ?? null;
    const max = Math.max(target ?? 0, ...buckets.map((b) => b.kcal ?? 0), 500) * 1.1;
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const plotW = W - PAD.l - PAD.r;
    const plotH = H - PAD.t - PAD.b;
    const slot = plotW / buckets.length;
    const bw = Math.max(2, Math.min(24, slot - 2, slot * 0.68));
    const sy = (v: number) => PAD.t + plotH - (v / top) * plotH;
    const labelEvery = buckets.length <= 7 ? 1 : weekly ? 3 : 7;
    const cols: Column[] = buckets.map((b, i) => {
      const x = PAD.l + i * slot + (slot - bw) / 2;
      const y = b.kcal != null ? sy(b.kcal) : sy(0);
      const h = b.kcal != null ? Math.max(1, sy(0) - y) : 0;
      const fromEnd = buckets.length - 1 - i;
      const label =
        buckets.length <= 7
          ? this.i18n.date(b.day, { weekday: 'narrow' })
          : fromEnd % labelEvery === 0
            ? this.i18n.date(b.day, { day: 'numeric', month: 'short' })
            : null;
      return {
        key: b.key,
        day: b.day,
        kcal: b.kcal,
        over: target != null && b.kcal != null && b.kcal > target * 1.1,
        x: +x.toFixed(1),
        w: +bw.toFixed(1),
        y: +y.toFixed(1),
        h: +h.toFixed(1),
        label,
        lx: +(i === buckets.length - 1 && buckets.length > 7 ? x + bw : i === 0 && buckets.length > 7 ? x : x + bw / 2).toFixed(1),
        anchor: buckets.length <= 7 ? 'middle' : i === buckets.length - 1 ? 'end' : i === 0 ? 'start' : 'middle',
        path: b.kcal != null ? columnPath(+x.toFixed(1), +y.toFixed(1), +bw.toFixed(1), +h.toFixed(1)) : '',
      };
    });
    const grid = [];
    for (let v = 0; v <= top; v += step) grid.push({ v, y: +sy(v).toFixed(1), label: this.i18n.number(v) });
    return { cols, grid, targetY: target ? +sy(target).toFixed(1) : null, slot };
  });
  protected readonly active = computed(() => {
    const i = this.activeIndex();
    const c = this.chart();
    return i === null || !c ? null : (c.cols[i] ?? null);
  });

  /** the share of the calories from protein (4 kcal/g), carbs (4) and fat (9) */
  protected readonly macros = computed(() => {
    const s = this.data();
    if (!s) return null;
    const n = s.daily.length || 1;
    const rows = [
      { key: 'p', label: 'meals.protein', g: s.totals.proteinG ?? 0, k: 4, color: 'var(--macro-protein)', ink: 'var(--macro-protein-ink)' },
      { key: 'c', label: 'meals.carbs', g: s.totals.carbsG ?? 0, k: 4, color: 'var(--macro-carbs)', ink: 'var(--macro-carbs-ink)' },
      { key: 'f', label: 'meals.fat', g: s.totals.fatG ?? 0, k: 9, color: 'var(--macro-fat)', ink: 'var(--macro-fat-ink)' },
    ];
    const total = rows.reduce((sum, r) => sum + r.g * r.k, 0);
    if (total <= 0) return null;
    const pcts = rows.map((r) => Math.round(((r.g * r.k) / total) * 100));
    // the rounded shares add up to 100
    pcts[1] += 100 - pcts.reduce((a, b) => a + b, 0);
    return rows.map((r, i) => ({ ...r, pct: pcts[i], gPerDay: Math.round(r.g / n) }));
  });

  protected readonly top = computed<FoodStat[]>(() => {
    const s = this.data();
    if (!s) return [];
    return this.topBy() === 'count' ? s.topByCount : s.topByKcal;
  });

  protected readonly slots = computed(() => {
    const s = this.data();
    if (!s) return [];
    const n = s.daily.length || 1;
    const total = s.slots.reduce((sum, r) => sum + r.kcal, 0) || 1;
    const rows = SLOTS.map((slot) => {
      const kcal = s.slots.find((r) => r.slot === slot)?.kcal ?? 0;
      return { slot, avg: Math.round(kcal / n), pct: Math.round((kcal / total) * 100) };
    });
    const max = Math.max(1, ...rows.map((r) => r.avg));
    return rows.map((r) => ({ ...r, bar: (r.avg / max) * 100 }));
  });

  protected readonly grades = computed(() => {
    const s = this.data();
    if (!s) return null;
    const total = s.grades.reduce((sum, g) => sum + g.kcal, 0);
    if (total <= 0) return null;
    const parts = [...GRADES, '?']
      .map((grade) => {
        const kcal = s.grades.filter((g) => (g.grade ?? '?') === grade).reduce((sum, g) => sum + g.kcal, 0);
        return { grade, pct: Math.round((kcal / total) * 100), color: GRADE_COLOR[grade] ?? 'var(--fg-3)' };
      })
      .filter((p) => p.pct > 0);
    const rated = s.grades.filter((g) => g.grade).reduce((sum, g) => sum + g.kcal, 0);
    const ab = s.grades.filter((g) => g.grade === 'A' || g.grade === 'B').reduce((sum, g) => sum + g.kcal, 0);
    return { parts, good: rated > 0 ? Math.round((ab / rated) * 100) : null, de: rated > 0 ? 1 - (ab + this.kcalOf(s, 'C')) / rated : 0 };
  });

  /** a few tips, the most useful first, from the figures above */
  protected readonly tips = computed<Tip[]>(() => {
    const s = this.data();
    const b = this.basis();
    if (!s || !b.length) return [];
    const t = (key: string, params?: Record<string, string | number>) => this.i18n.t('meals.stats.tip.' + key, params);
    const out: Tip[] = [];
    const n = s.daily.length;
    const target = s.targetKcal;
    if (target && b.length >= 2) {
      const diff = this.avg() - target;
      if (diff > target * 0.1) {
        const heaviest = [...this.slots()].sort((x, y) => y.avg - x.avg)[0];
        out.push({
          icon: 'arrowUp',
          tone: 'warn',
          text: t('over', { kcal: this.i18n.number(diff), slot: this.i18n.t('meals.stats.tipSlot.' + heaviest.slot) }),
        });
      } else if (diff < -target * 0.2) {
        out.push({ icon: 'arrowDown', tone: 'warn', text: t('under', { kcal: this.i18n.number(-diff) }) });
      } else {
        out.push({ icon: 'check', tone: 'good', text: t('onTrack') });
      }
    }
    const m = this.macros();
    const protein = m?.find((r) => r.key === 'p');
    if (protein && protein.pct < 20) out.push({ icon: 'dumbbell', tone: 'info', text: t('protein', { pct: protein.pct }) });
    const g = this.grades();
    if (g && g.de > 0.35) out.push({ icon: 'leaf', tone: 'warn', text: t('grades', { pct: Math.round(g.de * 100) }) });
    const perDay = (v?: number) => (v == null ? null : v / n);
    const fiber = perDay(s.totals.fiberG);
    if (fiber != null && fiber > 0 && fiber < 22) out.push({ icon: 'leaf', tone: 'info', text: t('fiber', { g: this.i18n.number(fiber) }) });
    const sugars = perDay(s.totals.sugarsG);
    if (sugars != null && sugars > 60) out.push({ icon: 'info', tone: 'warn', text: t('sugars', { g: this.i18n.number(sugars) }) });
    const salt = perDay(s.totals.saltG);
    if (salt != null && salt > 6) out.push({ icon: 'info', tone: 'warn', text: t('salt', { g: this.i18n.number(salt, 1) }) });
    const weekend = b.filter((d) => [0, 6].includes(new Date(d.day + 'T12:00:00').getDay()));
    const weekdays = b.filter((d) => ![0, 6].includes(new Date(d.day + 'T12:00:00').getDay()));
    if (weekend.length && weekdays.length >= 2) {
      const mean = (l: DayTotal[]) => l.reduce((sum, d) => sum + d.kcal, 0) / l.length;
      const gap = Math.round(mean(weekend) - mean(weekdays));
      if (gap > 250) out.push({ icon: 'calendar', tone: 'info', text: t('weekend', { kcal: this.i18n.number(gap) }) });
    }
    const snack = this.slots().find((r) => r.slot === 'SNACK');
    if (snack && snack.pct > 25) out.push({ icon: 'clock', tone: 'info', text: t('snacks', { pct: snack.pct }) });
    if (n / s.days < 0.5) out.push({ icon: 'pencil', tone: 'info', text: t('regular', { logged: n, days: s.days }) });
    return out.slice(0, 5);
  });

  protected readonly chartLabel = computed(() => {
    const s = this.data();
    if (!s) return '';
    return this.i18n.t(s.days === 90 ? 'meals.stats.weekly' : 'meals.stats.daily');
  });
  protected readonly macrosLabel = computed(() =>
    (this.macros() ?? []).map((p) => this.i18n.t('meals.stats.macroShare', { name: this.i18n.t(p.label), pct: p.pct, g: p.gPerDay })).join(', '),
  );
  protected readonly gradesLabel = computed(() =>
    (this.grades()?.parts ?? []).map((p) => `${p.grade === '?' ? this.i18n.t('meals.stats.unknown') : p.grade} ${p.pct} %`).join(', '),
  );

  constructor() {
    effect(() => {
      const p = this.period();
      this.loading.set(true);
      this.activeIndex.set(null);
      this.api
        .stats(p)
        .then((s) => this.data.set(s))
        .catch(() => {
          // nothing to show: the empty state (with the way back to the meals)
          if (!this.data()) {
            this.data.set({ days: p, from: this.today, to: this.today, daily: [], totals: { kcal: 0 }, topByCount: [], topByKcal: [], slots: [], grades: [] });
          }
        })
        .finally(() => this.loading.set(false));
    });
  }

  private kcalOf(s: MealStats, grade: string): number {
    return s.grades.filter((g) => g.grade === grade).reduce((sum, g) => sum + g.kcal, 0);
  }

  protected share(f: FoodStat): number {
    const list = this.top();
    const key = this.topBy() === 'count' ? 'times' : 'kcal';
    const max = Math.max(1, ...list.map((x) => x[key]));
    return (f[key] / max) * 100;
  }

  protected signed(n: number, decimals = 0): string {
    const r = decimals ? Math.round(n * 10 ** decimals) / 10 ** decimals : Math.round(n);
    return (r > 0 ? '+' : r < 0 ? '−' : '') + this.i18n.number(Math.abs(r), decimals);
  }

  /** the tooltip stays inside the card near the edges */
  protected tipLeft(c: Column): number {
    return Math.min(78, Math.max(22, ((c.x + c.w / 2) / W) * 100));
  }

  protected tipDate(c: Column): string {
    if (this.data()?.days === 90) return this.i18n.t('meals.stats.weekOf', { date: this.i18n.date(c.day, { day: 'numeric', month: 'short' }) });
    return this.i18n.date(c.day, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /** the column under the finger or the pointer (the whole slot counts, not just the painted bar) */
  protected hover(e: PointerEvent): void {
    const c = this.chart();
    const svg = e.currentTarget as SVGSVGElement;
    if (!c) return;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((x - PAD.l) / c.slot);
    this.activeIndex.set(i >= 0 && i < c.cols.length ? i : null);
  }

  protected leave(e: PointerEvent): void {
    if (e.pointerType === 'mouse') this.activeIndex.set(null);
  }

  /** arrows move along the columns, the same details as on hover */
  protected key(e: KeyboardEvent): void {
    const c = this.chart();
    if (!c || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    const last = c.cols.length - 1;
    const cur = this.activeIndex();
    const next =
      e.key === 'Escape' ? null : e.key === 'Home' ? 0 : e.key === 'End' ? last : e.key === 'ArrowLeft' ? Math.max(0, (cur ?? last + 1) - 1) : Math.min(last, (cur ?? -1) + 1);
    this.activeIndex.set(next);
  }
}
