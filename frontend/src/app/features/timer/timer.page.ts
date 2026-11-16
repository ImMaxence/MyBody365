import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, inject, signal } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
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

/**
 * A timer for a workout, nothing more: effort, rest and rounds (or a preset), a 5-second "ready",
 * beeps on the last three seconds and at each change, a vibration, the screen kept awake. It counts
 * against the clock, so a phone that slows the page down does not make it drift.
 */
@Component({
  selector: 'app-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'engage.timer.title' | t }}</h1>
      </header>

      @if (state() === 'idle') {
        <section class="setup">
          <div class="slide-chips" role="group" [attr.aria-label]="'engage.timer.presets' | t">
            @for (p of presets; track p.key) {
              <button type="button" [attr.aria-pressed]="isPreset(p)" (click)="apply(p)">{{ 'engage.timer.presetNames.' + p.key | t }}</button>
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
        </section>
      } @else {
        <section class="run" [attr.data-phase]="phase()">
          <div class="dial" role="timer" [attr.aria-label]="phaseLabel() + ', ' + clockOf(remaining())">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="88" class="track" />
              <circle cx="100" cy="100" r="88" class="arc" pathLength="1" [style.stroke-dashoffset]="1 - progress()" />
            </svg>
            <div class="dial-text">
              @for (p of [phase() + index()]; track p) {
                <span class="phase">{{ state() === 'done' ? ('engage.timer.done' | t) : phaseLabel() }}</span>
              }
              <span class="time num">{{ state() === 'done' ? '0:00' : clockOf(remaining()) }}</span>
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
              <button type="button" class="ctl" [attr.aria-label]="'engage.timer.skip' | t" (click)="skip()"><app-icon name="chevronRight" [size]="24" /></button>
            </div>
          } @else {
            <div class="controls done">
              <button type="button" class="btn btn-primary" (click)="start()"><app-icon name="repeat" /> {{ 'engage.timer.again' | t }}</button>
              <button type="button" class="btn btn-ghost" (click)="stop()">{{ 'engage.timer.close' | t }}</button>
            </div>
          }
        </section>
      }
    </main>
  `,
  styles: `
    .setup {
      display: grid;
      gap: var(--space-4);
      animation: rise 360ms var(--ease-out) both;
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
    .dial {
      position: relative;
      width: min(78vw, 320px);
      aspect-ratio: 1;
    }
    .dial svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .track {
      fill: none;
      stroke: var(--surface-3);
      stroke-width: 12;
    }
    .arc {
      fill: none;
      stroke: var(--phase);
      stroke-width: 12;
      stroke-linecap: round;
      stroke-dasharray: 1;
      transition: stroke 300ms;
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
      font-size: 1.1rem;
      color: var(--fg-2);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      animation: rise 300ms var(--ease-out) both;
    }
    .time {
      font-size: clamp(3.4rem, 18vw, 4.6rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1;
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
      transition: transform var(--dur-1) var(--ease-out);
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
      .val {
        animation: none;
      }
    }
  `,
})
export class TimerPage {
  protected readonly i18n = inject(I18nService);
  private readonly doc = inject(DOCUMENT);
  protected readonly presets = PRESETS;
  protected readonly fields: { key: keyof Settings; icon: string; min: number; max: number }[] = [
    { key: 'work', icon: 'flame', min: 5, max: 3600 },
    { key: 'rest', icon: 'timer', min: 0, max: 600 },
    { key: 'rounds', icon: 'repeat', min: 1, max: 30 },
  ];

  protected readonly settings = signal<Settings>(this.load());
  protected readonly state = signal<'idle' | 'running' | 'paused' | 'done'>('idle');
  /** the phases of the run, in order */
  private plan: { phase: Phase; seconds: number; round: number }[] = [];
  protected readonly index = signal(0);
  protected readonly remaining = signal(0);
  protected readonly announce = signal('');
  private endAt = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private lastBeep = -1;
  private audio: AudioContext | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;

  protected readonly phase = computed<Phase>(() => this.plan[this.index()]?.phase ?? 'prep');
  protected readonly round = computed(() => this.plan[this.index()]?.round ?? 1);
  protected readonly totalSeconds = computed(() => {
    const s = this.settings();
    return s.work * s.rounds + s.rest * (s.rounds - 1);
  });
  protected readonly progress = computed(() => {
    const p = this.plan[this.index()];
    if (this.state() === 'done') return 1;
    return p ? 1 - this.remaining() / p.seconds : 0;
  });
  protected readonly totalLeft = computed(() => {
    const i = this.index();
    return this.remaining() + this.plan.slice(i + 1).reduce((s, p) => s + p.seconds, 0);
  });
  protected readonly phaseLabel = computed(() => this.i18n.t('engage.timer.' + (this.phase() === 'prep' ? 'prep' : this.phase())));

  constructor() {
    const onVisible = () => {
      if (this.doc.visibilityState === 'visible' && this.state() === 'running') {
        // the browser lets the screen lock go when the page is hidden: asked again
        this.wakeLock = null;
        void this.keepAwake();
        this.tick();
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

  protected isPreset(p: Preset): boolean {
    const s = this.settings();
    return s.work === p.work && s.rest === p.rest && s.rounds === p.rounds;
  }

  protected apply(p: Preset): void {
    this.save({ work: p.work, rest: p.rest, rounds: p.rounds });
  }

  /** 5 s steps under a minute, 15 s up to 5 minutes, 30 s beyond; rounds one by one */
  protected change(k: keyof Settings, dir: number): void {
    const s = this.settings();
    const f = this.fields.find((x) => x.key === k)!;
    let v = s[k];
    if (k === 'rounds') v += dir;
    else {
      const step = (dir > 0 ? v : v - 1) < 60 ? 5 : (dir > 0 ? v : v - 1) < 300 ? 15 : 30;
      v = Math.round((v + dir * step) / step) * step;
    }
    this.save({ ...s, [k]: Math.min(f.max, Math.max(f.min, v)) });
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
    this.enter(0);
    this.state.set('running');
    void this.keepAwake();
    this.run();
  }

  protected toggle(): void {
    if (this.state() === 'running') {
      this.remaining.set(Math.max(0, (this.endAt - Date.now()) / 1000));
      this.state.set('paused');
      if (this.ticker) clearInterval(this.ticker);
      this.ticker = null;
    } else if (this.state() === 'paused') {
      this.endAt = Date.now() + this.remaining() * 1000;
      this.state.set('running');
      this.run();
    }
  }

  protected skip(): void {
    this.next();
  }

  protected stop(): void {
    this.halt();
    this.state.set('idle');
  }

  private run(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = setInterval(() => this.tick(), 100);
    this.tick();
  }

  private tick(): void {
    if (this.state() !== 'running') return;
    const left = (this.endAt - Date.now()) / 1000;
    if (left <= 0) {
      this.next();
      return;
    }
    this.remaining.set(left);
    const whole = Math.ceil(left);
    // the last three seconds of a phase
    if (whole <= 3 && whole !== this.lastBeep) {
      this.lastBeep = whole;
      this.beep(660, 0.09);
    }
  }

  private enter(i: number): void {
    const p = this.plan[i];
    this.index.set(i);
    this.endAt = Date.now() + p.seconds * 1000;
    this.remaining.set(p.seconds);
    this.lastBeep = -1;
    const label = this.i18n.t('engage.timer.' + p.phase);
    this.announce.set(p.phase === 'prep' ? label : `${label}, ${this.i18n.t('engage.timer.round', { n: p.round, total: this.settings().rounds })}`);
  }

  private next(): void {
    const i = this.index() + 1;
    if (i >= this.plan.length) {
      this.finish();
      return;
    }
    this.enter(i);
    this.beep(this.plan[i].phase === 'work' ? 990 : 520, 0.28);
    this.doc.defaultView?.navigator.vibrate?.(this.plan[i].phase === 'work' ? [120, 60, 120] : 200);
    if (this.state() === 'paused') this.state.set('running');
    if (!this.ticker) this.run();
  }

  private finish(): void {
    this.halt();
    this.remaining.set(0);
    this.state.set('done');
    this.announce.set(this.i18n.t('engage.timer.done'));
    this.beep(880, 0.2);
    setTimeout(() => this.beep(1320, 0.35), 220);
    this.doc.defaultView?.navigator.vibrate?.([200, 80, 200, 80, 400]);
  }

  private halt(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
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

  /** the last settings, kept on this device */
  private load(): Settings {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Settings | null;
      if (raw && raw.work >= 5 && raw.rest >= 0 && raw.rounds >= 1) return { work: raw.work, rest: raw.rest, rounds: raw.rounds };
    } catch {
      /* private mode, blocked storage: the defaults */
    }
    return { work: 45, rest: 15, rounds: 4 };
  }

  private save(s: Settings): void {
    this.settings.set(s);
    try {
      localStorage.setItem(STORE, JSON.stringify(s));
    } catch {
      /* not kept: fine */
    }
  }
}
