import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TrackingStore, localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';
import { WeighSheetComponent } from './weigh-sheet.component';

/** "Today": the streak, the day's to-do (the weigh-in validates the day) and the goal. */
@Component({
  selector: 'app-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, WeighSheetComponent],
  template: `
    <main class="page">
      <header class="head">
        <div>
          <p class="eyebrow">{{ todayLabel() }}</p>
          <h1 class="display hello">{{ greeting() }}</h1>
        </div>
        <a routerLink="/app/account" class="avatar" [attr.aria-label]="'nav.profile' | t">
          @if (account()?.avatarUrl; as src) {
            <img [src]="src" alt="" referrerpolicy="no-referrer" width="40" height="40" />
          } @else {
            {{ initial() }}
          }
        </a>
      </header>

      @if (session.isAdmin() && pending() > 0) {
        <a routerLink="/app/admin/requests" class="admin-cta">
          <app-icon name="shield" [size]="18" />
          <span>{{ 'today.adminCta' | t }}</span>
          <span class="count-badge">{{ pending() }}</span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      }

      <section class="streak" [class.lit]="streakDays() > 0" [attr.aria-label]="'today.streak' | t">
        <div class="flame"><app-icon name="flame" [size]="34" [stroke]="2.1" /></div>
        <div class="streak-copy">
          <span class="label">{{ 'today.streak' | t }}</span>
          <span class="big num">{{ streakDays() }} <small>{{ 'today.streakDays' | t }}</small></span>
        </div>
        <div class="week" aria-hidden="true">
          @for (d of week(); track d.day; let i = $index) {
            <span class="day" [class.done]="d.done" [class.now]="d.today" [style.--i]="i">
              <i>
                @if (d.done) {
                  <app-icon name="check" [size]="12" [stroke]="3" />
                }
              </i>
              {{ d.label }}
            </span>
          }
        </div>
        <p class="small hint">{{ streakMessage() | t }}</p>
      </section>

      <h2 class="section-title">{{ 'today.todo' | t }}</h2>
      <div class="list">
        <button type="button" class="list-item task" [class.done]="weighedIn()" (click)="weigh()">
          <span class="list-icon"><app-icon [name]="weighedIn() ? 'check' : 'weight'" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'today.weighIn' | t }}</span>
            <span class="list-sub">
              @if (weighedIn()) {
                {{ 'today.weighInDone' | t: { kg: i18n.number(summary()?.current?.weightKg ?? 0, 1) } }}
              } @else {
                {{ 'today.weighInHint' | t }}
              }
            </span>
          </span>
          <app-icon [name]="weighedIn() ? 'pencil' : 'plus'" />
        </button>
        @for (item of later; track item.key) {
          <div class="list-item soon">
            <span class="list-icon"><app-icon [name]="item.icon" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'today.' + item.key | t }}</span>
              <span class="list-sub">{{ 'today.' + item.key + 'Hint' | t }}</span>
            </span>
            <span class="chip">{{ 'common.soon' | t }}</span>
          </div>
        }
      </div>

      @if (summary(); as s) {
        <a routerLink="/app/progress" class="goal card">
          <div class="goal-top">
            <span class="goal-ico"><app-icon name="target" /></span>
            <div class="grow">
              <h2 class="h3">{{ 'today.goal' | t }} <span class="goal-kg num">{{ i18n.number(s.goal.goalKg, 1) }} kg</span></h2>
              <p class="small muted">
                @if (s.goal.reached) {
                  {{ 'today.goalReached' | t }}
                } @else {
                  {{ (s.goal.remainingKg < 0 ? 'today.goalLose' : 'today.goalGain') | t: { kg: i18n.number(Math.abs(s.goal.remainingKg), 1) } }}
                  @if (eta(); as date) {
                    · {{ 'today.goalEta' | t: { date: date } }}
                  }
                }
              </p>
            </div>
            <app-icon name="chevronRight" [size]="18" />
          </div>
          <div class="bar" role="progressbar" [attr.aria-label]="'today.goal' | t" [attr.aria-valuenow]="s.goal.progressPct" aria-valuemin="0" aria-valuemax="100">
            <i [style.width.%]="s.goal.progressPct"></i>
          </div>
          <div class="goal-foot small">
            <span class="num">{{ i18n.number(s.profile.startWeightKg, 1) }} kg</span>
            <span class="chip chip-accent"><app-icon name="flame" /> {{ 'today.kcal' | t: { kcal: i18n.number(s.energy.targetKcal) } }}</span>
            <span class="num">{{ i18n.number(s.goal.goalKg, 1) }} kg</span>
          </div>
        </a>
      } @else {
        <div class="skeleton" style="height: 150px; border-radius: 24px"></div>
      }
    </main>
    <app-weigh-sheet />
  `,
  styles: `
    .head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
      padding-top: var(--space-3);
    }
    .hello {
      font-size: 2.1rem;
      margin-top: 4px;
    }
    .admin-cta {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--cool-soft);
      color: var(--cool);
      font-weight: 650;
      font-size: var(--fs-s);
    }
    .admin-cta span:first-of-type {
      flex: 1;
    }
    .streak {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-3) var(--space-4);
      align-items: center;
      padding: var(--space-5);
      border-radius: var(--radius-xl);
      overflow: hidden;
      background:
        radial-gradient(120% 120% at 0% 0%, rgba(255, 61, 31, 0.2), transparent 55%),
        radial-gradient(100% 100% at 100% 100%, rgba(255, 194, 61, 0.14), transparent 60%),
        var(--surface);
      border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
    }
    .flame {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 22px;
      background: var(--surface-3);
      color: var(--fg-3);
      transition: background-color var(--dur-3);
    }
    .lit .flame {
      background: var(--flame);
      color: var(--accent-ink);
      box-shadow: 0 14px 30px -10px var(--accent-glow);
      animation: flicker 2.4s ease-in-out infinite;
    }
    @keyframes flicker {
      0%,
      100% {
        transform: scale(1) rotate(0);
      }
      30% {
        transform: scale(1.04) rotate(-2deg);
      }
      60% {
        transform: scale(0.98) rotate(1.5deg);
      }
    }
    .streak-copy {
      display: grid;
    }
    .label {
      font-size: var(--fs-s);
      font-weight: 600;
      color: var(--fg-2);
    }
    .big {
      font-family: var(--font-display);
      font-stretch: 122%;
      font-weight: 800;
      font-size: 2.6rem;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .big small {
      font-size: var(--fs-s);
      font-weight: 600;
      color: var(--fg-2);
      letter-spacing: 0;
    }
    .week {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
    }
    .day {
      display: grid;
      justify-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--fg-3);
      text-transform: uppercase;
    }
    .day i {
      display: grid;
      place-items: center;
      width: 100%;
      max-width: 36px;
      aspect-ratio: 1;
      border-radius: 12px;
      background: var(--surface-3);
      color: #fff;
      animation: cell-in 420ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 45ms);
    }
    .day.done i {
      background: #16a34a;
    }
    .day.now {
      color: var(--accent-text);
    }
    .day.now:not(.done) i {
      outline: 2px dashed color-mix(in srgb, var(--accent) 60%, transparent);
      outline-offset: 2px;
    }
    @keyframes cell-in {
      from {
        transform: scale(0.4);
        opacity: 0;
      }
    }
    .hint {
      grid-column: 1 / -1;
      color: var(--fg-2);
    }
    .task.done .list-icon {
      background: #16a34a;
      color: #fff;
    }
    /* the goal weight never splits from its unit */
    .goal-kg {
      white-space: nowrap;
      color: var(--accent-text);
    }
    .soon .list-icon {
      color: var(--fg-3);
    }
    .goal {
      display: grid;
      gap: var(--space-4);
      transition: transform var(--dur-1) var(--ease-out);
    }
    .goal:active {
      transform: scale(0.99);
    }
    .goal-top {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .goal-ico {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      flex: none;
      border-radius: 16px;
      background: var(--cool-soft);
      color: var(--cool);
    }
    .bar {
      height: 10px;
      border-radius: 5px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 5px;
      background: var(--flame);
      animation: grow 900ms var(--ease-out) both;
      transform-origin: 0 50%;
    }
    @keyframes grow {
      from {
        transform: scaleX(0);
      }
    }
    .goal-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      color: var(--fg-2);
      font-weight: 600;
    }
  `,
})
export class TodayPage {
  protected readonly session = inject(SessionStore);
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(ApiService);
  private readonly tracking = inject(TrackingStore);
  private readonly sheet = viewChild.required(WeighSheetComponent);
  protected readonly Math = Math;

  protected readonly account = this.session.account;
  protected readonly summary = this.tracking.summary;
  protected readonly pending = signal(0);
  protected readonly later = [
    { key: 'photo', icon: 'camera' },
    { key: 'meals', icon: 'utensils' },
  ];

  protected readonly weighedIn = computed(() => this.summary()?.streak.todayDone === true);
  protected readonly streakDays = computed(() => this.summary()?.streak.days ?? 0);
  protected readonly streakMessage = computed(() =>
    this.weighedIn() ? 'today.streakSafe' : this.streakDays() > 0 ? 'today.streakKeep' : 'today.streakStart',
  );
  protected readonly initial = computed(() => (this.account()?.displayName ?? '?').charAt(0).toUpperCase());
  protected readonly todayLabel = computed(() =>
    this.i18n.date(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' }),
  );
  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    const key = h < 12 ? 'today.greetingMorning' : h < 18 ? 'today.greetingDay' : 'today.greetingEvening';
    return this.i18n.t(key, { name: this.account()?.displayName ?? '' });
  });
  protected readonly week = computed(() => {
    const fmt = new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'narrow' });
    const today = new Date().toDateString();
    const days = this.summary()?.streak.week;
    if (days) {
      return days.map((d) => {
        const date = new Date(d.day + 'T12:00:00');
        return { day: d.day, label: fmt.format(date), done: d.done, today: date.toDateString() === today };
      });
    }
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return { day: String(i), label: fmt.format(date), done: false, today: date.toDateString() === today };
    });
  });
  protected readonly eta = computed(() => {
    const g = this.summary()?.goal;
    const date = g?.trendDate ?? g?.planDate;
    return date ? this.i18n.date(date, { day: 'numeric', month: 'long' }) : null;
  });

  constructor() {
    void this.tracking.load();
    if (this.session.isAdmin()) {
      this.api
        .adminSummary()
        .then((s) => this.pending.set(s.pendingRequests))
        .catch(() => undefined);
    }
  }

  /** today's weigh-in: a new one, or the existing one with its measurements (a save replaces the day) */
  protected async weigh(): Promise<void> {
    let entry = null;
    if (this.weighedIn()) {
      const logs = this.tracking.logs() ?? (await this.tracking.loadLogs());
      entry = logs.find((l) => l.day === localDay()) ?? null;
    }
    this.sheet().open(localDay(), entry);
  }
}
