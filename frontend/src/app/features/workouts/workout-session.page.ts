import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import { EngageApi } from '../../core/engage/engage-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { Exercise, PROGRAMS, program, workout } from './programs';

/** A workout in progress: tick the sets, rest between them, note the loads, finish. */
@Component({
  selector: 'app-workout-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <div class="head-copy">
          <h1 class="title small-title">{{ title() }}</h1>
          <span class="small muted num">{{ 'engage.workouts.elapsed' | t }} {{ clock() }} · {{ 'engage.workouts.doneCount' | t: { done: doneSets(), total: totalSets() } }}</span>
        </div>
      </header>

      <div class="progress" aria-hidden="true"><i [style.width.%]="totalSets() ? (doneSets() / totalSets()) * 100 : 0"></i></div>

      @for (e of exercises(); track e.id; let i = $index) {
        <section class="card ex" [class.complete]="done()[i] === e.sets" [style.--i]="i">
          <div class="ex-head">
            <h2 class="ex-name">{{ e.name[lang()] }}</h2>
            <span class="small muted num">
              {{ e.seconds ? ('engage.workouts.secondsOf' | t: { sets: e.sets, s: e.seconds }) : ('engage.workouts.repsOf' | t: { sets: e.sets, reps: e.reps ?? 0 }) }}
              @if (e.perSide) {
                · {{ 'engage.workouts.perSide' | t }}
              }
            </span>
          </div>
          <div class="sets" role="group" [attr.aria-label]="e.name[lang()]">
            @for (s of setsOf(e); track s) {
              <button type="button" class="set" [class.on]="s < done()[i]" [attr.aria-pressed]="s < done()[i]"
                [attr.aria-label]="(s < done()[i] ? 'engage.workouts.setDone' : 'engage.workouts.setTodo') | t: { n: s + 1 }" (click)="tap(i, s, e)">
                @if (s < done()[i]) {
                  <app-icon name="check" [size]="18" [stroke]="3" />
                } @else {
                  {{ s + 1 }}
                }
              </button>
            }
          </div>
          @if (e.weighted) {
            <div class="weight">
              <label class="small" [for]="'w-' + e.id">{{ 'engage.workouts.weight' | t }}</label>
              <input class="input" [id]="'w-' + e.id" type="text" inputmode="decimal" [ngModel]="weights()[i] ?? ''" (ngModelChange)="setWeight(i, $event)" />
            </div>
          }
        </section>
      }

      <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || doneSets() === 0" (click)="finish()">
        <app-icon name="check" /> {{ 'engage.workouts.finish' | t }}
      </button>

      @if (rest() > 0) {
        <div class="rest" role="timer" aria-live="polite">
          <span class="rest-label">{{ 'engage.workouts.rest' | t }}</span>
          <span class="rest-time num">{{ rest() }} s</span>
          <button type="button" class="btn btn-secondary btn-s" (click)="rest.set(0)">{{ 'engage.workouts.restSkip' | t }}</button>
        </div>
      }
    </main>
  `,
  styles: `
    .head-copy {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .progress {
      height: 6px;
      border-radius: 3px;
      background: var(--surface-3);
      overflow: hidden;
      margin-top: calc(-1 * var(--space-2));
    }
    .progress i {
      display: block;
      height: 100%;
      background: var(--flame);
      transition: width 500ms var(--ease-out);
    }
    .ex {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      transition: border-color var(--dur-3), opacity var(--dur-3);
      animation: ex-in 380ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 50ms);
    }
    @keyframes ex-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
    }
    .ex.complete {
      border-color: color-mix(in srgb, var(--success) 50%, transparent);
    }
    .ex-head {
      display: grid;
      gap: 2px;
    }
    .ex-name {
      font-size: 1.05rem;
      font-weight: 750;
    }
    .sets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .set {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 16px;
      background: var(--surface-3);
      color: var(--fg-2);
      font-weight: 800;
      transition: background-color var(--dur-2), color var(--dur-2), transform var(--dur-2) var(--ease-out);
    }
    .set:active {
      transform: scale(0.9);
    }
    .set.on {
      background: var(--success);
      color: #fff;
      animation: pop 320ms var(--ease-out);
    }
    @keyframes pop {
      50% {
        transform: scale(1.15);
      }
    }
    .weight {
      display: grid;
      grid-template-columns: auto 110px;
      align-items: center;
      justify-content: start;
      gap: var(--space-3);
      color: var(--fg-2);
      font-weight: 600;
    }
    .weight .input {
      min-height: 40px;
      padding-block: 6px;
    }
    .rest {
      position: fixed;
      left: 50%;
      bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 12px);
      z-index: 40;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 10px 10px 10px 18px;
      transform: translateX(-50%);
      border-radius: var(--radius-pill);
      background: var(--fg);
      color: var(--bg);
      box-shadow: var(--shadow-3);
      animation: rest-in 260ms var(--ease-out);
    }
    @keyframes rest-in {
      from {
        transform: translate(-50%, 20px);
        opacity: 0;
      }
    }
    .rest-label {
      font-weight: 650;
    }
    .rest-time {
      min-width: 4ch;
      font-weight: 850;
      font-size: 1.2rem;
    }
  `,
})
export class WorkoutSessionPage {
  readonly programId = input<string | undefined>(undefined, { alias: 'program' });
  readonly workoutId = input<string | undefined>(undefined, { alias: 'workout' });
  private readonly api = inject(EngageApi);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);

  protected readonly lang = computed(() => this.i18n.lang());
  private readonly prog = computed(() => program(this.programId()) ?? PROGRAMS[0]);
  private readonly wk = computed(() => workout(this.prog().id, this.workoutId() ?? '') ?? this.prog().workouts[0]);
  protected readonly exercises = computed(() => this.wk().exercises);
  protected readonly title = computed(() => `${this.wk().name[this.lang()]} · ${this.prog().name[this.lang()]}`);
  protected readonly done = signal<number[]>([]);
  protected readonly weights = signal<(number | null)[]>([]);
  protected readonly rest = signal(0);
  protected readonly busy = signal(false);
  private readonly started = Date.now();
  protected readonly now = signal(Date.now());
  protected readonly clock = computed(() => {
    const s = Math.floor((this.now() - this.started) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  protected readonly doneSets = computed(() => this.done().reduce((a, b) => a + b, 0));
  protected readonly totalSets = computed(() => this.exercises().reduce((a, e) => a + e.sets, 0));

  constructor() {
    effect(() => {
      const n = this.exercises().length;
      this.done.set(Array(n).fill(0));
      this.weights.set(Array(n).fill(null));
    });
    const tick = setInterval(() => {
      this.now.set(Date.now());
      if (this.rest() > 0) this.rest.update((r) => r - 1);
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  protected setsOf(e: Exercise): number[] {
    return Array.from({ length: e.sets }, (_, i) => i);
  }

  /** a tap on set n marks sets 1..n done (or takes the last one back), then the rest starts */
  protected tap(i: number, s: number, e: Exercise): void {
    const current = this.done()[i];
    const next = s < current ? s : s + 1;
    this.done.update((d) => d.map((v, j) => (j === i ? next : v)));
    if (next > current) {
      navigator.vibrate?.(15);
      this.rest.set(e.rest);
    }
  }

  protected setWeight(i: number, value: string): void {
    const n = Number(String(value).replace(',', '.'));
    this.weights.update((w) => w.map((v, j) => (j === i ? (value === '' || !Number.isFinite(n) ? null : n) : v)));
  }

  protected async finish(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.saveWorkout({
        day: localDay(),
        program: this.prog().id,
        workout: this.wk().id,
        durationMin: Math.max(1, Math.round((Date.now() - this.started) / 60000)),
        exercises: this.exercises().map((e, i) => ({ id: e.id, sets: this.done()[i], weightKg: this.weights()[i] })),
      });
      this.toast.show(this.i18n.t('engage.workouts.finished'));
      this.stack.back('/app/workouts');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
