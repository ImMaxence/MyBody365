import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import type { BodyLogEntry } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';
import { WeighSheetComponent } from './weigh-sheet.component';
import { WeightChartComponent } from './weight-chart.component';

type Range = 'm1' | 'm3' | 'all';
const RANGE_DAYS: Record<Range, number> = { m1: 30, m3: 90, all: 0 };

/** Progress: the weight curve with its trend and forecast, the key figures and the history. */
@Component({
  selector: 'app-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, WeightChartComponent, WeighSheetComponent],
  template: `
    <main class="page">
      <header class="page-head"><h1 class="title">{{ 'progress.title' | t }}</h1></header>

      @if (logs(); as all) {
        @if (hasWeights()) {
          <section class="card chart-card">
            <div class="seg" role="group" [attr.aria-label]="'progress.chartLabel' | t">
              @for (r of ranges; track r) {
                <button type="button" [attr.aria-pressed]="range() === r" (click)="range.set(r)">{{ 'progress.range.' + r | t }}</button>
              }
            </div>
            @for (r of [range()]; track r) {
              <app-weight-chart
                [logs]="all"
                [days]="rangeDays()"
                [goalKg]="summary()?.goal?.goalKg ?? null"
                [goalDate]="goalDate()"
                [label]="'progress.chartLabel' | t"
              />
            }
            <div class="legend tiny">
              <span><i class="k-dot"></i>{{ 'progress.legendWeight' | t }}</span>
              <span><i class="k-trend"></i>{{ 'progress.legendTrend' | t }}</span>
              <span><i class="k-goal"></i>{{ 'progress.legendGoal' | t }}</span>
              <span><i class="k-forecast"></i>{{ 'progress.legendForecast' | t }}</span>
            </div>
          </section>

          @if (summary(); as s) {
            <section class="stats">
              <div class="stat"><span class="label">{{ 'progress.start' | t }}</span><span class="v num">{{ i18n.number(s.profile.startWeightKg, 1) }}<small> kg</small></span></div>
              <div class="stat"><span class="label">{{ 'progress.current' | t }}</span><span class="v num">{{ i18n.number(s.current.weightKg ?? s.current.trendKg, 1) }}<small> kg</small></span></div>
              <div class="stat">
                <span class="label">{{ 'progress.change' | t }}</span>
                <span class="v num" [class.good]="isGood(s.current.changeKg ?? 0)">{{ signed(s.current.changeKg ?? 0) }}<small> kg</small></span>
              </div>
              <div class="stat"><span class="label">{{ 'progress.bmi' | t }}</span><span class="v num">{{ i18n.number(s.current.bmi, 1) }}</span></div>
              <div class="stat wide">
                <span class="label">{{ 'progress.trendPace' | t }}</span>
                @if (s.goal.trendKgPerWeek != null) {
                  <span class="v num">{{ 'progress.trendPaceValue' | t: { kg: signed(s.goal.trendKgPerWeek) } }}</span>
                } @else {
                  <span class="small muted">{{ 'progress.notEnough' | t }}</span>
                }
              </div>
            </section>
          }

          <h2 class="section-title">{{ 'progress.history' | t }}</h2>
          <div class="list">
            @for (l of history(); track l.day; let i = $index) {
              <button type="button" class="list-item" (click)="edit(l, i)" [style.--i]="i">
                <span class="list-icon"><app-icon [name]="l.weightKg != null ? 'weight' : 'ruler'" /></span>
                <span class="list-body">
                  <span class="list-title">{{ i18n.date(l.day, { weekday: 'short', day: 'numeric', month: 'long' }) }}</span>
                  <span class="list-sub">
                    @if (l.trendKg != null) {
                      {{ 'progress.trend' | t: { kg: i18n.number(l.trendKg, 1) } }}
                    }
                    @if (measureCount(l) > 0) {
                      · {{ 'progress.measures' | t }} ({{ measureCount(l) }})
                    }
                  </span>
                </span>
                @if (l.weightKg != null) {
                  <span class="w num">{{ i18n.number(l.weightKg, 1) }} kg</span>
                }
                <app-icon name="chevronRight" />
              </button>
            }
          </div>
        } @else {
          <div class="card empty">
            <span class="empty-icon"><app-icon name="chart" /></span>
            <h2 class="h3">{{ 'progress.emptyTitle' | t }}</h2>
            <p>{{ 'progress.emptyText' | t }}</p>
          </div>
        }
      } @else {
        <div class="skeleton" style="height: 260px; border-radius: 24px"></div>
      }
    </main>
    <app-weigh-sheet />
  `,
  styles: `
    .chart-card {
      display: grid;
      gap: var(--space-4);
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
    .legend i {
      display: inline-block;
      width: 14px;
      height: 3px;
      border-radius: 2px;
    }
    .k-dot {
      width: 6px !important;
      height: 6px !important;
      border-radius: 50% !important;
      background: var(--fg-3);
    }
    .k-trend {
      background: var(--accent);
    }
    .k-goal {
      background: repeating-linear-gradient(90deg, var(--cool) 0 4px, transparent 4px 7px);
    }
    .k-forecast {
      background: repeating-linear-gradient(90deg, var(--cool) 0 2px, transparent 2px 5px);
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .stat {
      display: grid;
      gap: 4px;
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--surface);
      border: 1px solid var(--line);
      animation: rise 420ms var(--ease-out) both;
    }
    .stat:nth-child(2) {
      animation-delay: 50ms;
    }
    .stat:nth-child(3) {
      animation-delay: 100ms;
    }
    .stat:nth-child(4) {
      animation-delay: 150ms;
    }
    .stat:nth-child(5) {
      animation-delay: 200ms;
    }
    .stat.wide {
      grid-column: 1 / -1;
    }
    .v {
      font-family: var(--font-display);
      font-stretch: 115%;
      font-weight: 800;
      font-size: 1.6rem;
      letter-spacing: -0.03em;
    }
    .v small {
      font-size: var(--fs-s);
      color: var(--fg-2);
      letter-spacing: 0;
    }
    .v.good {
      color: var(--success);
    }
    .w {
      font-weight: 700;
    }
    .list .list-item {
      animation: rise 380ms var(--ease-out) both;
      animation-delay: calc(min(var(--i), 12) * 30ms);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
    }
  `,
})
export class ProgressPage {
  private readonly tracking = inject(TrackingStore);
  protected readonly i18n = inject(I18nService);
  private readonly sheet = viewChild.required(WeighSheetComponent);

  protected readonly ranges: Range[] = ['m1', 'm3', 'all'];
  protected readonly range = signal<Range>('m1');
  protected readonly rangeDays = computed(() => RANGE_DAYS[this.range()]);
  protected readonly summary = this.tracking.summary;
  protected readonly logs = this.tracking.logs;
  protected readonly hasWeights = computed(() => (this.logs() ?? []).some((l) => l.weightKg != null));
  protected readonly history = computed(() => [...(this.logs() ?? [])].reverse());
  protected readonly goalDate = computed(() => this.summary()?.goal.trendDate ?? this.summary()?.goal.planDate ?? null);

  constructor() {
    void this.tracking.load();
    void this.tracking.loadLogs();
  }

  /** losing is good when the goal is lower, gaining when it is higher */
  protected isGood(change: number): boolean {
    const s = this.summary();
    if (!s || change === 0) return false;
    return s.goal.goalKg < s.profile.startWeightKg ? change < 0 : change > 0;
  }

  protected signed(n: number): string {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + this.i18n.number(Math.abs(n), 1);
  }

  protected measureCount(l: BodyLogEntry): number {
    return [l.bodyFatPct, l.waistCm, l.hipsCm, l.chestCm, l.armCm, l.thighCm].filter((v) => v != null).length;
  }

  protected edit(l: BodyLogEntry, i: number): void {
    const older = this.history().slice(i + 1).find((x) => x.weightKg != null);
    this.sheet().open(l.day, l, older?.weightKg ?? null);
  }
}
