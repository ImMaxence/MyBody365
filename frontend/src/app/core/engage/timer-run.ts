import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { haptic } from '../ui/haptics';
import { EngageApi, TimerAlert } from './engage-api';

export type TimerPhase = 'prep' | 'work' | 'rest';
export type TimerState = 'idle' | 'running' | 'paused' | 'done';

export interface TimerSettings {
  work: number;
  rest: number;
  rounds: number;
}

interface Step {
  phase: TimerPhase;
  seconds: number;
  round: number;
}

interface Stored {
  settings: TimerSettings;
  plan: Step[];
  index: number;
  endAt: number;
  pausedLeft: number;
  state: Exclude<TimerState, 'idle'>;
}

/** the 5-second "ready" before the first effort */
export const TIMER_PREP = 5;
const RUN_KEY = 'mb-timer-run';
/** a run finished longer ago than this is not shown again */
const FORGET_AFTER = 3 * 3600_000;

type Lock = { release(): Promise<void> };

/**
 * The workout timer's run, for the whole app (1.7): it goes on when one leaves the timer's screen, until it ends or is
 * stopped. Its clock is the real time (when each phase ends), never a count of ticks: when the phone stops the page
 * (locked screen, another app), the timer is exactly where it should be on return, without drift. Kept on the phone,
 * so that it survives even the app being closed by the system.
 *
 * Off screen, the page cannot beep: the coming changes of phase go to the server (TimerAlerts), which sends each one as
 * a notification at its time, and they are taken back as soon as the app is on screen again.
 */
@Injectable({ providedIn: 'root' })
export class TimerRun {
  private readonly doc = inject(DOCUMENT);
  private readonly api = inject(EngageApi);
  private readonly i18n = inject(I18nService);

  readonly state = signal<TimerState>('idle');
  /** the run's settings (the screen's own may change meanwhile) */
  readonly settings = signal<TimerSettings>({ work: 30, rest: 15, rounds: 5 });
  readonly index = signal(0);
  /** whole seconds left in the phase */
  readonly shown = signal(0);
  /** what a screen reader says at each change */
  readonly announce = signal('');
  readonly active = computed(() => this.state() === 'running' || this.state() === 'paused');
  readonly phase = computed<TimerPhase>(() => this.plan[this.index()]?.phase ?? 'prep');
  readonly round = computed(() => this.plan[this.index()]?.round ?? 1);
  readonly totalLeft = computed(() => {
    const i = this.index();
    return this.shown() + this.plan.slice(i + 1).reduce((s, p) => s + p.seconds, 0);
  });
  readonly totalSeconds = computed(() => {
    const s = this.settings();
    return s.work * s.rounds + s.rest * (s.rounds - 1);
  });

  private plan: Step[] = [];
  private endAt = 0;
  private pausedLeft = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastBeep = -1;
  private audio: AudioContext | null = null;
  private lock: Lock | null = null;
  /** the server holds the coming changes (the app is off screen) */
  private alertsOut = false;

  constructor() {
    this.restore();
    this.doc.addEventListener('visibilitychange', () => (this.doc.visibilityState === 'hidden' ? this.offScreen() : this.onScreen()));
    // iOS may skip visibilitychange when the app is swiped away: pagehide comes
    this.doc.defaultView?.addEventListener('pagehide', () => this.offScreen());
  }

  /** the ring: 1 at the start of a phase, 0 at its end */
  fraction(): number {
    const p = this.plan[this.index()];
    const state = this.state();
    if (!p || state === 'done' || state === 'idle') return 0;
    const left = state === 'paused' ? this.pausedLeft : (this.endAt - Date.now()) / 1000;
    return Math.max(0, Math.min(1, left / p.seconds));
  }

  start(s: TimerSettings): void {
    this.settings.set({ work: s.work, rest: s.rest, rounds: s.rounds });
    this.plan = [{ phase: 'prep', seconds: TIMER_PREP, round: 1 }];
    for (let r = 1; r <= s.rounds; r++) {
      this.plan.push({ phase: 'work', seconds: s.work, round: r });
      if (s.rest > 0 && r < s.rounds) this.plan.push({ phase: 'rest', seconds: s.rest, round: r });
    }
    this.unlockSound();
    // a new run: the index moves even when it was already 0, so everything read from the plan follows
    this.index.set(-1);
    this.state.set('running');
    this.enter(0, Date.now());
    this.run();
    this.save();
  }

  toggle(): void {
    this.unlockSound();
    if (this.state() === 'running') {
      this.catchUp(true);
      if (this.state() !== 'running') return;
      this.pausedLeft = Math.max(0, (this.endAt - Date.now()) / 1000);
      this.state.set('paused');
      this.halt(false);
    } else if (this.state() === 'paused') {
      this.endAt = Date.now() + this.pausedLeft * 1000;
      this.state.set('running');
      this.run();
    }
    this.save();
  }

  /** the next phase now (the "skip" button) */
  next(): void {
    this.unlockSound();
    const i = this.index() + 1;
    if (i >= this.plan.length) {
      this.finish(true);
      return;
    }
    this.enter(i, Date.now());
    this.cue(i);
    if (this.state() === 'paused') {
      this.state.set('running');
      this.run();
    }
    this.save();
  }

  /** stopped, or closed once done: back to the settings */
  stop(): void {
    this.halt();
    this.state.set('idle');
    this.save();
    this.takeAlertsBack();
  }

  private enter(i: number, startAt: number): void {
    const p = this.plan[i];
    this.index.set(i);
    this.endAt = startAt + p.seconds * 1000;
    this.shown.set(Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000)));
    this.lastBeep = -1;
    const label = this.i18n.t('engage.timer.' + p.phase);
    this.announce.set(p.phase === 'prep' ? label : `${label}, ${this.i18n.t('engage.timer.round', { n: p.round, total: this.settings().rounds })}`);
  }

  /**
   * Every phase whose end has passed, in one go (after the phone stopped the page, several may have). Live (on
   * screen): the change is heard; otherwise silently, the notifications did that.
   */
  private catchUp(live: boolean): void {
    if (this.state() !== 'running') return;
    const now = Date.now();
    let moved = false;
    while (now >= this.endAt) {
      const i = this.index() + 1;
      if (i >= this.plan.length) {
        this.finish(live);
        return;
      }
      this.enter(i, this.endAt);
      moved = true;
    }
    if (moved) {
      if (live) this.cue(this.index());
      this.save();
    }
  }

  private tick(): void {
    if (this.state() !== 'running') return;
    const live = this.doc.visibilityState === 'visible';
    this.catchUp(live);
    if (this.state() !== 'running') return;
    const whole = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
    if (whole !== this.shown()) this.shown.set(whole);
    // the last three seconds of a phase
    if (live && whole <= 3 && whole !== this.lastBeep) {
      this.lastBeep = whole;
      this.beep(660, 0.09);
      // 3, 2, 1: a small tap each, to feel it coming with the phone in the pocket
      if (whole > 0) haptic('soft');
    }
  }

  private run(): void {
    if (!this.timer) this.timer = setInterval(() => this.tick(), 200);
    void this.keepAwake();
    this.tick();
  }

  private finish(live: boolean): void {
    this.halt();
    this.shown.set(0);
    this.state.set('done');
    this.announce.set(this.i18n.t('engage.timer.done'));
    this.save();
    if (!live) return;
    this.beep(880, 0.2);
    setTimeout(() => this.beep(1320, 0.35), 220);
    haptic('done');
  }

  private halt(releaseScreen = true): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (releaseScreen) {
      void this.lock?.release().catch(() => undefined);
      this.lock = null;
    }
  }

  /** a change of phase, heard and felt */
  private cue(i: number): void {
    const work = this.plan[i]?.phase === 'work';
    this.beep(work ? 990 : 520, 0.28);
    haptic(work ? 'work' : 'rest');
  }

  private offScreen(): void {
    if (this.state() !== 'running' || this.alertsOut) return;
    this.catchUp(false);
    if (this.state() !== 'running') return;
    this.alertsOut = true;
    this.api.timerAlerts(this.upcoming()).catch(() => (this.alertsOut = false));
  }

  private onScreen(): void {
    this.takeAlertsBack();
    if (this.state() !== 'running') return;
    // the browser lets the screen lock go when the page is hidden: asked again
    this.lock = null;
    void this.keepAwake();
    this.tick();
  }

  private takeAlertsBack(): void {
    if (!this.alertsOut) return;
    this.alertsOut = false;
    this.api.cancelTimerAlerts().catch(() => undefined);
  }

  /** each change of phase still to come, and the end */
  upcoming(): TimerAlert[] {
    const total = this.settings().rounds;
    const out: TimerAlert[] = [];
    let at = this.endAt;
    for (let j = this.index() + 1; j < this.plan.length; j++) {
      const p = this.plan[j];
      out.push({ at: new Date(at).toISOString(), phase: p.phase === 'rest' ? 'REST' : 'WORK', round: p.round, total });
      at += p.seconds * 1000;
    }
    out.push({ at: new Date(at).toISOString(), phase: 'DONE', round: total, total });
    return out;
  }

  /** the sound needs a tap to be allowed: each control is one */
  private unlockSound(): void {
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume();
    } catch {
      this.audio = null;
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
    const nav = this.doc.defaultView?.navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Lock> } };
    if (!nav?.wakeLock || this.lock || this.doc.visibilityState !== 'visible') return;
    try {
      this.lock = await nav.wakeLock.request('screen');
    } catch {
      this.lock = null;
    }
  }

  private save(): void {
    try {
      const state = this.state();
      if (state === 'idle') localStorage.removeItem(RUN_KEY);
      else {
        const stored: Stored = { settings: this.settings(), plan: this.plan, index: this.index(), endAt: this.endAt, pausedLeft: this.pausedLeft, state };
        localStorage.setItem(RUN_KEY, JSON.stringify(stored));
      }
    } catch {
      /* private mode: the run lives as long as the app */
    }
  }

  /** the run of before (the app was closed by the system meanwhile): where it is now */
  private restore(): void {
    let s: Stored | null = null;
    try {
      s = JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null') as Stored | null;
    } catch {
      s = null;
    }
    if (!s || !Array.isArray(s.plan) || !s.plan.length || !(s.index >= 0 && s.index < s.plan.length)) return;
    this.plan = s.plan;
    this.settings.set(s.settings);
    this.endAt = s.endAt;
    this.pausedLeft = s.pausedLeft;
    this.index.set(s.index);
    this.state.set(s.state);
    if (s.state === 'paused') this.shown.set(Math.ceil(s.pausedLeft));
    if (s.state === 'running') {
      this.catchUp(false);
      if (this.state() === 'running') this.run();
    }
    // finished long ago: not shown again
    if (this.state() === 'done' && Date.now() - this.endedAt() > FORGET_AFTER) this.stop();
  }

  /** when the run ended (the end of its last phase) */
  private endedAt(): number {
    return this.endAt + this.plan.slice(this.index() + 1).reduce((t, p) => t + p.seconds * 1000, 0);
  }
}
