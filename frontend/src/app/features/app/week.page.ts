import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { BodyLogEntry, MealStats } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { macroPlan } from '../../core/meals/macro-plan';
import { MealsApi } from '../../core/meals/meals-api';
import { shiftDay } from '../../core/meals/meals.store';
import { trends } from '../../core/meals/trends';
import { TrackingStore, localDay } from '../../core/tracking/tracking.store';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { TrendsCardComponent } from '../meals/trends-card.component';

/**
 * « Ta semaine », opened by the Sunday notification (or from Today): the weight trend over 7 days, the sessions
 * noted against the ones the target counts on, the days of meals noted and their average, the flame, and what
 * stands out in the meals. The figures stay here, never in the notification.
 */
@Component({
  selector: 'app-week',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent, TrendsCardComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'week.title' | t }}</h1>
      </header>
      <p class="small muted">{{ 'week.range' | t: { from: i18n.date(from), to: i18n.date(today) } }}</p>

      @if (summary(); as s) {
        <section class="tiles">
          <div class="tile card">
            <span class="t-label"><app-icon name="weight" [size]="16" /> {{ 'week.weight' | t }}</span>
            @if (weightChange(); as w) {
              <b class="num">{{ w }}</b>
              <span class="small muted">{{ 'week.weightTrend' | t }}</span>
            } @else {
              <b>–</b>
              <span class="small muted">{{ 'week.weightNone' | t }}</span>
            }
          </div>
          <div class="tile card">
            <span class="t-label"><app-icon name="dumbbell" [size]="16" /> {{ 'week.sessions' | t }}</span>
            <b class="num">{{ s.training.thisWeek }}</b>
            <span class="small muted">
              {{ s.profile.sessionsPerWeek ? ('week.sessionsOf' | t: { n: s.profile.sessionsPerWeek }) : ('week.sessionsNoted' | t) }}
            </span>
          </div>
          <div class="tile card">
            <span class="t-label"><app-icon name="utensils" [size]="16" /> {{ 'week.meals' | t }}</span>
            <b class="num">{{ stats()?.daily?.length ?? 0 }} / 7</b>
            <span class="small muted">{{ 'week.mealsDays' | t }}</span>
          </div>
          <div class="tile card">
            <span class="t-label"><app-icon name="flame" [size]="16" /> {{ 'week.average' | t }}</span>
            @if (average(); as a) {
              <b class="num">{{ i18n.number(a) }} kcal</b>
              <span class="small muted">{{ 'week.averageOf' | t: { target: i18n.number(s.energy.targetKcal) } }}</span>
            } @else {
              <b>–</b>
              <span class="small muted">{{ 'week.averageNone' | t }}</span>
            }
          </div>
        </section>

        <app-trends-card [trends]="weekTrends()" />

        <div class="list">
          <a routerLink="/app/meals/stats" class="list-item">
            <span class="list-icon"><app-icon name="bars" /></span>
            <span class="list-body"><span class="list-title">{{ 'meals.stats.title' | t }}</span></span>
            <app-icon name="chevronRight" />
          </a>
          <a routerLink="/app/progress" class="list-item">
            <span class="list-icon"><app-icon name="chart" /></span>
            <span class="list-body"><span class="list-title">{{ 'nav.progress' | t }}</span></span>
            <app-icon name="chevronRight" />
          </a>
        </div>
      } @else {
        <div class="skeleton" style="height: 220px; border-radius: 24px"></div>
      }
    </main>
  `,
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .tile {
      display: grid;
      align-content: start;
      gap: 4px;
      padding: var(--space-4);
    }
    .t-label {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--fg-2);
      font-size: var(--fs-s);
      font-weight: 650;
    }
    .tile b {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-size: 1.45rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
  `,
})
export class WeekPage {
  protected readonly i18n = inject(I18nService);
  private readonly tracking = inject(TrackingStore);
  private readonly meals = inject(MealsApi);
  protected readonly summary = this.tracking.summary;
  protected readonly today = localDay();
  protected readonly from = shiftDay(this.today, -6);
  protected readonly stats = signal<MealStats | null>(null);
  private readonly logs = signal<BodyLogEntry[] | null>(null);

  /** the trend now, against the trend a week ago: « −0,4 kg » */
  protected readonly weightChange = computed(() => {
    const list = (this.logs() ?? []).filter((l) => l.trendKg != null);
    const now = list.at(-1);
    const before = [...list].reverse().find((l) => l.day <= shiftDay(this.today, -7));
    if (!now || !before || now.day === before.day) return null;
    const v = Math.round((now.trendKg! - before.trendKg!) * 10) / 10;
    return `${v > 0 ? '+' : ''}${this.i18n.number(v, 1)} kg`;
  });

  /** the days fully noted (today, in progress, aside) */
  protected readonly average = computed(() => {
    const days = (this.stats()?.daily ?? []).filter((d) => d.day < this.today);
    return days.length ? Math.round(days.reduce((t, d) => t + d.kcal, 0) / days.length) : null;
  });

  protected readonly weekTrends = computed(() => {
    const s = this.tracking.summary();
    const plan = s ? macroPlan(s.energy.targetKcal, s.profile.macroSplit, s.current.weightKg ?? s.profile.startWeightKg, s.profile.goalWeightKg) : null;
    return trends(this.stats(), plan);
  });

  constructor() {
    void this.tracking.load().catch(() => undefined);
    void this.tracking
      .loadLogs()
      .then((l) => this.logs.set(l))
      .catch(() => this.logs.set([]));
    void this.meals
      .stats(7)
      .then((st) => this.stats.set(st))
      .catch(() => undefined);
  }
}
