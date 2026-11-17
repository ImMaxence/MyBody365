import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import type { Job } from '../../core/api/models';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { NumberStepperComponent } from '../../shared/number-stepper.component';

export const JOBS: Job[] = ['SEATED', 'STANDING', 'PHYSICAL'];

/**
 * The activity in two answers: the day without sport (the job), then the sessions of sport a week. Asked
 * apart, they are not mixed up any more (three sessions on top of an office day is a « light » activity,
 * not a « moderate » one), and the calorie target is not overestimated.
 */
@Component({
  selector: 'app-activity-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, NumberStepperComponent],
  host: { class: 'activity' },
  template: `
    <span class="label" id="act-job">{{ 'setup.job' | t }}</span>
    <div class="choices" role="radiogroup" aria-labelledby="act-job">
      @for (j of jobs; track j) {
        <button type="button" role="radio" class="choice" [attr.aria-checked]="job() === j" (click)="job.set(j)">
          <strong>{{ 'setup.jobs.' + j + '.label' | t }}</strong>
          <span class="small muted">{{ 'setup.jobs.' + j + '.hint' | t }}</span>
        </button>
      }
    </div>
    <span class="label">{{ 'setup.sessions' | t }}</span>
    <app-number-stepper [(value)]="sessions" [step]="1" [min]="0" [max]="14" [decimals]="0" [compact]="true" [label]="'setup.sessions' | t"
      [minusLabel]="'setup.sessionsLess' | t" [plusLabel]="'setup.sessionsMore' | t" />
    <p class="hint">{{ 'setup.sessionsHint' | t }}</p>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
    }
    .label {
      margin-top: var(--space-2);
    }
    .choices {
      display: grid;
      gap: var(--space-2);
    }
    .choice {
      display: grid;
      gap: 2px;
      padding: 12px 16px;
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
    .hint {
      margin: 0;
      font-size: var(--fs-s);
      color: var(--fg-2);
    }
  `,
})
export class ActivityPickerComponent {
  protected readonly jobs = JOBS;
  readonly job = model<Job>('SEATED');
  readonly sessions = model(2);
}

/** the answers of a profile saved before 1.7 (a level only): the nearest ones, to start from */
export function answersOf(level: string): { job: Job; sessions: number } {
  switch (level) {
    case 'SEDENTARY':
      return { job: 'SEATED', sessions: 0 };
    case 'LIGHT':
      return { job: 'SEATED', sessions: 2 };
    case 'MODERATE':
      return { job: 'SEATED', sessions: 4 };
    case 'ACTIVE':
      return { job: 'STANDING', sessions: 5 };
    default:
      return { job: 'PHYSICAL', sessions: 5 };
  }
}
