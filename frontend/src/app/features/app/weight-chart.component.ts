import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { BodyLogEntry } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';

const W = 320;
const H = 190;
const PAD = { l: 34, r: 10, t: 12, b: 24 };
const DAY = 86_400_000;

function t(day: string): number {
  return new Date(day + 'T12:00:00').getTime();
}

/**
 * Weigh-ins (dots), the smoothed trend (line), the goal (dashed level) and the forecast (dotted line
 * from the last trend point to the goal date). The lines draw themselves when the chart appears.
 */
@Component({
  selector: 'app-weight-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (geometry(); as g) {
      <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" role="img" [attr.aria-label]="label()">
        @for (y of g.grid; track y.v) {
          <line [attr.x1]="pad.l" [attr.x2]="w - pad.r" [attr.y1]="y.y" [attr.y2]="y.y" class="grid" />
          <text [attr.x]="pad.l - 6" [attr.y]="y.y + 3" class="axis" text-anchor="end">{{ y.label }}</text>
        }
        @if (g.goalY !== null) {
          <line [attr.x1]="pad.l" [attr.x2]="w - pad.r" [attr.y1]="g.goalY" [attr.y2]="g.goalY" class="goal" />
        }
        @if (g.forecast) {
          <path [attr.d]="g.forecast" class="forecast" pathLength="1" />
        }
        @if (g.trend) {
          <path [attr.d]="g.trend" class="trend" pathLength="1" />
        }
        @for (p of g.dots; track p.x) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" r="2.6" class="dot" [style.--i]="$index" />
        }
        @if (g.last) {
          <circle [attr.cx]="g.last.x" [attr.cy]="g.last.y" r="5" class="last" />
        }
        <text [attr.x]="pad.l" [attr.y]="h - 6" class="axis">{{ g.from }}</text>
        <text [attr.x]="w - pad.r" [attr.y]="h - 6" class="axis" text-anchor="end">{{ g.to }}</text>
      </svg>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      width: 100%;
      height: auto;
      overflow: visible;
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
    .goal {
      stroke: var(--cool);
      stroke-width: 1.5;
      stroke-dasharray: 4 4;
    }
    .trend,
    .forecast {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 1;
      animation: draw 1100ms var(--ease-out) both;
    }
    .trend {
      stroke: var(--accent);
      stroke-width: 3;
    }
    .forecast {
      stroke: var(--cool);
      stroke-width: 2.2;
      stroke-dasharray: 0.012 0.018;
      animation: fade 600ms 900ms both;
    }
    .dot {
      fill: var(--fg-3);
      opacity: 0.55;
      animation: fade 400ms both;
      animation-delay: calc(var(--i) * 12ms);
    }
    .last {
      fill: var(--accent);
      stroke: var(--surface);
      stroke-width: 2.5;
      animation: fade 400ms 800ms both;
    }
    @keyframes draw {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
  `,
})
export class WeightChartComponent {
  readonly logs = input.required<BodyLogEntry[]>();
  /** days shown back from today (0: everything) */
  readonly days = input(30);
  readonly goalKg = input<number | null>(null);
  /** where the forecast goes: the goal date (trend first, plan otherwise) */
  readonly goalDate = input<string | null>(null);
  readonly label = input('');

  private readonly i18n = inject(I18nService);
  protected readonly w = W;
  protected readonly h = H;
  protected readonly pad = PAD;

  protected readonly geometry = computed(() => {
    const all = this.logs().filter((l) => l.weightKg != null);
    if (!all.length) return null;
    const now = Date.now();
    const start = this.days() > 0 ? now - this.days() * DAY : t(all[0].day);
    const shown = all.filter((l) => t(l.day) >= start - DAY / 2);
    if (!shown.length) return null;
    const x0 = Math.min(start, t(shown[0].day));
    const lastDay = t(shown[shown.length - 1].day);
    // room on the right for the beginning of the forecast
    const x1 = Math.max(lastDay, now) + Math.max(3 * DAY, (Math.max(lastDay, now) - x0) * 0.18);

    const goal = this.goalKg();
    const values = shown.flatMap((l) => [l.weightKg!, l.trendKg ?? l.weightKg!]);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (goal != null && goal > lo - 4 && goal < hi + 4) {
      lo = Math.min(lo, goal);
      hi = Math.max(hi, goal);
    }
    const span = Math.max(hi - lo, 2);
    lo -= span * 0.12;
    hi += span * 0.12;

    const sx = (ms: number) => PAD.l + ((ms - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
    const sy = (kg: number) => PAD.t + ((hi - kg) / (hi - lo)) * (H - PAD.t - PAD.b);

    const dots = shown.map((l) => ({ x: +sx(t(l.day)).toFixed(1), y: +sy(l.weightKg!).toFixed(1) }));
    const trendPts = shown.map((l) => [sx(t(l.day)), sy(l.trendKg ?? l.weightKg!)] as const);
    const trend = trendPts.length > 1 ? 'M' + trendPts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') : null;
    const lastTrend = trendPts[trendPts.length - 1];

    let forecast: string | null = null;
    const date = this.goalDate();
    if (goal != null && date && trendPts.length) {
      const end = t(date);
      const [lx, ly] = lastTrend;
      const lastKg = shown[shown.length - 1].trendKg ?? shown[shown.length - 1].weightKg!;
      // straight to the goal, cut at the right edge of the chart
      const ratio = end > lastDay ? Math.min(1, (x1 - lastDay) / (end - lastDay)) : 1;
      const fx = lastDay + (end - lastDay) * ratio;
      const fkg = lastKg + (goal - lastKg) * ratio;
      forecast = `M${lx.toFixed(1)} ${ly.toFixed(1)} L${sx(fx).toFixed(1)} ${sy(fkg).toFixed(1)}`;
    }

    const step = span > 12 ? 5 : span > 5 ? 2 : 1;
    const grid = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      grid.push({ v, y: +sy(v).toFixed(1), label: this.i18n.number(v) });
    }
    const fmt = (ms: number) => this.i18n.date(new Date(ms).toISOString(), { day: 'numeric', month: 'short' });
    return {
      dots,
      trend,
      forecast,
      grid,
      last: dots[dots.length - 1],
      goalY: goal != null && goal >= lo && goal <= hi ? +sy(goal).toFixed(1) : null,
      from: fmt(x0),
      to: fmt(Math.max(lastDay, now)),
    };
  });
}
