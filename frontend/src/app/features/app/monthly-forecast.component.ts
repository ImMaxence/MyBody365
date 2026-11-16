import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';

const DAY = 86_400_000;

export interface MonthRow {
  /** YYYY-MM */
  month: string;
  /** the weight expected at the end of the month (or on the day of the goal) */
  kg: number;
  /** what changes that month (negative: lost) */
  change: number;
  /** share of the way to the goal done by then, 0 to 1 */
  progress: number;
  /** the goal is reached during that month: the day */
  reachedOn?: string;
}

/** Month by month, from today's weight to the goal at a steady pace (24 months at most). */
export function monthlyForecast(fromKg: number, goalKg: number, kgPerWeek: number, today = localDay()): MonthRow[] {
  const total = Math.abs(goalKg - fromKg);
  if (total < 0.1 || kgPerWeek <= 0) return [];
  const dir = goalKg < fromKg ? -1 : 1;
  const perDay = kgPerWeek / 7;
  const start = new Date(today + 'T12:00:00');
  // the day of the goal, then the weight on the last day of each month until then
  const reach = new Date(start.getTime() + Math.ceil(total / perDay - 1e-9) * DAY);
  const rows: MonthRow[] = [];
  let before = fromKg;
  for (let i = 0; i < 24; i++) {
    const end = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 12);
    const done = end >= reach;
    const days = Math.round(((done ? reach : end).getTime() - start.getTime()) / DAY);
    const kg = fromKg + dir * Math.min(total, perDay * days);
    rows.push({
      month: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`,
      kg: Math.round(kg * 10) / 10,
      change: Math.round((kg - before) * 10) / 10,
      progress: Math.min(1, Math.abs(kg - fromKg) / total),
      reachedOn: done ? localDay(reach) : undefined,
    });
    if (done) break;
    before = kg;
  }
  return rows;
}

/** The month-by-month forecast: where the weight should be at the end of each month, until the goal. */
@Component({
  selector: 'app-monthly-forecast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (rows().length) {
      <section class="card forecast">
        <h2 class="f-title"><app-icon name="calendar" [size]="18" /> {{ 'progress.forecast.title' | t }}</h2>
        <p class="small muted">{{ caption() }}</p>
        <ol class="months">
          @for (r of rows(); track r.month; let i = $index) {
            <li [style.--i]="i" [class.goal]="r.reachedOn">
              <span class="m-name">{{ monthName(r.month) }}</span>
              <span class="m-bar" aria-hidden="true"><i [style.width.%]="r.progress * 100"></i></span>
              <span class="m-kg num">{{ i18n.number(r.kg, 1) }} kg</span>
              <span class="m-change num">{{ signed(r.change) }}</span>
              @if (r.reachedOn) {
                <span class="m-goal small"><app-icon name="target" [size]="14" /> {{ 'progress.forecast.reached' | t: { date: i18n.date(r.reachedOn, { day: 'numeric', month: 'long', year: 'numeric' }) } }}</span>
              }
            </li>
          }
        </ol>
        <p class="tiny muted">{{ 'progress.forecast.note' | t }}</p>
      </section>
    }
  `,
  styles: `
    .forecast {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .f-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.02rem;
      font-weight: 750;
    }
    .f-title app-icon {
      color: var(--accent-text);
    }
    .months {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .months li {
      display: grid;
      grid-template-columns: 5.6em minmax(0, 1fr) auto 4.2em;
      align-items: center;
      gap: var(--space-3);
      min-height: 40px;
      border-bottom: 1px solid var(--line);
      animation: rise 360ms var(--ease-out) both;
      animation-delay: calc(min(var(--i), 12) * 45ms);
    }
    .months li:last-child {
      border-bottom: 0;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateX(-6px);
      }
    }
    .m-name {
      font-weight: 650;
      text-transform: capitalize;
    }
    .m-bar {
      height: 8px;
      border-radius: 4px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .m-bar i {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--chart-1);
      animation: grow 800ms var(--ease-out) both;
      animation-delay: calc(min(var(--i), 12) * 45ms + 120ms);
    }
    @keyframes grow {
      from {
        width: 0;
      }
    }
    .m-kg {
      font-weight: 750;
      text-align: right;
    }
    .m-change {
      text-align: right;
      color: var(--fg-2);
      font-size: var(--fs-s);
      font-weight: 650;
    }
    .goal .m-bar i {
      background: var(--success);
    }
    .m-goal {
      grid-column: 1 / -1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: -4px 0 8px;
      color: var(--success);
      font-weight: 650;
    }
    @media (prefers-reduced-motion: reduce) {
      .months li,
      .m-bar i {
        animation: none;
      }
    }
  `,
})
export class MonthlyForecastComponent {
  readonly fromKg = input.required<number>();
  readonly goalKg = input.required<number>();
  /** the pace, positive */
  readonly kgPerWeek = input.required<number>();
  /** which pace: the real one (the trend of the last weeks) or the planned one */
  readonly basis = input<'trend' | 'plan'>('plan');
  protected readonly i18n = inject(I18nService);
  protected readonly rows = computed(() => monthlyForecast(this.fromKg(), this.goalKg(), this.kgPerWeek()));
  protected readonly caption = computed(() =>
    this.i18n.t('progress.forecast.' + this.basis(), { kg: this.i18n.number(this.kgPerWeek(), 2) }),
  );
  private readonly year = new Date().getFullYear();

  protected monthName(month: string): string {
    const y = Number(month.slice(0, 4));
    return this.i18n.date(month + '-01', y === this.year ? { month: 'long' } : { month: 'short', year: 'numeric' });
  }

  protected signed(n: number): string {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + this.i18n.number(Math.abs(n), 1);
  }
}
