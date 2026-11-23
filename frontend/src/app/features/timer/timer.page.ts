import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PushSetup } from '../../core/engage/push-setup.service';
import { TimerRun, TimerSettings } from '../../core/engage/timer-run';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import { EngageApi, SavedTimer } from '../../core/engage/engage-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { HapticDirective } from '../../core/ui/haptics';
import { IconComponent } from '../../shared/icon.component';

type Settings = TimerSettings;

interface Preset extends Settings {
  key: string;
}

const STORE = 'mb-timer';
/** what "Personnalisé" starts from: a timer of one's own, none of the presets */
const CUSTOM: Settings = { work: 30, rest: 15, rounds: 5 };
const PRESETS: Preset[] = [
  { key: 'tabata', work: 20, rest: 10, rounds: 8 },
  { key: 'plank', work: 45, rest: 15, rounds: 4 },
  { key: 'intervals', work: 60, rest: 60, rounds: 6 },
  { key: 'rest', work: 90, rest: 0, rounds: 1 },
  { key: 'run', work: 300, rest: 0, rounds: 1 },
];

/** "1:05", "0:20" */
function clock(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

function same(a: Settings, b: Settings): boolean {
  return a.work === b.work && a.rest === b.rest && a.rounds === b.rounds;
}

/**
 * A timer for a workout, nothing more: effort, rest and rounds (one's own, a preset, or a timer saved
 * under a name), a 5-second "ready", beeps on the last three seconds and at each change, a vibration,
 * the screen kept awake. The run itself is TimerRun's: it goes on on the other screens, on a locked
 * screen and behind other apps (notifications then). The ring follows the clock frame by frame.
 */
@Component({
  selector: 'app-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslatePipe, IconComponent, BackButtonComponent, HapticDirective],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'engage.timer.title' | t }}</h1>
      </header>

      @if (state() === 'idle') {
        <section class="setup">
          <div class="slide-chips" role="group" [attr.aria-label]="'engage.timer.presets' | t">
            <button type="button" [attr.aria-pressed]="mode() === 'custom'" (click)="useCustom()">{{ 'engage.timer.custom' | t }}</button>
            @for (p of presets; track p.key) {
              <button type="button" [attr.aria-pressed]="mode() === p.key" (click)="apply(p)">{{ 'engage.timer.presetNames.' + p.key | t }}</button>
            }
            @for (s of saved(); track s.id) {
              <button type="button" class="mine" [attr.aria-pressed]="mode() === s.id" (click)="apply(s)"><app-icon name="bookmark" [size]="14" /> {{ s.name }}</button>
            }
          </div>

          <div class="card rows">
            @for (f of fields; track f.key) {
              <div class="row">
                <span class="row-label"><app-icon [name]="f.icon" [size]="18" /> {{ 'engage.timer.' + f.key | t }}</span>
                <div class="stepper">
                  <span class="haptic"><button type="button" class="step" [disabled]="value(f.key) <= f.min" [attr.aria-label]="'engage.timer.less' | t: { what: ('engage.timer.' + f.key | t) }" (click)="change(f.key, -1)">
                    <app-icon name="minus" [size]="18" [stroke]="2.4" />
                  </button><input appHaptic="soft" /></span>
                  <span class="val-wrap" aria-live="polite">
                    @for (v of [value(f.key)]; track v) {
                      <!-- a tap to type the value, the buttons around for small steps -->
                      <button type="button" class="val num" [attr.aria-label]="'engage.timer.editValue' | t: { what: ('engage.timer.' + f.key | t), value: shownValue(f.key) }" (click)="edit(f.key)">
                        {{ shownValue(f.key) }}
                      </button>
                    }
                  </span>
                  <span class="haptic"><button type="button" class="step" [disabled]="value(f.key) >= f.max" [attr.aria-label]="'engage.timer.more' | t: { what: ('engage.timer.' + f.key | t) }" (click)="change(f.key, 1)">
                    <app-icon name="plus" [size]="18" [stroke]="2.4" />
                  </button><input appHaptic="soft" /></span>
                </div>
              </div>
            }
          </div>
          <p class="total small muted num">{{ 'engage.timer.total' | t: { time: clockOf(totalSeconds()) } }}</p>
          <p class="disclaimer tiny muted">{{ 'engage.timer.disclaimer' | t }}</p>
          <span class="haptic block"><button type="button" class="btn btn-primary btn-block go" (click)="start()"><app-icon name="play" /> {{ 'engage.timer.start' | t }}</button><input appHaptic="success" /></span>
          <div class="keep">
            @if (selectedSaved(); as s) {
              <button type="button" class="btn btn-ghost btn-s danger" (click)="remove(s)"><app-icon name="trash" [size]="16" /> {{ 'engage.timer.delete' | t: { name: s.name } }}</button>
            } @else {
              <button type="button" class="btn btn-ghost btn-s" (click)="openSave()"><app-icon name="bookmark" [size]="16" /> {{ 'engage.timer.save' | t }}</button>
            }
          </div>

        </section>
      } @else {
        <section class="run" [attr.data-phase]="state() === 'done' ? 'done' : phase()">
          <div class="dial" role="timer" [attr.aria-label]="phaseLabel() + ', ' + clockOf(shown())">
            @for (p of [index()]; track p) {
              <span class="burst" aria-hidden="true"></span>
            }
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="88" class="track" />
              <circle #arc cx="100" cy="100" r="88" class="arc" pathLength="1" />
            </svg>
            <div class="dial-text">
              @for (p of [phase() + index()]; track p) {
                <span class="phase">{{ state() === 'done' ? ('engage.timer.done' | t) : phaseLabel() }}</span>
              }
              @for (s of [shown()]; track s) {
                <span class="time num">{{ clockOf(s) }}</span>
              }
              @if (state() !== 'done' && phase() !== 'prep') {
                <span class="round small">{{ 'engage.timer.round' | t: { n: round(), total: run.settings().rounds } }}</span>
              }
            </div>
          </div>
          <p class="sr-only" aria-live="assertive">{{ announce() }}</p>
          @if (state() !== 'done') {
            <p class="left small muted num">{{ 'engage.timer.left' | t: { time: clockOf(totalLeft()) } }}</p>
            <!-- it goes on elsewhere: on the other screens, on a locked screen, behind another app -->
            <p class="away tiny muted">
              @if (pushOn()) {
                {{ 'engage.timer.awayOn' | t }}
              } @else {
                {{ 'engage.timer.awayOff' | t }} <a routerLink="/app/account/notifications">{{ 'engage.timer.awayEnable' | t }}</a>
              }
            </p>
            <div class="controls">
              <span class="haptic"><button type="button" class="ctl" [attr.aria-label]="'engage.timer.stop' | t" (click)="stop()"><app-icon name="x" [size]="22" /></button><input appHaptic /></span>
              <span class="haptic"><button type="button" class="ctl main" [attr.aria-label]="(state() === 'paused' ? 'engage.timer.resume' : 'engage.timer.pause') | t" (click)="toggle()">
                <app-icon [name]="state() === 'paused' ? 'play' : 'pause'" [size]="30" />
              </button><input appHaptic /></span>
              <span class="haptic"><button type="button" class="ctl" [attr.aria-label]="'engage.timer.skip' | t" (click)="next()"><app-icon name="chevronRight" [size]="24" /></button><input appHaptic /></span>
            </div>
          } @else {
            <div class="controls done">
              <button type="button" class="btn btn-primary" (click)="again()"><app-icon name="repeat" /> {{ 'engage.timer.again' | t }}</button>
              <button type="button" class="btn btn-ghost" (click)="stop()">{{ 'engage.timer.close' | t }}</button>
            </div>
          }
        </section>
      }

      <dialog class="sheet" #valueDialog [attr.aria-label]="'engage.timer.' + editing() | t">
        <div class="sheet-grip"></div>
        <form class="stack" (ngSubmit)="applyEdit()">
          <h2 class="h3">{{ 'engage.timer.' + editing() | t }}</h2>
          @if (editing() === 'rounds') {
            <div class="field">
              <label class="label" for="t-rounds">{{ 'engage.timer.rounds' | t }}</label>
              <input class="input num" id="t-rounds" name="rounds" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" [(ngModel)]="editRounds" />
            </div>
          } @else {
            <div class="mmss">
              <div class="field">
                <label class="label" for="t-min">{{ 'engage.timer.minutes' | t }}</label>
                <input class="input num" id="t-min" name="min" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" [(ngModel)]="editMin" />
              </div>
              <span class="colon" aria-hidden="true">:</span>
              <div class="field">
                <label class="label" for="t-sec">{{ 'engage.timer.seconds' | t }}</label>
                <input class="input num" id="t-sec" name="sec" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" [(ngModel)]="editSec" />
              </div>
            </div>
          }
          <p class="tiny muted">{{ 'engage.timer.range' | t: { min: rangeOf('min'), max: rangeOf('max') } }}</p>
          <button type="submit" class="btn btn-primary btn-block"><app-icon name="check" /> {{ 'engage.timer.apply' | t }}</button>
        </form>
      </dialog>

      <dialog class="sheet" #saveDialog [attr.aria-label]="'engage.timer.save' | t">
        <div class="sheet-grip"></div>
        <form class="stack" (ngSubmit)="save()">
          <h2 class="h3">{{ 'engage.timer.save' | t }}</h2>
          <p class="small muted num">{{ summary() }}</p>
          <div class="field">
            <label class="label" for="t-name">{{ 'engage.timer.name' | t }}</label>
            <input class="input" id="t-name" name="name" maxlength="30" autocomplete="off" [placeholder]="'engage.timer.namePlaceholder' | t" [(ngModel)]="name" />
            <span class="tiny muted count">{{ name.length }} / 30</span>
          </div>
          <button type="submit" class="btn btn-primary btn-block" [disabled]="!name.trim() || busy()"><app-icon name="check" /> {{ 'common.save' | t }}</button>
        </form>
      </dialog>
    </main>
  `,
  styles: `
    .away {
      margin: 0;
      max-width: 34ch;
      text-align: center;
      justify-self: center;
    }
    .away a {
      color: var(--accent-text);
      font-weight: 700;
    }
    .setup {
      display: grid;
      gap: var(--space-4);
      animation: rise 360ms var(--ease-out) both;
    }
    .mine {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .rows {
      display: grid;
      padding: var(--space-2) var(--space-4);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      min-height: 68px;
    }
    .row + .row {
      border-top: 1px solid var(--line);
    }
    .row-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 650;
    }
    .row-label app-icon {
      color: var(--accent-text);
    }
    .stepper {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .step {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--surface-3);
      transition: transform var(--dur-1) var(--ease-out);
    }
    .step.is-pressed {
      transform: scale(0.9);
    }
    .step:disabled {
      opacity: 0.35;
    }
    .val-wrap {
      display: grid;
    }
    .val {
      min-width: 74px;
      min-height: 44px;
      padding: 0 6px;
      border: 0;
      border-radius: 12px;
      background: none;
      color: inherit;
      font: inherit;
      text-align: center;
      font-size: 1.3rem;
      font-weight: 750;
      text-decoration: underline dotted color-mix(in srgb, currentColor 35%, transparent);
      text-underline-offset: 5px;
      cursor: pointer;
      animation: bump 220ms var(--ease-out);
    }
    .val.is-pressed {
      background: var(--surface-2);
    }
    .disclaimer {
      margin: calc(var(--space-2) * -1) 0 0;
      text-align: center;
      text-wrap: pretty;
    }
    .mmss {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: end;
      gap: var(--space-2);
    }
    .mmss .input {
      text-align: center;
      font-size: 1.4rem;
      font-weight: 700;
    }
    .colon {
      padding-bottom: 12px;
      font-size: 1.4rem;
      font-weight: 700;
    }
    @keyframes bump {
      from {
        transform: scale(0.88);
        opacity: 0.5;
      }
    }
    .total {
      text-align: center;
    }
    .go {
      min-height: 56px;
      font-size: 1.05rem;
    }
    .keep {
      display: flex;
      justify-content: center;
    }
    .danger {
      color: var(--danger);
    }
    .count {
      justify-self: end;
    }
    /* ── running ── */
    .run {
      --phase: var(--fg-3);
      display: grid;
      justify-items: center;
      gap: var(--space-4);
      padding-top: var(--space-4);
      animation: rise 360ms var(--ease-out) both;
    }
    .run[data-phase='work'] {
      --phase: var(--accent);
    }
    .run[data-phase='rest'] {
      --phase: var(--cool);
    }
    .run[data-phase='done'] {
      --phase: var(--success);
    }
    .dial {
      position: relative;
      width: min(78vw, 320px);
      aspect-ratio: 1;
      border-radius: 50%;
      background: radial-gradient(circle, color-mix(in srgb, var(--phase) 12%, transparent) 0 58%, transparent 70%);
      transition: background 500ms var(--ease-out);
    }
    .dial svg {
      position: relative;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .track {
      fill: none;
      stroke: var(--surface-3);
      stroke-width: 10;
    }
    .arc {
      fill: none;
      stroke: var(--phase);
      stroke-width: 10;
      stroke-linecap: round;
      stroke-dasharray: 1;
      transition: stroke 450ms var(--ease-out);
      filter: drop-shadow(0 0 6px color-mix(in srgb, var(--phase) 45%, transparent));
    }
    /* each change of phase: a ring of light that widens */
    .burst {
      position: absolute;
      inset: 6%;
      border-radius: 50%;
      border: 3px solid var(--phase);
      opacity: 0;
      animation: burst 700ms var(--ease-out);
      pointer-events: none;
    }
    @keyframes burst {
      from {
        opacity: 0.6;
        transform: scale(0.9);
      }
      to {
        opacity: 0;
        transform: scale(1.12);
      }
    }
    .dial-text {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 4px;
      text-align: center;
    }
    .phase {
      font-weight: 750;
      font-size: 1.05rem;
      color: var(--phase);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      animation: phase-in 380ms var(--ease-out) both;
    }
    @keyframes phase-in {
      from {
        opacity: 0;
        transform: translateY(8px);
        letter-spacing: 0.3em;
      }
    }
    .time {
      font-size: clamp(3.4rem, 18vw, 4.6rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      animation: tick 300ms var(--ease-out);
    }
    @keyframes tick {
      from {
        opacity: 0.55;
        transform: translateY(-4px);
      }
    }
    .round {
      color: var(--fg-2);
      font-weight: 650;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: var(--space-6);
    }
    .controls.done {
      flex-wrap: wrap;
      gap: var(--space-3);
    }
    .ctl {
      display: grid;
      place-items: center;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--surface-3);
      transition: transform var(--dur-1) var(--ease-out), background-color 450ms;
    }
    .ctl.main {
      width: 84px;
      height: 84px;
      background: var(--phase);
      color: #fff;
      box-shadow: 0 16px 34px -14px var(--phase);
    }
    .ctl.is-pressed {
      transform: scale(0.9);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .setup,
      .run,
      .phase,
      .val,
      .time,
      .burst {
        animation: none;
      }
    }
  `,
})
export class TimerPage {
  protected readonly i18n = inject(I18nService);
  protected readonly run = inject(TimerRun);
  private readonly pushSetup = inject(PushSetup);
  protected readonly pushOn = this.pushSetup.enabled;
  private readonly api = inject(EngageApi);
  private readonly toast = inject(ToastService);
  private readonly doc = inject(DOCUMENT);
  private readonly arc = viewChild<ElementRef<SVGCircleElement>>('arc');
  private readonly saveDialog = viewChild.required<ElementRef<HTMLDialogElement>>('saveDialog');
  private readonly valueDialog = viewChild.required<ElementRef<HTMLDialogElement>>('valueDialog');
  /** the value typed in the sheet: which one, and its fields */
  protected readonly editing = signal<keyof Settings>('work');
  protected editMin = '';
  protected editSec = '';
  protected editRounds = '';
  protected readonly presets = PRESETS;
  protected readonly fields: { key: keyof Settings; icon: string; min: number; max: number }[] = [
    { key: 'work', icon: 'flame', min: 5, max: 3600 },
    { key: 'rest', icon: 'timer', min: 0, max: 600 },
    { key: 'rounds', icon: 'repeat', min: 1, max: 30 },
  ];

  protected readonly settings = signal<Settings>(this.load());
  protected readonly saved = signal<SavedTimer[]>([]);
  protected readonly state = this.run.state;
  protected readonly busy = signal(false);
  protected name = '';
  protected readonly index = this.run.index;
  /** the whole seconds shown (the ring itself moves every frame) */
  protected readonly shown = this.run.shown;
  protected readonly announce = this.run.announce;
  protected readonly phase = this.run.phase;
  protected readonly round = this.run.round;
  protected readonly totalLeft = this.run.totalLeft;
  private frame = 0;

  /** which chip is lit: a preset, a saved timer, or one's own settings */
  protected readonly mode = computed(() => {
    const s = this.settings();
    const saved = this.saved().find((x) => same(x, s));
    if (saved) return saved.id;
    return PRESETS.find((p) => same(p, s))?.key ?? 'custom';
  });
  protected readonly selectedSaved = computed(() => this.saved().find((x) => x.id === this.mode()) ?? null);
  protected readonly totalSeconds = computed(() => {
    const s = this.settings();
    return s.work * s.rounds + s.rest * (s.rounds - 1);
  });
  protected readonly phaseLabel = computed(() => this.i18n.t('engage.timer.' + this.phase()));
  protected readonly summary = computed(() => {
    const s = this.settings();
    return this.i18n.t('engage.timer.summary', { work: clock(s.work), rest: clock(s.rest), rounds: s.rounds });
  });

  constructor() {
    void this.api
      .timers()
      .then((t) => this.saved.set(t))
      .catch(() => undefined);
    // the ring, frame by frame, while there is a run on this screen
    effect(() => {
      if (this.run.state() !== 'idle') untracked(() => this.paint());
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private paint(): void {
    const win = this.doc.defaultView;
    if (!win || this.frame) return;
    const step = () => {
      this.draw(this.run.fraction());
      this.frame = this.run.state() === 'idle' ? 0 : win.requestAnimationFrame(step);
    };
    this.frame = win.requestAnimationFrame(step);
  }

  protected clockOf(s: number): string {
    return clock(s);
  }

  protected value(k: keyof Settings): number {
    return this.settings()[k];
  }

  /** "0:20", "Pas de repos", "8" */
  protected shownValue(k: keyof Settings): string {
    const v = this.value(k);
    return k === 'rounds' ? String(v) : k === 'rest' && v === 0 ? this.i18n.t('engage.timer.noRest') : clock(v);
  }

  /** the bounds of the value typed, as shown */
  protected rangeOf(end: 'min' | 'max'): string {
    const f = this.fields.find((x) => x.key === this.editing())!;
    return f.key === 'rounds' ? String(f[end]) : clock(f[end]);
  }

  /** a value typed rather than stepped to */
  protected edit(k: keyof Settings): void {
    const v = this.value(k);
    this.editing.set(k);
    this.editRounds = String(v);
    this.editMin = String(Math.floor(v / 60));
    this.editSec = String(v % 60).padStart(2, '0');
    this.valueDialog().nativeElement.showModal();
  }

  protected applyEdit(): void {
    const k = this.editing();
    const f = this.fields.find((x) => x.key === k)!;
    const n = (s: string) => Number.parseInt(s.replace(/\D/g, '') || '0', 10);
    const v = k === 'rounds' ? n(this.editRounds) : n(this.editMin) * 60 + n(this.editSec);
    const next = { ...this.settings(), [k]: Math.min(f.max, Math.max(f.min, v)) };
    this.settings.set(next);
    this.keep(next);
    closeSheet(this.valueDialog().nativeElement);
  }

  protected apply(p: Settings): void {
    this.settings.set({ work: p.work, rest: p.rest, rounds: p.rounds });
  }

  /** back to one's own settings (the last ones changed by hand) */
  protected useCustom(): void {
    this.settings.set(this.load());
  }

  /** 5 s steps under a minute, 15 s up to 5 minutes, 30 s beyond; rounds one by one */
  protected change(k: keyof Settings, dir: number): void {
    const s = this.settings();
    const f = this.fields.find((x) => x.key === k)!;
    let v = s[k];
    if (k === 'rounds') v += dir;
    else {
      const base = dir > 0 ? v : v - 1;
      const step = base < 60 ? 5 : base < 300 ? 15 : 30;
      v = Math.round((v + dir * step) / step) * step;
    }
    const next = { ...s, [k]: Math.min(f.max, Math.max(f.min, v)) };
    this.settings.set(next);
    this.keep(next);
  }

  protected openSave(): void {
    this.name = '';
    this.saveDialog().nativeElement.showModal();
  }

  protected async save(): Promise<void> {
    const name = this.name.trim().slice(0, 30);
    if (!name) return;
    this.busy.set(true);
    try {
      this.saved.set(await this.api.saveTimer({ name, ...this.settings() }));
      closeSheet(this.saveDialog().nativeElement);
      this.toast.show(this.i18n.t('engage.timer.saved', { name }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(t: SavedTimer): Promise<void> {
    try {
      this.saved.set(await this.api.deleteTimer(t.id));
      this.toast.show(this.i18n.t('engage.timer.deleted', { name: t.name }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected start(): void {
    this.run.start(this.settings());
  }

  /** the same run once more (its own settings, even if the screen's changed) */
  protected again(): void {
    this.run.start(this.run.settings());
  }

  protected toggle(): void {
    this.run.toggle();
  }

  protected stop(): void {
    this.run.stop();
  }

  /** the next phase (the "skip" button) */
  protected next(): void {
    this.run.next();
  }

  /** the ring empties as the phase goes by */
  private draw(fraction: number): void {
    const el = this.arc()?.nativeElement;
    if (el) el.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, fraction)));
  }

  /** one's own settings, kept on this device */
  private load(): Settings {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Settings | null;
      if (raw && raw.work >= 5 && raw.rest >= 0 && raw.rounds >= 1) return { work: raw.work, rest: raw.rest, rounds: raw.rounds };
    } catch {
      /* private mode, blocked storage: the defaults */
    }
    return { ...CUSTOM };
  }

  private keep(s: Settings): void {
    try {
      localStorage.setItem(STORE, JSON.stringify(s));
    } catch {
      /* not kept: fine */
    }
  }
}
