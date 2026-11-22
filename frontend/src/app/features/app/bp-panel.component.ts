import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BpEntry, BpLevel, HealthStore, Moment, bpLevel } from '../../core/health/health.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { shiftDay } from '../../core/meals/meals.store';
import { localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';
import { BpSheetComponent } from './bp-sheet.component';

/** the chart's drawing box (viewBox units) */
const W = 340;
const H = 190;
const PAD = { left: 30, right: 30, top: 12, bottom: 24 };
/** home thresholds: 135 / 85 (the reference lines) */
const SYS_LIMIT = 135;
const DIA_LIMIT = 85;
const LEVEL_ICON: Record<BpLevel, string> = { ok: 'check', high: 'alert', urgent: 'alert', low: 'info' };

interface Point {
  e: BpEntry;
  x: number;
  ys: number;
  yd: number;
}

/**
 * 1.17: « Tension » on Progress (beside the weight): the averages of the last 7 days morning and evening and how they read
 * against the home thresholds, the curve of the systolic and the diastolic over 7, 30 or 90 days with the 135 / 85 lines
 * (a touch shows a measure), and every measure of the period, latest first.
 */
@Component({
  selector: 'app-bp-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, SegDirective, BpSheetComponent],
  template: `
    <section class="card avgs" [attr.aria-label]="'health.bp.week' | t">
      <h2 class="h3">{{ 'health.bp.week' | t }}</h2>
      @if (week(); as w) {
        <div class="avg-grid">
          @for (m of moments; track m) {
            @let a = w[m];
            <div class="avg-cell">
              <span class="small muted"><app-icon [name]="m === 'MORNING' ? 'sun' : 'moon'" [size]="14" /> {{ 'health.bp.short.' + m | t }}</span>
              @if (a) {
                <b class="num">{{ a.systolic }}/{{ a.diastolic }}</b>
                <span class="lv small" [attr.data-level]="a.level"><app-icon [name]="levelIcon[a.level]" [size]="13" /> {{ 'health.bp.levelsShort.' + a.level | t }}</span>
                <span class="tiny muted">{{ (a.n === 1 ? 'health.bp.measuresOne' : 'health.bp.measures') | t: { n: a.n } }}</span>
              } @else {
                <span class="small muted none">{{ 'health.bp.noneWeek' | t }}</span>
              }
            </div>
          }
        </div>
      }
      <button type="button" class="btn btn-primary btn-block" (click)="sheet.open(momentNow())"><app-icon name="heartPulse" /> {{ 'health.bp.measure' | t }}</button>
    </section>
    <app-bp-sheet #sheet />

    <section class="card chart-card">
      <div class="seg" role="group" [attr.aria-label]="'health.bp.range' | t">
        @for (r of ranges; track r) {
          <button type="button" [attr.aria-pressed]="days() === r" (click)="days.set(r); pick.set(null)">{{ 'health.bp.days' | t: { n: r } }}</button>
        }
      </div>
      @if (points().length) {
        <div class="chart" (pointerleave)="leave($event)">
          <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" role="img" [attr.aria-label]="chartLabel()" (pointerdown)="touch($event)" (pointermove)="touch($event)">
            @for (g of grid(); track g.v) {
              <line class="grid" [attr.x1]="pad.left" [attr.x2]="w - pad.right" [attr.y1]="g.y" [attr.y2]="g.y" />
              <text class="tick" [attr.x]="pad.left - 6" [attr.y]="g.y + 3.5" text-anchor="end">{{ g.v }}</text>
            }
            <line class="limit" [attr.x1]="pad.left" [attr.x2]="w - pad.right" [attr.y1]="y(sysLimit)" [attr.y2]="y(sysLimit)" />
            <line class="limit" [attr.x1]="pad.left" [attr.x2]="w - pad.right" [attr.y1]="y(diaLimit)" [attr.y2]="y(diaLimit)" />
            <text class="tick limit-t" [attr.x]="w - pad.right + 4" [attr.y]="y(sysLimit) + 3.5">135</text>
            <text class="tick limit-t" [attr.x]="w - pad.right + 4" [attr.y]="y(diaLimit) + 3.5">85</text>
            @for (t of xTicks(); track t.day) {
              <text class="tick" [attr.x]="t.x" [attr.y]="h - 6" text-anchor="middle">{{ t.label }}</text>
            }
            @if (pick(); as p) {
              <line class="cross" [attr.x1]="p.x" [attr.x2]="p.x" [attr.y1]="pad.top" [attr.y2]="h - pad.bottom" />
            }
            <polyline class="line sys" [attr.points]="sysLine()" />
            <polyline class="line dia" [attr.points]="diaLine()" />
            @if (dots()) {
              @for (p of points(); track p.e.day + p.e.moment) {
                <circle class="dot sys" [attr.cx]="p.x" [attr.cy]="p.ys" r="3.5" />
                <circle class="dot dia" [attr.cx]="p.x" [attr.cy]="p.yd" r="3.5" />
              }
            }
            @if (pick(); as p) {
              <circle class="dot sys big" [attr.cx]="p.x" [attr.cy]="p.ys" r="5" />
              <circle class="dot dia big" [attr.cx]="p.x" [attr.cy]="p.yd" r="5" />
            }
          </svg>
          @if (pick(); as p) {
            <div class="tip" role="status" [style.left.%]="(p.x / w) * 100" [class.flip]="p.x > w * 0.62">
              <span class="tiny muted">{{ dateOf(p.e.day) }} · {{ 'health.bp.short.' + p.e.moment | t }}</span>
              <b class="num">{{ p.e.systolic }}/{{ p.e.diastolic }}</b>
              @if (p.e.pulse) {
                <span class="tiny muted num">{{ 'health.bp.pulseValue' | t: { n: p.e.pulse } }}</span>
              }
            </div>
          }
        </div>
        <div class="legend tiny">
          <span><i class="k sys"></i>{{ 'health.bp.legendSys' | t }}</span>
          <span><i class="k dia"></i>{{ 'health.bp.legendDia' | t }}</span>
          <span><i class="k lim"></i>{{ 'health.bp.legendLimit' | t }}</span>
        </div>
      } @else {
        <p class="small muted empty-chart">{{ 'health.bp.empty' | t }}</p>
      }
    </section>

    @if (history().length) {
      <h2 class="section-title">{{ 'health.bp.history' | t }}</h2>
      <ul class="list hist" role="list">
        @for (e of history(); track e.day + e.moment) {
          <li>
            <button type="button" class="list-item" [class.is-waiting]="!!e.pending" (click)="sheet.open(e.moment, e.day)">
              <span class="list-icon"><app-icon [name]="e.moment === 'MORNING' ? 'sun' : 'moon'" /></span>
              <span class="list-body">
                <span class="list-title num">{{ e.systolic }}/{{ e.diastolic }} <small class="muted">mmHg</small></span>
                <span class="list-sub">{{ dateOf(e.day) }} · {{ 'health.bp.short.' + e.moment | t }}{{ e.pulse ? ' · ' + ('health.bp.pulseValue' | t: { n: e.pulse }) : '' }}</span>
              </span>
              <span class="lv tiny" [attr.data-level]="level(e)"><app-icon [name]="levelIcon[level(e)]" [size]="13" /> {{ 'health.bp.levelsShort.' + level(e) | t }}</span>
            </button>
          </li>
        }
      </ul>
    }
    <p class="tiny muted">{{ 'health.bp.thresholds' | t }}</p>
  `,
  styles: `
    :host {
      display: contents;
    }
    .avgs,
    .chart-card {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .avgs .h3 {
      margin: 0;
    }
    .avg-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }
    .avg-cell {
      display: grid;
      gap: 3px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .avg-cell b {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-size: 1.55rem;
      font-weight: 800;
      line-height: 1.1;
    }
    .avg-cell .none {
      margin-top: 6px;
    }
    .lv {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 700;
      --lv: #1f9d55;
      color: color-mix(in srgb, var(--lv) 60%, var(--fg));
    }
    .lv[data-level='high'] {
      --lv: #e2711d;
    }
    .lv[data-level='urgent'] {
      --lv: #e5484d;
    }
    .lv[data-level='low'] {
      --lv: #2b8cee;
    }
    /* the two series (validated together for colour blindness, light and dark) */
    .chart-card {
      --sys: #d97a1e;
      --dia: #2f6fdb;
    }
    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme='light'])) .chart-card {
        --sys: #c4732a;
        --dia: #5b92ee;
      }
    }
    :host-context(html[data-theme='dark']) .chart-card {
      --sys: #c4732a;
      --dia: #5b92ee;
    }
    .chart {
      position: relative;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      touch-action: pan-y;
      overflow: visible;
    }
    .grid {
      stroke: var(--line);
      stroke-width: 1;
    }
    .limit {
      stroke: var(--fg-3);
      stroke-width: 1;
      stroke-dasharray: 4 4;
    }
    .tick {
      fill: var(--fg-3);
      font-size: 10px;
      font-family: var(--font-ui);
    }
    .limit-t {
      fill: var(--fg-2);
      font-weight: 700;
    }
    .cross {
      stroke: var(--fg-3);
      stroke-width: 1;
    }
    .line {
      fill: none;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .line.sys {
      stroke: var(--sys);
    }
    .line.dia {
      stroke: var(--dia);
    }
    .dot {
      stroke: var(--surface);
      stroke-width: 2;
    }
    .dot.sys {
      fill: var(--sys);
    }
    .dot.dia {
      fill: var(--dia);
    }
    .tip {
      position: absolute;
      top: 0;
      display: grid;
      gap: 1px;
      padding: 6px 10px;
      border-radius: 12px;
      background: var(--surface);
      box-shadow: var(--shadow-2, var(--shadow-1)), inset 0 0 0 1px var(--line);
      transform: translateX(10px);
      pointer-events: none;
      white-space: nowrap;
    }
    .tip.flip {
      transform: translateX(calc(-100% - 10px));
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      color: var(--fg-2);
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .k {
      width: 14px;
      height: 3px;
      border-radius: 2px;
    }
    .k.sys {
      background: var(--sys);
    }
    .k.dia {
      background: var(--dia);
    }
    .k.lim {
      height: 0;
      border-top: 1.5px dashed var(--fg-3);
    }
    .empty-chart {
      margin: 0;
    }
    ul.hist {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .hist li + li .list-item {
      border-top: 1px solid var(--line);
    }
  `,
})
export class BpPanelComponent {
  private readonly store = inject(HealthStore);
  protected readonly i18n = inject(I18nService);
  protected readonly moments: Moment[] = ['MORNING', 'EVENING'];
  protected readonly ranges = [7, 30, 90];
  protected readonly days = signal(30);
  protected readonly pick = signal<Point | null>(null);
  protected readonly levelIcon = LEVEL_ICON;
  protected readonly w = W;
  protected readonly h = H;
  protected readonly pad = PAD;
  protected readonly sysLimit = SYS_LIMIT;
  protected readonly diaLimit = DIA_LIMIT;

  constructor() {
    void this.store.ensureBp();
  }

  private readonly from = computed(() => shiftDay(localDay(), -(this.days() - 1)));
  /** the measures of the period, oldest first */
  private readonly inRange = computed(() => (this.store.bp() ?? []).filter((e) => e.day >= this.from()));
  protected readonly history = computed(() => [...this.inRange()].reverse());

  /** the averages of the last 7 days, morning and evening */
  protected readonly week = computed(() => {
    const from = shiftDay(localDay(), -6);
    const list = (this.store.bp() ?? []).filter((e) => e.day >= from);
    const of = (m: Moment) => {
      const xs = list.filter((e) => e.moment === m);
      if (!xs.length) return null;
      const s = Math.round(xs.reduce((t, e) => t + e.systolic, 0) / xs.length);
      const d = Math.round(xs.reduce((t, e) => t + e.diastolic, 0) / xs.length);
      return { systolic: s, diastolic: d, n: xs.length, level: bpLevel(s, d) };
    };
    return { MORNING: of('MORNING'), EVENING: of('EVENING') };
  });

  private readonly domain = computed(() => {
    const list = this.inRange();
    const lo = Math.min(60, ...list.map((e) => e.diastolic - 10));
    const hi = Math.max(160, ...list.map((e) => e.systolic + 10));
    return { lo: Math.floor(lo / 20) * 20, hi: Math.ceil(hi / 20) * 20 };
  });

  protected y(v: number): number {
    const { lo, hi } = this.domain();
    return PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  }

  /** a day and a moment on the width (the evening half a day after the morning) */
  private x(day: string, moment: Moment): number {
    const n = this.days();
    const i = Math.round((new Date(day + 'T12:00:00').getTime() - new Date(this.from() + 'T12:00:00').getTime()) / 86_400_000);
    const t = (i + (moment === 'EVENING' ? 0.75 : 0.25)) / n;
    return PAD.left + t * (W - PAD.left - PAD.right);
  }

  protected readonly points = computed<Point[]>(() => {
    this.domain();
    return this.inRange().map((e) => ({ e, x: this.x(e.day, e.moment), ys: this.y(e.systolic), yd: this.y(e.diastolic) }));
  });
  protected readonly sysLine = computed(() => this.points().map((p) => `${p.x.toFixed(1)},${p.ys.toFixed(1)}`).join(' '));
  protected readonly diaLine = computed(() => this.points().map((p) => `${p.x.toFixed(1)},${p.yd.toFixed(1)}`).join(' '));
  /** markers while they can be told apart */
  protected readonly dots = computed(() => this.points().length <= 40);
  protected readonly grid = computed(() => {
    const { lo, hi } = this.domain();
    const out: { v: number; y: number }[] = [];
    for (let v = lo; v <= hi; v += 20) out.push({ v, y: this.y(v) });
    return out;
  });
  protected readonly xTicks = computed(() => {
    const n = this.days();
    const step = n <= 7 ? 1 : n <= 30 ? 7 : 30;
    const out: { day: string; x: number; label: string }[] = [];
    for (let i = n - 1; i >= 0; i -= step) {
      const day = shiftDay(localDay(), -i);
      out.push({ day, x: this.x(day, 'MORNING') + (this.x(day, 'EVENING') - this.x(day, 'MORNING')) / 2, label: this.i18n.date(day, n <= 7 ? { weekday: 'narrow' } : { day: 'numeric', month: 'short' }) });
    }
    return out;
  });
  protected readonly chartLabel = computed(() => {
    const w = this.week();
    const m = w.MORNING ?? w.EVENING;
    return this.i18n.t('health.bp.chartLabel', { n: this.inRange().length, avg: m ? `${m.systolic}/${m.diastolic}` : '—' });
  });

  /** the measure nearest the finger (or the pointer) */
  protected touch(ev: PointerEvent): void {
    const svg = ev.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    let best: Point | null = null;
    for (const p of this.points()) if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    this.pick.set(best);
  }

  /** a mouse leaving hides the measure; a finger lifted keeps it on screen (touch sends pointerleave on lifting) */
  protected leave(ev: PointerEvent): void {
    if (ev.pointerType === 'mouse') this.pick.set(null);
  }

  protected level(e: BpEntry): BpLevel {
    return bpLevel(e.systolic, e.diastolic);
  }

  protected dateOf(day: string): string {
    return this.i18n.date(day, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  protected momentNow(): Moment {
    return new Date().getHours() < 15 ? 'MORNING' : 'EVENING';
  }
}
