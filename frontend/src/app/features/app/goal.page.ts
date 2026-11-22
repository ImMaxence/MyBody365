import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import type { Job } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { PacePickerComponent } from './pace-picker.component';
import { ActivityPickerComponent, answersOf } from './activity-picker.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { NeedsCardComponent } from './needs-card.component';

/** "My goal", pushed from the profile: target weight, pace, activity and height. */
@Component({
  selector: 'app-goal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NeedsCardComponent, PacePickerComponent, ActivityPickerComponent, TranslatePipe, IconComponent, NumberStepperComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'goal.title' | t }}</h1>
      </header>
      @if (summary(); as s) {
        <span class="label">{{ 'setup.goalWeight' | t }}</span>
        <app-number-stepper [(value)]="goal" [step]="0.5" [min]="s.profile.minGoalKg" [max]="300" [decimals]="1" unit="kg" [label]="'setup.goalWeight' | t" />
        <p class="hint">{{ 'setup.goalMin' | t: { kg: i18n.number(s.profile.minGoalKg, 1) } }}</p>

        <app-pace-picker [weight]="s.current.weightKg ?? s.profile.startWeightKg" [goal]="goal()" [(pace)]="pace" />

        <!-- 1.14: the starting point, if it was mistyped or the journey began before the app -->
        <span class="label" id="start-label">{{ 'goal.start' | t }}</span>
        <app-number-stepper [(value)]="start" [step]="0.1" [min]="30" [max]="350" [decimals]="1" unit="kg" [label]="'goal.start' | t" />
        <p class="hint">{{ 'goal.startHint' | t: { date: i18n.date(s.profile.startDate, { day: 'numeric', month: 'long', year: 'numeric' }) } }}</p>
        <!-- 1.16: the weigh-in of the start day, when it says another weight: put right with it (a typo) or kept (begun before the app) -->
        @if (startLogDiffers()) {
          <label class="fix-start">
            <span class="fix-body">
              <span class="fix-title">{{ 'goal.startLog' | t: { date: i18n.date(s.profile.startDate, { day: 'numeric', month: 'long' }) } }}</span>
              <span class="small muted">{{ 'goal.startLogHint' | t: { kg: i18n.number(startLog()!.weightKg!, 1) } }}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" [checked]="fixStartLog()" (change)="fixStartLog.set($any($event.target).checked)" />
          </label>
        }

        @if (!s.profile.job) {
          <p class="notice notice-accent"><app-icon name="info" [size]="18" /> {{ 'setup.activityNew' | t }}</p>
        }
        <app-activity-picker [(job)]="job" [(sessions)]="sessions" />
        <p class="focus tiny muted">{{ 'goal.foodFocus' | t }}</p>

        <span class="label">{{ 'setup.height' | t }}</span>
        <app-number-stepper [(value)]="height" [step]="1" [min]="120" [max]="230" [decimals]="0" unit="cm" [compact]="true" [label]="'setup.height' | t" />

        <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="save()"><app-icon name="check" /> {{ 'goal.save' | t }}</button>

        <!-- 1.17: the target as saved, worked out step by step -->
        <app-needs-card [summary]="s" [link]="false" />
      } @else {
        <div class="skeleton" style="height: 320px; border-radius: 24px"></div>
      }
    </main>
  `,
  styles: `
    .small-title {
      font-size: 1.6rem;
    }
    .focus {
      margin: 0;
      text-wrap: pretty;
    }
    .label {
      margin-top: var(--space-2);
    }
    .choices {
      display: grid;
      gap: var(--space-2);
    }
    .choices.two {
      grid-template-columns: 1fr 1fr;
    }
    .choice {
      display: grid;
      gap: 2px;
      padding: 14px 16px;
      border-radius: var(--radius-m);
      background: var(--surface);
      border: 1.5px solid var(--line);
      text-align: left;
      transition: border-color var(--dur-2), background-color var(--dur-2), transform var(--dur-1) var(--ease-out);
    }
    .choice:active {
      transform: scale(0.98);
    }
    .choice[aria-checked='true'] {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .row-choice {
      grid-template-columns: auto 1fr;
      align-items: baseline;
      gap: 10px;
    }
    .row-choice .small {
      text-align: right;
    }
    .fix-start {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 14px 16px;
      border-radius: var(--radius-m);
      background: var(--surface);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .fix-body {
      display: grid;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .fix-title {
      font-weight: 650;
    }
  `,
})
export class GoalPage {
  private readonly tracking = inject(TrackingStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);

  protected readonly summary = this.tracking.summary;
  protected readonly goal = signal(70);
  protected readonly start = signal(80);
  protected readonly height = signal(170);
  protected readonly pace = signal<number>(0.5);
  protected readonly job = signal<Job>('SEATED');
  protected readonly sessions = signal(2);
  protected readonly busy = signal(false);
  private readonly loaded = computed(() => this.summary()?.profile ?? null);
  /** 1.16: the weigh-in of the start day (the first point of the curve), when it has a weight */
  protected readonly startLog = computed(() => {
    const p = this.loaded();
    return p ? (this.tracking.logs()?.find((l) => l.day === p.startDate && l.weightKg != null) ?? null) : null;
  });
  protected readonly startLogDiffers = computed(() => {
    const kg = this.startLog()?.weightKg;
    return kg != null && Math.abs(kg - this.start()) >= 0.05;
  });
  /** put right with the start, at first when both said the same (the same typo); already apart, kept unless asked */
  protected readonly fixStartLog = linkedSignal(() => {
    const kg = this.startLog()?.weightKg;
    const p = this.loaded();
    return kg != null && p != null && Math.abs(kg - p.startWeightKg) < 0.05;
  });

  constructor() {
    void this.tracking.ensure();
    void this.tracking.ensureLogs().catch(() => undefined);
    // fill the form once the profile is there
    effect(() => {
      const p = this.loaded();
      if (!p) return;
      this.goal.set(p.goalWeightKg);
      this.start.set(p.startWeightKg);
      this.height.set(p.heightCm);
      this.pace.set(p.weeklyRateKg);
      // a profile saved before 1.7 has a level only: the nearest answers, to check
      const a = p.job ? { job: p.job, sessions: p.sessionsPerWeek ?? 0 } : answersOf(p.activityLevel);
      this.job.set(a.job);
      this.sessions.set(a.sessions);
    });
  }


  protected async save(): Promise<void> {
    const s = this.summary();
    if (!s) return;
    this.busy.set(true);
    try {
      await this.tracking.saveProfile({
        sex: s.profile.sex,
        birthDate: s.profile.birthDate,
        heightCm: this.height(),
        job: this.job(),
        sessionsPerWeek: this.sessions(),
        currentWeightKg: s.current.weightKg ?? s.profile.startWeightKg,
        goalWeightKg: this.goal(),
        weeklyRateKg: this.pace(),
        startWeightKg: Math.round(this.start() * 10) / 10,
        startLogToo: this.startLogDiffers() && this.fixStartLog(),
      });
      this.toast.show(this.i18n.t('goal.saved'));
      this.stack.back('/app/account');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
