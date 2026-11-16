import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import { EngageApi, SavedTimer } from '../../core/engage/engage-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

type Phase = 'prep' | 'work' | 'rest';

interface Settings {
  work: number;
  rest: number;
  rounds: number;
}

interface Preset extends Settings {
  key: string;
}

const PREP = 5;
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
 * the screen kept awake. The ring follows the clock frame by frame (smooth, and no drift when the phone
 * slows the page down).
 */
@Component({
  selector: 'app-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, BackButtonComponent],
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
                  <button type="button" class="step" [disabled]="value(f.key) <= f.min" [attr.aria-label]="'engage.timer.less' | t: { what: ('engage.timer.' + f.key | t) }" (click)="change(f.key, -1)">
                    <app-icon name="minus" [size]="18" [stroke]="2.4" />
                  </button>
                  @for (v of [value(f.key)]; track v) {
                    <output class="val num" aria-live="polite">{{ f.key === 'rounds' ? v : f.key === 'rest' && v === 0 ? ('engage.timer.noRest' | t) : clockOf(v) }}</output>
                  }
                  <button type="button" class="step" [disabled]="value(f.key) >= f.max" [attr.aria-label]="'engage.timer.more' | t: { what: ('engage.timer.' + f.key | t) }" (click)="change(f.key, 1)">
                    <app-icon name="plus" [size]="18" [stroke]="2.4" />
                  </button>
                </div>
              </div>
            }
          </div>
          <p class="total small muted num">{{ 'engage.timer.total' | t: { time: clockOf(totalSeconds()) } }}</p>
          <button type="button" class="btn btn-primary btn-block go" (click)="start()"><app-icon name="play" /> {{ 'engage.timer.start' | t }}</button>
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
                <span class="round small">{{ 'engage.timer.round' | t: { n: round(), total: settings().rounds } }}</span>
              }
            </div>
          </div>
          <p class="sr-only" aria-live="assertive">{{ announce() }}</p>
          @if (state() !== 'done') {
            <p class="left small muted num">{{ 'engage.timer.left' | t: { time: clockOf(totalLeft()) } }}</p>
            <div class="controls">
              <button type="button" class="ctl" [attr.aria-label]="'engage.timer.stop' | t" (click)="stop()"><app-icon name="x" [size]="22" /></button>
              <button type="button" class="ctl main" [attr.aria-label]="(state() === 'paused' ? 'engage.timer.resume' : 'engage.timer.pause') | t" (click)="toggle()">
                <app-icon [name]="state() === 'paused' ? 'play' : 'pause'" [size]="30" />
              </button>
              <button type="button" class="ctl" [attr.aria-label]="'engage.timer.skip' | t" (click)="next()"><app-icon name="chevronRight" [size]="24" /></button>
            </div>
          } @else {
            <div class="controls done">
              <button type="button" class="btn btn-primary" (click)="start()"><app-icon name="repeat" /> {{ 'engage.timer.again' | t }}</button>
              <button type="button" class="btn btn-ghost" (click)="stop()">{{ 'engage.timer.close' | t }}</button>
            </div>
          }
        </section>
      }

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
    .step:active {
      transform: scale(0.9);
    }
    .step:disabled {
      opacity: 0.35;
    }
    .val {
      min-width: 74px;
      text-align: center;
      font-size: 1.3rem;
      font-weight: 750;
      animation: bump 220ms var(--ease-out);
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
    .ctl:active {
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
  private readonly api = inject(EngageApi);
  private readonly toast = inject(ToastService);
  private readonly doc = inject(DOCUMENT);
  private readonly arc = viewChild<ElementRef<SVGCircleElement>>('arc');
  private readonly saveDialog = viewChild.required<ElementRef<HTMLDialogElement>>('saveDialog');
  protected readonly presets = PRESETS;
  protected readonly fields: { key: keyof Settings; icon: string; min: number; max: number }[] = [
    { key: 'work', icon: 'flame', min: 5, max: 3600 },
    { key: 'rest', icon: 'timer', min: 0, max: 600 },
    { key: 'rounds', icon: 'repeat', min: 1, max: 30 },
  ];

  protected readonly settings = signal<Settings>(this.load());
  protected readonly saved = signal<SavedTimer[]>([]);
  protected readonly state = signal<'idle' | 'running' | 'paused' | 'done'>('idle');
  protected readonly busy = signal(false);
  protected name = '';
  /** the phases of the run, in order */
  private plan: { phase: Phase; seconds: number; round: number }[] = [];
  protected readonly index = signal(0);
  /** the whole seconds shown (the ring itself moves every frame) */
  protected readonly shown = signal(0);
  protected readonly announce = signal('');
  private endAt = 0;
  private pausedLeft = 0;
  private frame = 0;
  private fallback: ReturnType<typeof setInterval> | null = null;
  private lastBeep = -1;
  private audio: AudioContext | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;

  /** which chip is lit: a preset, a saved timer, or one's own settings */
  protected readonly mode = computed(() => {
    const s = this.settings();
    const saved = this.saved().find((x) => same(x, s));
    if (saved) return saved.id;
    return PRESETS.find((p) => same(p, s))?.key ?? 'custom';
  });
  protected readonly selectedSaved = computed(() => this.saved().find((x) => x.id === this.mode()) ?? null);
  protected readonly phase = computed<Phase>(() => this.plan[this.index()]?.phase ?? 'prep');
  protected readonly round = computed(() => this.plan[this.index()]?.round ?? 1);
  protected readonly totalSeconds = computed(() => {
    const s = this.settings();
    return s.work * s.rounds + s.rest * (s.rounds - 1);
  });
  protected readonly totalLeft = computed(() => {
    const i = this.index();
    return this.shown() + this.plan.slice(i + 1).reduce((s, p) => s + p.seconds, 0);
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
    const onVisible = () => {
      if (this.doc.visibilityState === 'visible' && this.state() === 'running') {
        // the browser lets the screen lock go when the page is hidden: asked again
        this.wakeLock = null;
        void this.keepAwake();
        this.loop();
      }
    };
    this.doc.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      this.doc.removeEventListener('visibilitychange', onVisible);
      this.halt();
    });
  }

  protected clockOf(s: number): string {
    return clock(s);
  }

  protected value(k: keyof Settings): number {
    return this.settings()[k];
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
    const s = this.settings();
    this.plan = [{ phase: 'prep', seconds: PREP, round: 1 }];
    for (let r = 1; r <= s.rounds; r++) {
      this.plan.push({ phase: 'work', seconds: s.work, round: r });
      if (s.rest > 0 && r < s.rounds) this.plan.push({ phase: 'rest', seconds: s.rest, round: r });
    }
    // the sound needs a tap to be allowed: this one
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume();
    } catch {
      this.audio = null;
    }
    // a new run: the index moves even when it was already 0, so everything read from the plan follows
    this.index.set(-1);
    this.state.set('running');
    this.enter(0);
    void this.keepAwake();
    this.loop();
  }

  protected toggle(): void {
    if (this.state() === 'running') {
      this.pausedLeft = Math.max(0, (this.endAt - Date.now()) / 1000);
      this.state.set('paused');
      this.halt(false);
    } else if (this.state() === 'paused') {
      this.endAt = Date.now() + this.pausedLeft * 1000;
      this.state.set('running');
      this.loop();
    }
  }

  protected stop(): void {
    this.halt();
    this.state.set('idle');
  }

  /** the next phase (also the "skip" button) */
  protected next(): void {
    const i = this.index() + 1;
    if (i >= this.plan.length) {
      this.finish();
      return;
    }
    this.enter(i);
    this.beep(this.plan[i].phase === 'work' ? 990 : 520, 0.28);
    this.doc.defaultView?.navigator.vibrate?.(this.plan[i].phase === 'work' ? [120, 60, 120] : 200);
    if (this.state() === 'paused') {
      this.state.set('running');
      this.loop();
    }
  }

  /** a frame: the ring where the clock says, the seconds when they change, the beeps */
  private tick(): void {
    if (this.state() !== 'running') return;
    const p = this.plan[this.index()];
    const left = (this.endAt - Date.now()) / 1000;
    if (left <= 0) {
      this.next();
      return;
    }
    this.draw(left / p.seconds);
    const whole = Math.ceil(left);
    if (whole !== this.shown()) this.shown.set(whole);
    // the last three seconds of a phase
    if (whole <= 3 && whole !== this.lastBeep) {
      this.lastBeep = whole;
      this.beep(660, 0.09);
    }
  }

  /** the ring empties as the phase goes by */
  private draw(fraction: number): void {
    const el = this.arc()?.nativeElement;
    if (el) el.style.strokeDashoffset = String(1 - Math.max(0, Math.min(1, fraction)));
  }

  private loop(): void {
    const win = this.doc.defaultView;
    if (!win) return;
    cancelAnimationFrame(this.frame);
    const step = () => {
      this.tick();
      if (this.state() === 'running') this.frame = win.requestAnimationFrame(step);
    };
    this.frame = win.requestAnimationFrame(step);
    // frames stop when the page is hidden: the phases still change on time
    if (!this.fallback) this.fallback = setInterval(() => this.doc.hidden && this.tick(), 250);
  }

  private enter(i: number): void {
    const p = this.plan[i];
    this.index.set(i);
    this.endAt = Date.now() + p.seconds * 1000;
    this.shown.set(p.seconds);
    this.lastBeep = -1;
    // the new ring starts full (the view may need a moment to show the arc: next frame)
    this.draw(1);
    const label = this.i18n.t('engage.timer.' + p.phase);
    this.announce.set(p.phase === 'prep' ? label : `${label}, ${this.i18n.t('engage.timer.round', { n: p.round, total: this.settings().rounds })}`);
  }

  private finish(): void {
    this.halt();
    this.shown.set(0);
    this.draw(0);
    this.state.set('done');
    this.announce.set(this.i18n.t('engage.timer.done'));
    this.beep(880, 0.2);
    setTimeout(() => this.beep(1320, 0.35), 220);
    this.doc.defaultView?.navigator.vibrate?.([200, 80, 200, 80, 400]);
  }

  private halt(releaseScreen = true): void {
    cancelAnimationFrame(this.frame);
    if (this.fallback) clearInterval(this.fallback);
    this.fallback = null;
    if (releaseScreen) {
      void this.wakeLock?.release().catch(() => undefined);
      this.wakeLock = null;
    }
  }

  /** a short tone, made on the spot (no sound file) */
  private beep(freq: number, seconds: number): void {
    const ctx = this.audio;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + seconds + 0.02);
    } catch {
      /* no sound: the screen and the vibration remain */
    }
  }

  /** the screen stays on while the timer runs (where the browser allows it) */
  private async keepAwake(): Promise<void> {
    const nav = this.doc.defaultView?.navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    if (!nav?.wakeLock || this.wakeLock) return;
    try {
      this.wakeLock = await nav.wakeLock.request('screen');
    } catch {
      this.wakeLock = null;
    }
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
