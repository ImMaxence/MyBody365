import { ChangeDetectionStrategy, Component, DestroyRef, WritableSignal, computed, inject, input, signal } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Outbox, isOffline } from '../../core/offline/outbox';
import { WaterStore } from '../../core/tracking/water.store';
import { HapticDirective, haptic } from '../../core/ui/haptics';
import { ToastService } from '../../core/ui/toast.service';
import { calmReturn } from '../../core/ui/first-show';
import { IconComponent } from '../../shared/icon.component';

/** a glass is 25 cl */
const GLASS_L = 0.25;
const MAX = 40;
/** two taps closer than this on the same glass are a double tap */
const DOUBLE_MS = 420;
/** 4 glasses a row at most: below, they get too small to aim at with a thumb */
const PER_ROW = 4;

/** a first goal from the weight: about 33 ml per kg, 6 to 12 glasses (8 without a weight) */
export function defaultWaterGoal(kg: number | null | undefined): number {
  return kg ? Math.min(12, Math.max(6, Math.round((kg * 0.033) / GLASS_L))) : 8;
}

/**
 * Today's glasses of water (1.9), on the Today screen when the tracker is on: big glasses to tap, the next one with a
 * « + » inside. A tap fills a glass (the water rises with a wave, splashes and a few bubbles). 1.15: a full glass
 * empties on a double tap only (it pours out), with the ones after it: a single tap makes it wobble and says so, a
 * thumb landing on the wrong glass no longer wipes the day. 4 glasses a row at most, the goal reached makes them all
 * jump in turn. Each tap vibrates. The count of the day shows at once (WaterStore keeps the last one seen).
 */
@Component({
  selector: 'app-water-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.calm]': 'calm()' },
  imports: [TranslatePipe, IconComponent, HapticDirective],
  template: `
    <section class="water card" [class.reached]="reached()" [attr.aria-label]="'water.title' | t">
      <div class="head">
        <span class="ico" aria-hidden="true">
          @if (reached()) {
            <app-icon name="check" [size]="20" [stroke]="2.6" />
          } @else {
            <app-icon name="droplet" [size]="20" />
          }
        </span>
        <div class="titles">
          <h2 class="h3">{{ 'water.title' | t }}</h2>
          <span class="small muted" [class.hinting]="hint() !== null" aria-live="polite">{{ hint() !== null ? ('water.emptyHint' | t) : status() }}</span>
        </div>
        <span class="litres num"><b>{{ litres() }}</b> / {{ goalLitres() }} L</span>
      </div>

      <div class="glasses" role="group" [class.cheer]="cheer()" [attr.aria-label]="'water.glasses' | t" [style.--cols]="cols()">
        @for (s of slots(); track $index; let i = $index) {
          <span class="haptic box">
            <button type="button" class="glass" [class.on]="i < shown()" [class.next]="i === shown()" [class.just]="i === just()"
              [class.wobble]="i === hint()" [class.pour]="i === poured()" [class.extra]="i >= goal()" [style.--i]="i"
              [disabled]="count() === null" [attr.aria-label]="glassLabel(i)" (click)="tap(i)">
              <svg viewBox="0 0 40 52" aria-hidden="true">
                <defs>
                  <clipPath [attr.id]="'water-glass-' + i"><path d="M5.2 5h29.6l-3.7 39.7a3 3 0 0 1-3 2.7H11.9a3 3 0 0 1-3-2.7Z" /></clipPath>
                </defs>
                <g [attr.clip-path]="'url(#water-glass-' + i + ')'">
                  <g class="fill">
                    <path class="wave back" d="M-40 13q10-3.4 20 0t20 0 20 0 20 0 20 0 20 0V54H-40Z" />
                    <path class="wave front" d="M-40 14q10 3.4 20 0t20 0 20 0 20 0 20 0 20 0V54H-40Z" />
                    <circle class="bubble b1" cx="14" cy="44" r="1.5" />
                    <circle class="bubble b2" cx="23" cy="46" r="1.1" />
                    <circle class="bubble b3" cx="28" cy="43" r="1.3" />
                  </g>
                </g>
                <path class="outline" d="M3.6 3h32.8a1.1 1.1 0 0 1 1.1 1.2l-3.9 40.8a4.8 4.8 0 0 1-4.8 4.4H11.2a4.8 4.8 0 0 1-4.8-4.4L2.5 4.2A1.1 1.1 0 0 1 3.6 3Z" />
                <path class="shine" d="M8 9.5l2.6 30" />
                <!-- 1.15: the splash over the brim when it fills -->
                <g class="splash">
                  <circle class="drop d1" cx="13" cy="4" r="1.7" />
                  <circle class="drop d2" cx="20" cy="2.5" r="2.1" />
                  <circle class="drop d3" cx="27" cy="4" r="1.6" />
                  <circle class="drop d4" cx="17" cy="3.5" r="1.1" />
                </g>
              </svg>
              @if (i === shown()) {
                <span class="plus"><app-icon name="plus" [size]="22" [stroke]="2.8" /></span>
              }
            </button><input appHaptic="tap" />
          </span>
        }
      </div>

      <div class="foot">
        <span class="tiny muted">{{ 'water.size' | t }}</span>
        <span class="haptic">
          <button type="button" class="less" [disabled]="!count()" [attr.aria-label]="'water.less' | t" (click)="set((count() ?? 0) - 1)">
            <app-icon name="minus" [size]="16" [stroke]="2.6" /> {{ 'water.lessShort' | t }}
          </button><input appHaptic />
        </span>
      </div>
    </section>
  `,
  styles: `
    .water {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      transition:
        box-shadow 600ms var(--ease-out),
        border-color 600ms var(--ease-out);
    }
    .water.reached {
      border-color: color-mix(in srgb, var(--cool) 40%, var(--line));
      box-shadow: 0 16px 40px -22px var(--cool);
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: var(--cool-soft);
      color: var(--cool);
      transition:
        background-color var(--dur-2),
        color var(--dur-2);
    }
    .reached .ico {
      background: var(--cal-done);
      color: var(--cal-done-ink);
      animation: ico-pop 520ms var(--ease-out);
    }
    @keyframes ico-pop {
      40% {
        transform: scale(1.25) rotate(-8deg);
      }
    }
    .titles {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .titles .h3 {
      margin: 0;
      font-size: 1.05rem;
    }
    .litres {
      flex: none;
      color: var(--fg-2);
      font-size: var(--fs-s);
    }
    .litres b {
      color: var(--cool);
      font-size: 1.15rem;
      font-weight: 800;
    }
    .glasses {
      display: grid;
      grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
      gap: 12px 8px;
      padding-top: 4px;
    }
    .box {
      display: grid;
      justify-items: center;
    }
    .glass {
      position: relative;
      display: grid;
      place-items: center;
      width: 100%;
      max-width: 60px;
      aspect-ratio: 40 / 52;
      padding: 0;
      background: none;
      color: var(--cool);
      isolation: isolate;
      transition: transform 260ms var(--ease-out);
    }
    /* 1.15: a ring of water spreads behind the glass just filled */
    .glass::before {
      content: '';
      position: absolute;
      left: 50%;
      top: 55%;
      width: 120%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: radial-gradient(closest-side, color-mix(in srgb, var(--cool) 30%, transparent), transparent);
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.4);
      pointer-events: none;
      z-index: -1;
    }
    .just::before {
      animation: ripple 700ms var(--ease-out);
    }
    @keyframes ripple {
      20% {
        opacity: 1;
      }
      to {
        opacity: 0;
        transform: translate(-50%, -50%) scale(1.25);
      }
    }
    .glass svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .outline {
      fill: color-mix(in srgb, var(--cool) 6%, transparent);
      stroke: color-mix(in srgb, var(--cool) 32%, var(--line-strong));
      stroke-width: 1.6;
      transition: stroke 300ms;
    }
    .on .outline {
      stroke: color-mix(in srgb, var(--cool) 70%, transparent);
    }
    .next .outline {
      stroke: var(--cool);
      stroke-dasharray: 3 3;
    }
    .shine {
      fill: none;
      stroke: rgba(255, 255, 255, 0.55);
      stroke-width: 1.6;
      stroke-linecap: round;
      opacity: 0;
      transition: opacity 400ms 300ms;
    }
    .on .shine {
      opacity: 1;
    }
    /* the water: down out of the glass, up to the brim with a little overshoot */
    .fill {
      transform: translateY(40px);
      transition: transform 720ms cubic-bezier(0.2, 0.9, 0.3, 1.12);
    }
    .on .fill {
      transform: none;
    }
    .wave {
      fill: var(--cool);
    }
    .wave.back {
      opacity: 0.45;
    }
    .just .wave.front {
      animation: wave 900ms linear 2;
    }
    .just .wave.back {
      animation: wave 1300ms linear 2 reverse;
    }
    @keyframes wave {
      to {
        transform: translateX(40px);
      }
    }
    .bubble {
      fill: rgba(255, 255, 255, 0.8);
      opacity: 0;
    }
    .just .bubble {
      animation: bubble 1100ms var(--ease-out) both;
    }
    .just .b2 {
      animation-delay: 160ms;
    }
    .just .b3 {
      animation-delay: 320ms;
    }
    @keyframes bubble {
      15% {
        opacity: 1;
      }
      to {
        opacity: 0;
        transform: translateY(-28px);
      }
    }
    .just svg {
      animation: pop 460ms var(--ease-out);
    }
    .drop {
      fill: var(--cool);
      opacity: 0;
    }
    .just .drop {
      animation: drop 620ms 120ms cubic-bezier(0.2, 0.7, 0.4, 1) both;
    }
    .just .d1 {
      --dx: -9px;
      --dy: -9px;
    }
    .just .d2 {
      --dx: 0px;
      --dy: -14px;
      animation-delay: 160ms;
    }
    .just .d3 {
      --dx: 9px;
      --dy: -10px;
      animation-delay: 140ms;
    }
    .just .d4 {
      --dx: -4px;
      --dy: -15px;
      animation-delay: 200ms;
    }
    @keyframes drop {
      15% {
        opacity: 1;
      }
      60% {
        opacity: 0.9;
        transform: translate(var(--dx), var(--dy));
      }
      to {
        opacity: 0;
        transform: translate(calc(var(--dx) * 1.3), calc(var(--dy) * 0.4)) scale(0.6);
      }
    }
    /* 1.15: a full glass tapped once wobbles (« tap twice »), emptied it tips over and pours out */
    .wobble svg {
      animation: wobble 480ms var(--ease-out);
    }
    @keyframes wobble {
      20% {
        transform: rotate(-9deg);
      }
      45% {
        transform: rotate(7deg);
      }
      70% {
        transform: rotate(-4deg);
      }
    }
    .pour svg {
      transform-origin: 80% 90%;
      animation: pour 640ms var(--ease-out);
    }
    /* the water runs out while it tips, the « + » comes back once it stands again */
    .pour .fill {
      transition: transform 520ms ease-in;
    }
    .pour .plus {
      animation: plus-in 320ms 520ms var(--ease-out) both;
    }
    @keyframes pour {
      35% {
        transform: rotate(24deg) translateY(-3px);
      }
      65% {
        transform: rotate(20deg) translateY(-2px);
      }
    }
    .hinting {
      color: var(--cool);
      font-weight: 650;
    }
    /* 1.15: the goal reached, the full glasses jump one after the other */
    .cheer .on svg {
      animation: cheer 520ms calc(var(--i, 0) * 55ms) var(--ease-out) both;
    }
    @keyframes cheer {
      40% {
        transform: translateY(-9px) scale(1.06);
      }
      75% {
        transform: translateY(1px) scale(0.98);
      }
    }
    @keyframes pop {
      35% {
        transform: scale(1.14) translateY(-2px);
      }
      70% {
        transform: scale(0.97);
      }
    }
    /* 1.16: back on Today, the « + » and the goal reached are there already (core/ui/first-show.ts) */
    :host(.calm) .plus,
    :host(.calm) .reached .ico {
      animation-duration: 0s;
      animation-delay: 0s;
    }
    .plus {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding-top: 6px;
      color: var(--cool);
      animation: plus-in 320ms var(--ease-out);
    }
    @keyframes plus-in {
      from {
        opacity: 0;
        transform: scale(0.4);
      }
    }
    .glass:disabled {
      opacity: 0.55;
    }
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .less {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 34px;
      padding: 0 12px;
      border-radius: var(--radius-pill);
      background: var(--surface-3);
      color: var(--fg);
      font-weight: 650;
      font-size: var(--fs-s);
      transition: transform var(--dur-1) var(--ease-out);
    }
    .less:disabled {
      opacity: 0.4;
    }
    @media (prefers-reduced-motion: reduce) {
      .fill {
        transition: none;
      }
      .just .wave,
      .just .bubble,
      .just .drop,
      .just::before,
      .just svg,
      .wobble svg,
      .pour svg,
      .cheer .on svg,
      .plus,
      .reached .ico {
        animation: none;
      }
    }
  `,
})
export class WaterCardComponent {
  readonly goal = input.required<number>();
  private readonly store = inject(WaterStore);
  protected readonly calm = calmReturn('water');
  private readonly toast = inject(ToastService);
  private readonly outbox = inject(Outbox);
  protected readonly i18n = inject(I18nService);
  private toldOffline = false;

  protected readonly count = this.store.glasses;
  /** the glasses shown full (none while the count is not known) */
  protected readonly shown = computed(() => this.count() ?? 0);
  /** the glass just filled: its wave, its bubbles */
  protected readonly just = signal<number | null>(null);
  private justTimer: ReturnType<typeof setTimeout> | null = null;
  /** 1.15: the full glass tapped once (it wobbles, the status says to tap twice) */
  protected readonly hint = signal<number | null>(null);
  /** 1.15: the glass just emptied (it pours out) */
  protected readonly poured = signal<number | null>(null);
  /** 1.15: the goal just reached (the glasses jump in turn) */
  protected readonly cheer = signal(false);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** the last tap on a glass: which one, when, and whether it already did something (filled or emptied it) */
  private lastTap: { i: number; at: number; done: boolean } | null = null;

  /** the goal's glasses, and always one more to fill (40 at most) */
  protected readonly slots = computed(() => Array.from({ length: Math.min(MAX, Math.max(this.goal(), this.shown() + 1)) }));
  /**
   * 1.15: 4 glasses a row at most, the rows as even as can be (6 → 3 + 3, 7 → 4 + 3, 9 → 3 × 3): from the goal only, so
   * adding past it never reshuffles them
   */
  protected readonly cols = computed(() => {
    const g = Math.max(1, this.goal());
    return Math.ceil(g / Math.ceil(g / PER_ROW));
  });
  protected readonly reached = computed(() => this.shown() >= this.goal());
  /** « 0,5 », « 1,25 », « 2 » litres: no useless zeros */
  private readonly litresFormat = computed(() => new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 2 }));
  protected readonly litres = computed(() => this.litresFormat().format(this.shown() * GLASS_L));
  protected readonly goalLitres = computed(() => this.litresFormat().format(this.goal() * GLASS_L));
  protected readonly status = computed(() => {
    if (this.count() === null) return this.i18n.t('water.loading');
    const left = this.goal() - this.shown();
    if (left <= 0) return this.i18n.t('water.done');
    return this.i18n.t(left === 1 ? 'water.leftOne' : 'water.left', { n: left });
  });

  constructor() {
    this.store.load();
    inject(DestroyRef).onDestroy(() => {
      if (this.justTimer) clearTimeout(this.justTimer);
      for (const t of this.timers.values()) clearTimeout(t);
    });
  }

  protected glassLabel(i: number): string {
    if (i < this.shown()) return this.i18n.t('water.glassFull', { n: i + 1 });
    return this.i18n.t('water.glassEmpty', { n: i + 1 });
  }

  /**
   * an empty glass fills up to it at once; a full one empties on a double tap only, with the ones after it. Quick taps on
   * the same glass do one thing only: a double tap on an empty glass leaves it full, a triple tap on a full one empty.
   */
  protected tap(i: number): void {
    if (this.count() === null) return;
    const now = Date.now();
    const last = this.lastTap;
    const quick = last !== null && last.i === i && now - last.at < DOUBLE_MS;
    if (quick && last.done) {
      this.lastTap = { i, at: now, done: true };
      return;
    }
    if (i >= this.shown()) {
      this.lastTap = { i, at: now, done: true };
      this.set(i + 1);
      return;
    }
    if (quick) {
      this.lastTap = { i, at: now, done: true };
      this.moment('hint', this.hint, null, 0);
      this.moment('pour', this.poured, i, 700);
      this.set(i);
      return;
    }
    this.lastTap = { i, at: now, done: false };
    this.moment('hint', this.hint, i, 1800);
  }

  /**
   * a state for a moment, set again after a frame without it (the same glass animates again; a timer, not
   * requestAnimationFrame, which headless WebKit never runs); null ends it at once
   */
  private moment<T>(name: string, state: WritableSignal<T | null>, value: T | null, ms: number): void {
    const t = this.timers.get(name);
    if (t) clearTimeout(t);
    this.timers.delete(name);
    state.set(null);
    if (value === null) return;
    this.timers.set(
      name,
      setTimeout(() => {
        state.set(value);
        this.timers.set(name, setTimeout(() => state.set(null), ms));
      }, 20),
    );
  }

  protected set(value: number): void {
    const before = this.shown();
    const next = Math.max(0, Math.min(MAX, value));
    if (next === before || this.count() === null) return;
    if (next > before) {
      this.just.set(next - 1);
      if (this.justTimer) clearTimeout(this.justTimer);
      this.justTimer = setTimeout(() => this.just.set(null), 2600);
    } else {
      this.just.set(null);
    }
    if (next >= this.goal() && before < this.goal()) {
      this.toast.show(this.i18n.t('water.reached'));
      haptic('success');
      // once the last glass has filled, every full glass jumps in turn
      const t = this.timers.get('cheer');
      if (t) clearTimeout(t);
      this.timers.set(
        'cheer',
        setTimeout(() => {
          this.cheer.set(true);
          this.timers.set('cheer', setTimeout(() => this.cheer.set(false), 600 + next * 55));
        }, 650),
      );
    }
    const day = this.store.today();
    this.store.set(next).catch((e) => {
      if (isOffline(e)) {
        // no network: the count stays on screen and goes when the network is back (the last one counts)
        this.outbox.add({ kind: 'water', method: 'PUT', url: `/api/me/water/${day}`, body: { glasses: next }, day });
        if (!this.toldOffline) this.toast.show(this.i18n.t('offline.queued'));
        this.toldOffline = true;
        return;
      }
      if (this.count() === next) this.count.set(before);
      this.toast.error(this.i18n.error(errorCode(e)));
    });
  }
}
