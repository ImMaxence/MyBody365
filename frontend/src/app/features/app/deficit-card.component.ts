import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { Summary } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';

/** 1 kg of body fat ≈ 7 700 kcal */
const KCAL_PER_KG = 7700;

/**
 * 1.14: « Le calcul de ton objectif », on Progress: what is left in calories (kilos × 7 700), divided by the deficit of a
 * day, gives the days, then the date. The deficit of the plan (the daily expense minus the target), or another one to
 * see: the ones over 1 % of the weight a week are not offered, a day under the floor (1 200 or 1 500 kcal) is said.
 * 1.20: the real pace of the last 4 weeks is said next to it, with its date (the one of Today, of the curve and of the
 * forecast): the plan's date alone looked like a second goal date.
 */
@Component({
  selector: 'app-deficit-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (calc(); as c) {
      <section class="card deficit">
        <div class="head">
          <span class="d-ico"><app-icon name="target" [size]="18" [stroke]="2.2" /></span>
          <h2 class="h3">{{ 'progress.deficit.title' | t }}</h2>
        </div>
        <p class="small muted">{{ (c.losing ? 'progress.deficit.intro' : 'progress.deficit.introGain') | t }}</p>

        <div class="result">
          <span class="days num">{{ 'progress.deficit.days' | t: { days: i18n.number(c.days) } }}</span>
          <span class="date small">{{ 'progress.deficit.date' | t: { date: i18n.date(c.date, { day: 'numeric', month: 'long', year: 'numeric' }) } }}</span>
        </div>

        <ol class="steps" role="list">
          <li class="num">{{ 'progress.deficit.total' | t: { kg: i18n.number(c.kg, c.kg % 1 ? 1 : 0), total: i18n.number(c.total) } }}</li>
          <li class="num">{{ 'progress.deficit.perDay' | t: { total: i18n.number(c.total), deficit: i18n.number(c.deficit), days: i18n.number(c.days) } }}</li>
        </ol>

        <span class="label">{{ (c.losing ? 'progress.deficit.choose' : 'progress.deficit.chooseGain') | t }}</span>
        <div class="slide-chips" role="group" [attr.aria-label]="(c.losing ? 'progress.deficit.choose' : 'progress.deficit.chooseGain') | t">
          @for (o of c.options; track o.kcal) {
            <button type="button" [attr.aria-pressed]="o.kcal === c.deficit" (click)="chosen.set(o.kcal)">
              @if (o.plan) {
                {{ 'progress.deficit.plan' | t }} ·
              }
              {{ i18n.number(o.kcal) }} kcal
            </button>
          }
        </div>
        <p class="small">{{ 'progress.deficit.eat' | t: { eat: i18n.number(c.eat), tdee: i18n.number(c.tdee) } }}</p>
        @if (c.tooLow) {
          <p class="alert small"><app-icon name="alert" [size]="16" /> <span>{{ 'progress.deficit.tooLow' | t: { min: i18n.number(c.floor) } }}</span></p>
        }
        <!-- 1.20: what the scale says next to this calculation, with the date of Today, of the curve and of the forecast -->
        @if (c.real; as r) {
          <p class="real small">
            <app-icon name="activity" [size]="16" />
            <span>
              <strong>{{ 'progress.deficit.real' | t: { kg: kg(r.kg) } }}</strong>
              {{ 'progress.deficit.real' + r.vs | t: { kg: kg(r.pace), date: i18n.date(r.date, { day: 'numeric', month: 'long', year: 'numeric' }) } }}
            </span>
          </p>
        }
        <p class="tiny muted">{{ 'progress.deficit.note' | t }}</p>
      </section>
    }
  `,
  styles: `
    .deficit {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .head .h3 {
      margin: 0;
    }
    .d-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 12px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    p {
      margin: 0;
    }
    .result {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 12px;
    }
    .days {
      font-family: var(--font-display);
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .date {
      color: var(--accent-text);
      font-weight: 700;
    }
    .steps {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: var(--space-3);
      border-radius: 16px;
      background: var(--surface-2);
      list-style: none;
      font-size: 13.5px;
      color: var(--fg-2);
    }
    .label {
      margin-top: var(--space-1);
    }
    .alert {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: var(--space-3);
      border-radius: 16px;
      background: color-mix(in srgb, #e2711d 10%, transparent);
    }
    .alert app-icon {
      flex: none;
      margin-top: 1px;
      color: #e2711d;
    }
    .real {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: var(--space-3);
      border-radius: 16px;
      background: var(--cool-soft);
    }
    .real app-icon {
      flex: none;
      margin-top: 2px;
      color: var(--cool);
    }
    .real > span {
      color: var(--fg-2);
    }
    .real strong {
      display: block;
      margin-bottom: 2px;
      font-weight: 700;
      color: var(--fg);
    }
  `,
})
export class DeficitCardComponent {
  readonly summary = input.required<Summary>();
  protected readonly i18n = inject(I18nService);
  /** the deficit picked to see (null: the plan's) */
  protected readonly chosen = signal<number | null>(null);

  protected readonly calc = computed(() => {
    const s = this.summary();
    const now = s.current.trendKg ?? s.current.weightKg ?? s.profile.startWeightKg;
    const kg = Math.round(Math.abs(now - s.goal.goalKg) * 10) / 10;
    if (s.goal.reached || kg < 0.2) return null;
    const losing = s.goal.goalKg < now;
    const tdee = Math.round(s.energy.tdee);
    const plan = Math.round(Math.abs(tdee - s.energy.targetKcal));
    // 1 % of the weight a week at most, by steps of 0.05 kg (as the server's pace), 0.25 to 1 kg
    const maxRate = Math.max(0.25, Math.min(1, Math.floor((now * 0.01) / 0.05 + 1e-9) * 0.05));
    const max = (maxRate * KCAL_PER_KG) / 7;
    const options = [
      ...(plan >= 100 ? [{ kcal: plan, plan: true }] : []),
      ...[300, 500, 750, 1000].filter((k) => k <= max + 1 && Math.abs(k - plan) >= 50).map((k) => ({ kcal: k, plan: false })),
    ].sort((a, b) => (a.plan ? -1 : b.plan ? 1 : a.kcal - b.kcal));
    if (options.length === 0) return null;
    const picked = this.chosen();
    const deficit = picked != null && options.some((o) => o.kcal === picked) ? picked : (options.find((o) => o.plan) ?? options[0]).kcal;
    const total = Math.round(kg * KCAL_PER_KG);
    const days = Math.ceil(total / deficit);
    const date = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const eat = losing ? tdee - deficit : tdee + deficit;
    const floor = s.profile.sex === 'MALE' ? 1500 : 1200;
    // 1.20: the real pace of the last 4 weeks, when it goes the right way, against the pace of this deficit
    const pace = (deficit * 7) / KCAL_PER_KG;
    const trend = s.goal.trendKgPerWeek;
    const good = trend != null && Math.abs(trend) >= 0.05 && (losing ? trend < 0 : trend > 0) && !!s.goal.trendDate;
    const vs = !good ? null : Math.abs(trend!) >= pace * 1.1 ? 'Faster' : Math.abs(trend!) <= pace * 0.9 ? 'Slower' : 'Same';
    const real = good ? { kg: Math.abs(trend!), date: s.goal.trendDate!, pace, vs } : null;
    return { kg, losing, tdee, total, deficit, days, date, eat, floor, tooLow: losing && eat < floor, options, real };
  });

  /** kilos a week: 0,5 or 0,68, never 0,50 */
  protected kg(n: number): string {
    return this.i18n.number(n, Math.round(n * 100) % 10 === 0 ? 1 : 2);
  }
}
