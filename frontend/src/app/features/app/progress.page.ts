import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { SessionStore } from '../../core/auth/session.store';
import { BpPanelComponent } from './bp-panel.component';
import type { BodyLogEntry } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';
import { WeighSheetComponent } from './weigh-sheet.component';
import { WeightChartComponent } from './weight-chart.component';
import { SegDirective } from '../../shared/seg.directive';
import { MonthlyForecastComponent } from './monthly-forecast.component';
import { MilestonesCardComponent } from './milestones-card.component';
import { PlateauCardComponent } from './plateau-card.component';
import { BmiSheetComponent } from './bmi-sheet.component';
import { ShareSheetComponent } from '../../shared/share-sheet.component';
import { bmiBand, waistClass } from '../../core/tracking/bmi';
import { RouterLink } from '@angular/router';
import { DeficitCardComponent } from './deficit-card.component';
import { NeedsCardComponent } from './needs-card.component';

type Range = 'm1' | 'm3' | 'all';
const RANGE_DAYS: Record<Range, number> = { m1: 30, m3: 90, all: 0 };

/** Progress: the weight curve with its trend and forecast, the key figures and the history. */
@Component({
  selector: 'app-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PlateauCardComponent, BpPanelComponent, DeficitCardComponent, NeedsCardComponent, ShareSheetComponent, MilestonesCardComponent, BmiSheetComponent, MonthlyForecastComponent, SegDirective, TranslatePipe, IconComponent, WeightChartComponent, WeighSheetComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <h1 class="title">{{ 'progress.title' | t }}</h1>
        <span class="spacer"></span>
        <!-- 1.9: the way to the goal, shown to the friends or sent as a picture -->
        @if (summary()) {
          <button type="button" class="btn btn-secondary btn-s share-btn" (click)="shareSheet.open('PROGRESS')"><app-icon name="share" [size]="18" /> {{ 'friends.posts.share.progressCta' | t }}</button>
        }
      </header>
      <app-share-sheet #shareSheet />

      <!-- 1.17: the blood pressure beside the weight, for whoever turned it on in the profile -->
      @if (bpOn()) {
        <div class="seg view-seg" role="group" [attr.aria-label]="'health.bp.view' | t">
          <button type="button" [attr.aria-pressed]="view() === 'weight'" (click)="chosen.set('weight')"><app-icon name="weight" [size]="17" /> {{ 'health.bp.viewWeight' | t }}</button>
          <button type="button" [attr.aria-pressed]="view() === 'bp'" (click)="chosen.set('bp')"><app-icon name="heartPulse" [size]="17" /> {{ 'health.bp.viewBp' | t }}</button>
        </div>
      }
      @if (view() === 'bp') {
        <app-bp-panel />
      } @else if (logs(); as all) {
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
              <!-- 1.14: the starting point is changed in « Mon objectif » -->
              <a class="stat bmi" routerLink="/app/account/goal" [attr.aria-label]="'progress.startEdit' | t: { kg: i18n.number(s.profile.startWeightKg, 1) }">
                <span class="label"><span class="s-ico"><app-icon name="flag" [size]="15" /></span>{{ 'progress.start' | t }}<app-icon name="pencil" [size]="14" /></span>
                <span class="v num">{{ i18n.number(s.profile.startWeightKg, 1) }}<small> kg</small></span>
              </a>
              <div class="stat"><span class="label"><span class="s-ico accent"><app-icon name="weight" [size]="15" /></span>{{ 'progress.current' | t }}</span><span class="v num">{{ i18n.number(s.current.weightKg ?? s.current.trendKg, 1) }}<small> kg</small></span></div>
              <div class="stat">
                <span class="label"><span class="s-ico" [class.good]="isGood(s.current.changeKg ?? 0)"><app-icon [name]="(s.current.changeKg ?? 0) > 0 ? 'trendUp' : 'trendDown'" [size]="15" /></span>{{ 'progress.change' | t }}</span>
                <span class="v num" [class.good]="isGood(s.current.changeKg ?? 0)">{{ signed(s.current.changeKg ?? 0) }}<small> kg</small></span>
              </div>
              <button type="button" class="stat bmi" [attr.aria-label]="'bmi.open' | t: { bmi: i18n.number(s.current.bmi, 1), band: ('bmi.classes.' + bmiCls() | t) }" (click)="bmiSheet.open()">
                <span class="label"><span class="s-ico"><app-icon name="gauge" [size]="15" /></span>{{ 'progress.bmi' | t }}<app-icon name="info" [size]="16" /></span>
                <span class="v num">{{ i18n.number(s.current.bmi, 1) }}</span>
                <span class="band small"><i [attr.data-c]="bmiCls()"></i>{{ 'bmi.classes.' + bmiCls() | t }}</span>
              </button>
              <button type="button" class="stat wide bmi" [attr.aria-label]="'progress.waistOpen' | t" (click)="bmiSheet.open()">
                <span class="label"><span class="s-ico"><app-icon name="ruler" [size]="15" /></span>{{ 'progress.waist' | t }}<app-icon name="info" [size]="16" /></span>
                @if (waist(); as w) {
                  <span class="v num">{{ i18n.number(w.cm, 1) }}<small> cm · {{ 'progress.waistRatio' | t: { ratio: i18n.number(w.ratio, 2) } }}</small></span>
                  <span class="band small"><i [attr.data-w]="w.cls"></i>{{ 'bmi.waistClasses.' + w.cls | t }}</span>
                } @else {
                  <span class="small muted">{{ 'progress.waistNone' | t }}</span>
                }
              </button>
              <div class="stat wide">
                <span class="label"><span class="s-ico cool"><app-icon name="activity" [size]="15" /></span>{{ 'progress.trendPace' | t }}</span>
                @if (s.goal.trendKgPerWeek != null) {
                  <span class="v num">{{ 'progress.trendPaceValue' | t: { kg: signed(s.goal.trendKgPerWeek) } }}</span>
                } @else {
                  <span class="small muted">{{ 'progress.notEnough' | t }}</span>
                }
              </div>
            </section>
          }

          <!-- 1.19: the recap of the month that ended, told like a story (bright in the first days of the month) -->
          <a class="card list-row recap-row" [class.fresh]="recapFresh()" [routerLink]="['/app/progress/recap', lastMonth()]">
            <span class="list-icon recap-ico"><app-icon name="calendar" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'recap.entry' | t: { month: lastMonthName() } }}</span>
              <span class="list-sub">{{ 'recap.entrySub' | t }}</span>
            </span>
            <app-icon name="chevronRight" />
          </a>
          <!-- 1.19: three weeks without moving towards the goal: why, and what helps -->
          <app-plateau-card [logs]="all" [summary]="summary()" />

          <!-- 1.14: what is left, in calories: kilos × 7 700 ÷ the deficit of a day = the days -->
          @if (summary(); as s) {
            <!-- 1.17: where the calorie target comes from, step by step, with the member's own numbers -->
            <app-needs-card [summary]="s" />
            <app-deficit-card [summary]="s" />
          }

          @if (forecast(); as f) {
            <app-monthly-forecast [fromKg]="f.from" [goalKg]="f.goal" [kgPerWeek]="f.pace" [basis]="f.basis" />
          }

          <app-milestones-card (share)="shareSheet.open('MILESTONE', '', $event)" />

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
    <app-bmi-sheet #bmiSheet [weightKg]="bmiWeight()" [heightCm]="summary()?.profile?.heightCm ?? 170" [goalKg]="summary()?.goal?.goalKg ?? null"
      [sex]="summary()?.profile?.sex ?? null" [age]="summary()?.profile?.age ?? null" [waistCm]="waist()?.cm ?? null" [bodyFatPct]="bodyFat()" />
  `,
  styles: `
    .recap-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: var(--space-3) var(--space-4);
      color: inherit;
      text-decoration: none;
    }
    .recap-ico {
      background: var(--accent-soft) !important;
      color: var(--accent-text) !important;
    }
    .recap-row.fresh {
      border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
      background: radial-gradient(120% 140% at 0% 50%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%), var(--surface);
    }
    .recap-row.fresh .list-title {
      font-weight: 750;
    }
    .page-head .spacer {
      flex: 1;
    }
    .share-btn {
      flex: none;
    }
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
    }
    .stat.wide {
      grid-column: 1 / -1;
    }
    /* the BMI tile opens its explanation */
    .stat.bmi {
      align-content: start;
      width: 100%;
      font: inherit;
      color: inherit;
      text-align: left;
      transition: transform var(--dur-1) var(--ease-out), background-color var(--dur-2);
    }
    a.stat.bmi {
      text-decoration: none;
    }
    .stat.bmi.is-pressed {
      transform: scale(0.97);
    }
    .stat.bmi .label > svg:last-child {
      margin-left: auto;
      color: var(--fg-3);
    }
    .stat.bmi .label {
      width: 100%;
    }
    .band {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--fg-2);
      font-weight: 600;
      line-height: 1.25;
    }
    .band i {
      width: 10px;
      height: 10px;
      flex: none;
      border-radius: 3px;
    }
    .band i[data-c='under'] {
      background: var(--cal-freeze-ink);
    }
    .band i[data-c='normal'] {
      background: var(--cal-done-ink);
    }
    .band i[data-c='over'] {
      background: #e0a500;
    }
    .band i[data-c='obese1'] {
      background: #ff7a1a;
    }
    .band i[data-c='obese2'] {
      background: #ea4a17;
    }
    .band i[data-c='obese3'] {
      background: #d61f1f;
    }
    .band i[data-w='thin'] {
      background: var(--cal-freeze-ink);
    }
    .band i[data-w='healthy'] {
      background: var(--cal-done-ink);
    }
    .band i[data-w='raised'] {
      background: #e0a500;
    }
    .band i[data-w='high'] {
      background: #d61f1f;
    }
    .stat .label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .s-ico {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex: none;
      border-radius: 9px;
      background: var(--surface-3);
      color: var(--fg-2);
    }
    .s-ico.accent {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .s-ico.cool {
      background: var(--cool-soft, var(--surface-3));
      color: var(--cool);
    }
    .s-ico.good {
      background: var(--success-soft, var(--surface-3));
      color: var(--success);
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

  `,
})
export class ProgressPage {
  private readonly tracking = inject(TrackingStore);
  // ── 1.17: the weight or the blood pressure ─────────────────────────────
  private readonly session = inject(SessionStore);
  /** ?view=bp (from Today's blood pressure card) */
  readonly viewParam = input<string | undefined>(undefined, { alias: 'view' });
  protected readonly chosen = signal<'weight' | 'bp' | null>(null);
  protected readonly bpOn = computed(() => !!this.session.account()?.bpEnabled);
  protected readonly view = computed(() => (this.bpOn() ? (this.chosen() ?? (this.viewParam() === 'bp' ? 'bp' : 'weight')) : 'weight'));
  protected readonly i18n = inject(I18nService);
  private readonly sheet = viewChild.required(WeighSheetComponent);

  protected readonly ranges: Range[] = ['m1', 'm3', 'all'];
  protected readonly range = signal<Range>('m1');
  protected readonly rangeDays = computed(() => RANGE_DAYS[this.range()]);
  protected readonly summary = this.tracking.summary;
  protected readonly logs = this.tracking.logs;
  /** 1.19: the month that ended, its recap */
  protected readonly lastMonth = computed(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  protected readonly lastMonthName = computed(() => this.i18n.date(this.lastMonth() + '-15', { month: 'long' }));
  protected readonly recapFresh = computed(() => new Date().getDate() <= 10);
  protected readonly hasWeights = computed(() => (this.logs() ?? []).some((l) => l.weightKg != null));
  protected readonly history = computed(() => [...(this.logs() ?? [])].reverse());
  /** month by month: at the real pace of the last weeks when it goes the right way, at the planned pace otherwise */
  protected readonly forecast = computed(() => {
    const s = this.summary();
    if (!s || s.goal.reached) return null;
    const from = s.current.trendKg ?? s.current.weightKg ?? s.profile.startWeightKg;
    const goal = s.goal.goalKg;
    const losing = goal < from;
    const trend = s.goal.trendKgPerWeek;
    const goodTrend = trend != null && Math.abs(trend) >= 0.05 && (losing ? trend < 0 : trend > 0);
    return { from, goal, pace: goodTrend ? Math.abs(trend!) : s.profile.weeklyRateKg, basis: (goodTrend ? 'trend' : 'plan') as 'trend' | 'plan' };
  });
  protected readonly goalDate = computed(() => this.summary()?.goal.trendDate ?? this.summary()?.goal.planDate ?? null);
  /** the BMI of the last weigh-in (as the server computes it) */
  protected readonly bmiWeight = computed(() => {
    const s = this.summary();
    return s?.current.weightKg ?? s?.current.trendKg ?? s?.profile.startWeightKg ?? 70;
  });
  protected readonly bmiCls = computed(() => bmiBand(this.summary()?.current.bmi ?? 0).cls);
  /** the last waist measured, against the height (a better landmark than the BMI for a muscular body) */
  protected readonly waist = computed(() => {
    const h = this.summary()?.profile.heightCm;
    const cm = [...(this.logs() ?? [])].reverse().find((l) => l.waistCm != null)?.waistCm;
    return h && cm ? { cm, ratio: Math.floor((cm / h) * 100) / 100, cls: waistClass(cm, h) } : null;
  });
  protected readonly bodyFat = computed(() => [...(this.logs() ?? [])].reverse().find((l) => l.bodyFatPct != null)?.bodyFatPct ?? null);

  constructor() {
    // 1.16: as last seen when it was less than 30 s ago (core/api/kept.ts)
    void this.tracking.ensure();
    void this.tracking.ensureLogs().catch(() => undefined);
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
