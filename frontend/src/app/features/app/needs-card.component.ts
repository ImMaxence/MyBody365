import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Job, Summary } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';

/** the day without sport (the server's BodyMath.Job; a weekly session adds 0.03) */
const JOB_BASE: Record<Job, number> = { SEATED: 1.2, STANDING: 1.35, PHYSICAL: 1.55 };
/** 1 kg of body fat ≈ 7 700 kcal */
const KCAL_PER_KG = 7700;
const FLOOR = { MALE: 1500, FEMALE: 1200, OTHER: 1350 } as const;

/**
 * 1.17: « Tes calories, étape par étape », with the member's own numbers, as the server works them out (TrackingService
 * .summary, BodyMath): the needs at rest (Mifflin-St Jeor: weight, height, age, sex), times the activity (the day without
 * sport, plus each weekly session), or the real needs when asked for, then the pace's deficit (or surplus), never under
 * the floor.
 */
@Component({
  selector: 'app-needs-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent],
  template: `
    @if (calc(); as c) {
      <section class="card needs" [attr.aria-labelledby]="'needs-title'">
        <div class="head">
          <span class="n-ico"><app-icon name="gauge" [size]="18" [stroke]="2.2" /></span>
          <h2 class="h3" id="needs-title">{{ 'progress.needs.title' | t }}</h2>
        </div>
        <p class="small muted">{{ 'progress.needs.intro' | t }}</p>

        <ol class="steps" role="list">
          <li>
            <span class="num-i" aria-hidden="true">1</span>
            <div class="body">
              <div class="row">
                <b>{{ 'progress.needs.rest' | t }}</b>
                <span class="res num">{{ 'progress.needs.kcal' | t: { kcal: i18n.number(c.bmr) } }}</span>
              </div>
              <p class="formula num">
                {{ 'progress.needs.restFormula' | t: { kg: i18n.number(c.kg, 1), k: i18n.number(6.25, 2), cm: i18n.number(c.cm), age: c.age } }}
                {{ 'progress.needs.sex.' + c.sex | t }}
              </p>
              <p class="tiny muted">{{ 'progress.needs.restHint' | t }}</p>
            </div>
          </li>
          <li>
            <span class="num-i" aria-hidden="true">2</span>
            <div class="body">
              <div class="row">
                <b>{{ 'progress.needs.activity' | t }}</b>
                <span class="res num">× {{ i18n.number(c.factor, 2) }} = {{ 'progress.needs.kcal' | t: { kcal: i18n.number(c.estimated) } }}</span>
              </div>
              @if (c.job; as job) {
                <p class="formula num">{{ 'progress.needs.activityJob' | t: { job: ('progress.needs.jobs.' + job | t), base: i18n.number(c.base, 2) } }}</p>
                <p class="formula num">
                  @if (c.sessions > 0) {
                    {{ 'progress.needs.activitySessions' | t: { n: c.sessions, k: i18n.number(0.03, 2), add: i18n.number(c.sessions * 0.03, 2) } }}
                  } @else {
                    {{ 'progress.needs.activityNone' | t }}
                  }
                </p>
              } @else {
                <p class="formula num">{{ 'progress.needs.activityLevel' | t: { level: ('setup.activities.' + c.level + '.label' | t), factor: i18n.number(c.factor, 2) } }}</p>
              }
              <p class="tiny muted">{{ 'progress.needs.activityHint' | t }}</p>
            </div>
          </li>
          @if (c.adaptive) {
            <li>
              <span class="num-i" aria-hidden="true"><app-icon name="activity" [size]="14" [stroke]="2.4" /></span>
              <div class="body">
                <div class="row">
                  <b>{{ 'progress.needs.real' | t }}</b>
                  <span class="res num">{{ 'progress.needs.kcal' | t: { kcal: i18n.number(c.tdee) } }}</span>
                </div>
                <p class="tiny muted">{{ 'progress.needs.realHint' | t: { days: c.realDays } }}</p>
              </div>
            </li>
          }
          <li class="goal">
            <span class="num-i" aria-hidden="true">{{ c.adaptive ? 4 : 3 }}</span>
            <div class="body">
              <div class="row">
                <b>{{ 'progress.needs.target' | t }}</b>
                <span class="res num">{{ c.losing ? '−' : '+' }} {{ i18n.number(c.change) }} = {{ 'progress.needs.perDay' | t: { kcal: i18n.number(c.target) } }}</span>
              </div>
              <p class="formula num">{{ 'progress.needs.targetFormula' | t: { kg: i18n.number(c.rate, 2), change: i18n.number(c.pace) } }}</p>
              @if (c.floorApplied) {
                <p class="tiny alert"><app-icon name="alert" [size]="14" /> {{ 'progress.needs.targetFloor' | t: { floor: i18n.number(c.floor) } }}</p>
              }
            </div>
          </li>
        </ol>
        <p class="tiny muted">{{ 'progress.needs.note' | t }}</p>
        @if (link()) {
          <a class="edit small" routerLink="/app/account/goal">{{ 'progress.needs.edit' | t }} <app-icon name="chevronRight" [size]="16" /></a>
        }
      </section>
    }
  `,
  styles: `
    .needs {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .head .h3,
    p {
      margin: 0;
    }
    .n-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 12px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .steps {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .steps li {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      border-radius: 16px;
      background: var(--surface-2);
    }
    .steps li.goal {
      background: var(--accent-soft);
    }
    .num-i {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--surface);
      font-size: 12px;
      font-weight: 800;
      color: var(--accent-text);
    }
    .body {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 2px 10px;
    }
    .res {
      font-weight: 750;
      color: var(--fg);
    }
    .goal .res {
      color: var(--accent-text);
    }
    .formula {
      font-size: 13px;
      color: var(--fg-2);
      overflow-wrap: anywhere;
    }
    .alert {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      color: var(--fg-2);
    }
    .alert app-icon {
      flex: none;
      color: #e2711d;
    }
    .edit {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      justify-self: start;
      color: var(--accent-text);
      font-weight: 650;
    }
  `,
})
export class NeedsCardComponent {
  readonly summary = input.required<Summary>();
  /** a link to « Mon objectif » (not on that screen itself) */
  readonly link = input(true);
  protected readonly i18n = inject(I18nService);

  protected readonly calc = computed(() => {
    const s = this.summary();
    const p = s.profile;
    const e = s.energy;
    const rate = p.weeklyRateKg;
    const losing = s.goal.goalKg < (s.current.trendKg ?? p.startWeightKg);
    const target = e.targetKcal;
    const change = Math.abs(Math.round(e.tdee) - target);
    return {
      kg: s.current.weightKg ?? p.startWeightKg,
      cm: p.heightCm,
      age: p.age,
      sex: p.sex,
      bmr: e.bmr,
      job: p.job ?? null,
      base: p.job ? JOB_BASE[p.job] : p.activityFactor,
      sessions: p.sessionsPerWeek ?? 0,
      level: p.activityLevel,
      factor: p.activityFactor,
      estimated: e.estimatedTdee,
      adaptive: e.adaptive,
      tdee: Math.round(e.tdee),
      realDays: e.realDays ?? 0,
      losing,
      rate,
      change,
      pace: Math.round((rate * KCAL_PER_KG) / 7),
      target,
      floorApplied: e.floorApplied,
      floor: FLOOR[p.sex],
    };
  });

}
