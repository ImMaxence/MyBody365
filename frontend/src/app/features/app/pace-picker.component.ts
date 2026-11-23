import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';

const PACES = [0.25, 0.5, 0.75, 1] as const;
const DAY = 86_400_000;

/**
 * The fastest pace allowed: 1 % of the body weight a week, 1 kg at most, 0.25 kg at least, by steps of
 * 0.05 kg (the same rule as the server, BodyMath.maxWeeklyRate). 60 kg → 0.6, 100 kg and more → 1.
 */
export function maxPace(weightKg: number): number {
  const steps = Math.floor((weightKg * 0.01) / 0.05 + 1e-9);
  return Math.round(Math.max(0.25, Math.min(1, steps * 0.05)) * 100) / 100;
}

/** what a wished date asks for: on time, sooner (the slowest pace already gets there), or later (too fast) */
export interface Wish {
  pace: number;
  kind: 'ok' | 'sooner' | 'tooFast';
  /** the arrival date at that pace */
  date: string;
}

export function paceForDate(kgToGo: number, wish: string, weightKg: number, today = localDay()): Wish | null {
  const days = Math.round((Date.parse(wish + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / DAY);
  if (!(kgToGo > 0) || days < 7) return null;
  const needed = (kgToGo / days) * 7;
  const max = maxPace(weightKg);
  // by steps of 0.05 kg, rounded up: never later than the wished date when it is possible
  const pace = Math.min(max, Math.max(0.25, Math.ceil(needed / 0.05 - 1e-9) * 0.05));
  const rounded = Math.round(pace * 100) / 100;
  const arrive = new Date(today + 'T12:00:00');
  arrive.setDate(arrive.getDate() + Math.ceil((kgToGo / rounded) * 7));
  return { pace: rounded, kind: needed > max + 1e-9 ? 'tooFast' : needed < 0.25 ? 'sooner' : 'ok', date: localDay(arrive) };
}

/**
 * The pace towards the goal: four set paces, the fast ones locked above 1 % of the body weight a week,
 * or a wished date that gives the pace (and says so when it would be too fast to be safe).
 */
@Component({
  selector: 'app-pace-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <span class="label">{{ 'setup.pace' | t }}</span>
    <div class="choices two" role="radiogroup" [attr.aria-label]="'setup.pace' | t">
      @for (p of paces; track p) {
        <button type="button" role="radio" class="choice" [attr.aria-checked]="mode() === 'pace' && pace() === p" [disabled]="p > max()" (click)="choose(p)">
          <strong>{{ 'setup.paces.' + paceKey(p) + '.label' | t }}</strong>
          <span class="small muted">{{ p > max() ? ('setup.paceLocked' | t) : ('setup.paces.' + paceKey(p) + '.hint' | t) }}</span>
        </button>
      }
    </div>
    @if (mode() === 'pace' && !standard()) {
      <p class="hint small custom">{{ 'setup.paceCustom' | t: { kg: i18n.number(pace(), 2) } }}</p>
    }
    <p class="hint small muted">{{ 'setup.paceRule' | t: { kg: i18n.number(max(), 2) } }}</p>

    <button type="button" class="choice date-choice" role="radio" [attr.aria-checked]="mode() === 'date'" (click)="mode.set('date')">
      <app-icon name="calendar" [size]="18" />
      <span>
        <strong>{{ 'setup.dateChoice' | t }}</strong>
        <span class="small muted">{{ 'setup.dateChoiceHint' | t }}</span>
      </span>
    </button>
    @if (mode() === 'date') {
      <div class="field date-field">
        <label class="label" [for]="id">{{ 'setup.dateWish' | t }}</label>
        <span class="input-icon">
          <input class="input" [id]="id" type="date" [min]="minDate" [value]="wish()" (change)="setWish($any($event.target).value)" />
          <span class="end"><app-icon name="calendar" [size]="19" /></span>
        </span>
      </div>
      @if (wished(); as w) {
        <p class="notice" [class.notice-accent]="w.kind === 'tooFast'">
          <app-icon [name]="w.kind === 'tooFast' ? 'alert' : 'check'" [size]="18" />
          {{ 'setup.dateResult.' + w.kind | t: { date: i18n.date(w.date, { day: 'numeric', month: 'long', year: 'numeric' }), kg: i18n.number(w.pace, 2) } }}
        </p>
      }
    }
    @if (pace() >= 0.75) {
      <p class="notice notice-accent"><app-icon name="alert" /> {{ 'setup.paceFast' | t }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
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
      transition: border-color var(--dur-2), background-color var(--dur-2), transform var(--dur-1) var(--ease-out), opacity var(--dur-2);
    }
    .choice.is-pressed {
      transform: scale(0.98);
    }
    .choice:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .choice[aria-checked='true'] {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .date-choice {
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 12px;
      margin-top: var(--space-1);
    }
    .date-choice > span {
      display: grid;
      gap: 2px;
    }
    .custom {
      font-weight: 650;
      color: var(--accent-text);
    }
    .date-field,
    .notice {
      animation: rise 300ms var(--ease-out) both;
    }
    .notice {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }
  `,
})
export class PacePickerComponent {
  /** today's weight and the goal, in kg */
  readonly weight = input.required<number>();
  readonly goal = input.required<number>();
  readonly pace = model.required<number>();

  protected readonly i18n = inject(I18nService);
  protected readonly paces = PACES;
  protected readonly id = `wish-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly mode = signal<'pace' | 'date'>('pace');
  protected readonly wish = signal('');
  protected readonly minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return localDay(d);
  })();
  protected readonly max = computed(() => maxPace(this.weight()));
  protected readonly wished = computed(() => {
    const w = this.wish();
    return w ? paceForDate(Math.abs(this.weight() - this.goal()), w, this.weight()) : null;
  });

  protected readonly standard = computed(() => (PACES as readonly number[]).includes(this.pace()));

  constructor() {
    // a pace saved before the 1 % rule, or a weight that went down: brought back within the rule
    effect(() => {
      if (this.pace() > this.max()) this.pace.set(this.max());
    });
  }

  protected paceKey(p: number): string {
    return 'p' + String(p).replace('.', '');
  }

  protected choose(p: number): void {
    this.mode.set('pace');
    this.pace.set(p);
  }

  protected setWish(value: string): void {
    this.wish.set(value);
    const w = this.wished();
    if (w) this.pace.set(w.pace);
  }

}
