import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import { EngageApi, WorkoutSession } from '../../core/engage/engage-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { PROGRAMS, Program, Workout, program, workout } from './programs';

const PROGRAM_KEY = 'mb.program';

/** the workout after the last one done in this programme */
export function nextWorkout(p: Program, sessions: WorkoutSession[]): Workout {
  const last = sessions.find((s) => s.program === p.id);
  const i = last ? p.workouts.findIndex((w) => w.id === last.workout) : -1;
  return p.workouts[(i + 1) % p.workouts.length];
}

export function chosenProgram(sessions: WorkoutSession[]): Program {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(PROGRAM_KEY);
  } catch {
    /* storage blocked */
  }
  return program(saved) ?? program(sessions[0]?.program) ?? PROGRAMS[0];
}

/** Gym and workouts: the programme in use, its next workout, the other programmes and the history. */
@Component({
  selector: 'app-workouts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'engage.workouts.title' | t }}</h1>
      </header>

      @if (sessions(); as list) {
        @let p = current();
        @let next = nextOf(p, list);
        <section class="hero card">
          <span class="emoji" aria-hidden="true">{{ p.emoji }}</span>
          <div class="hero-copy">
            <p class="eyebrow">{{ 'engage.workouts.chosen' | t }}</p>
            <h2 class="h3">{{ p.name[lang()] }}</h2>
            <p class="small muted">{{ 'engage.workouts.next' | t: { name: next.name[lang()] } }}</p>
          </div>
          <a class="btn btn-primary btn-block" routerLink="/app/workouts/session" [queryParams]="{ program: p.id, workout: next.id }">
            <app-icon name="play" [size]="18" /> {{ 'engage.workouts.start' | t }} · {{ next.name[lang()] }}
          </a>
        </section>

        <h2 class="section-title">{{ 'engage.workouts.programs' | t }}</h2>
        <div class="programs">
          @for (prog of programs; track prog.id) {
            <button type="button" class="program" [class.on]="prog.id === p.id" [attr.aria-pressed]="prog.id === p.id" (click)="choose(prog)">
              <span class="emoji small-emoji" aria-hidden="true">{{ prog.emoji }}</span>
              <span class="program-copy">
                <span class="program-name">{{ prog.name[lang()] }}</span>
                <span class="small muted">{{ prog.text[lang()] }}</span>
                <span class="tiny chip">{{ 'engage.workouts.perWeek' | t: { n: prog.perWeek } }}</span>
              </span>
            </button>
          }
        </div>

        <h2 class="section-title">{{ 'engage.workouts.history' | t }}</h2>
        @if (list.length) {
          <div class="list">
            @for (s of list; track s.id) {
              <button type="button" class="list-item" (click)="ask(s)">
                <span class="list-icon"><app-icon name="dumbbell" /></span>
                <span class="list-body">
                  <span class="list-title">{{ label(s) }}</span>
                  <span class="list-sub">
                    {{ i18n.date(s.day, { weekday: 'short', day: 'numeric', month: 'short' }) }}
                    @if (s.durationMin) {
                      · {{ 'engage.workouts.minutes' | t: { n: s.durationMin } }}
                    }
                    · {{ 'engage.workouts.sets' | t: { n: totalSets(s) } }}
                  </span>
                </span>
              </button>
            }
          </div>
        } @else {
          <p class="small muted">{{ 'engage.workouts.none' | t }}</p>
        }
      } @else {
        <div class="skeleton" style="height: 180px; border-radius: 24px"></div>
      }

      <dialog class="sheet" #confirm>
        <div class="sheet-grip"></div>
        @if (selected(); as s) {
          <div class="stack">
            <p><b>{{ label(s) }}</b> · {{ i18n.date(s.day, { day: 'numeric', month: 'long' }) }}</p>
            <button type="button" class="btn btn-danger btn-block" (click)="remove(s)"><app-icon name="trash" /> {{ 'engage.workouts.delete' | t }}</button>
            <button type="button" class="btn btn-ghost btn-block" (click)="confirm.close()">{{ 'common.cancel' | t }}</button>
          </div>
        }
      </dialog>
    </main>
  `,
  styles: `
    .hero {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-3) var(--space-4);
      align-items: center;
      padding: var(--space-5);
    }
    .hero .btn {
      grid-column: 1 / -1;
    }
    .emoji {
      display: grid;
      place-items: center;
      width: 60px;
      height: 60px;
      border-radius: 20px;
      background: var(--accent-soft);
      font-size: 2rem;
    }
    .small-emoji {
      width: 46px;
      height: 46px;
      border-radius: 15px;
      font-size: 1.5rem;
      flex: none;
    }
    .programs {
      display: grid;
      gap: var(--space-3);
    }
    .program {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--surface);
      border: 1.5px solid var(--line);
      text-align: left;
      transition: border-color var(--dur-2), transform var(--dur-2) var(--ease-out);
    }
    .program:active {
      transform: scale(0.98);
    }
    .program.on {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .program-copy {
      display: grid;
      gap: 4px;
      justify-items: start;
    }
    .program-name {
      font-weight: 750;
    }
  `,
})
export class WorkoutsPage {
  private readonly api = inject(EngageApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('confirm');

  protected readonly programs = PROGRAMS;
  protected readonly sessions = signal<WorkoutSession[] | null>(null);
  protected readonly picked = signal<Program | null>(null);
  protected readonly selected = signal<WorkoutSession | null>(null);
  protected readonly lang = computed(() => this.i18n.lang());
  protected readonly current = computed(() => this.picked() ?? chosenProgram(this.sessions() ?? []));

  constructor() {
    void this.api
      .workouts()
      .then((s) => this.sessions.set(s))
      .catch(() => this.sessions.set([]));
  }

  protected nextOf(p: Program, list: WorkoutSession[]): Workout {
    return nextWorkout(p, list);
  }

  protected choose(p: Program): void {
    this.picked.set(p);
    try {
      localStorage.setItem(PROGRAM_KEY, p.id);
    } catch {
      /* this visit only */
    }
  }

  protected label(s: WorkoutSession): string {
    const p = program(s.program);
    const w = workout(s.program, s.workout);
    return p && w ? `${p.name[this.lang()]} · ${w.name[this.lang()]}` : `${s.program} · ${s.workout}`;
  }

  protected totalSets(s: WorkoutSession): number {
    return s.exercises.reduce((n, e) => n + e.sets, 0);
  }

  protected ask(s: WorkoutSession): void {
    this.selected.set(s);
    this.confirmDialog().nativeElement.showModal();
  }

  protected async remove(s: WorkoutSession): Promise<void> {
    try {
      await this.api.deleteWorkout(s.id);
      this.sessions.update((l) => (l ?? []).filter((x) => x.id !== s.id));
      this.confirmDialog().nativeElement.close();
      this.toast.show(this.i18n.t('engage.workouts.deleted'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
