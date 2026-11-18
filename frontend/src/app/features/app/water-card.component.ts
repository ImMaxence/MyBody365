import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Outbox, isOffline } from '../../core/offline/outbox';
import { WaterStore } from '../../core/tracking/water.store';
import { HapticDirective } from '../../core/ui/haptics';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** a glass is 25 cl */
const GLASS_L = 0.25;
const MAX = 40;

/** a first goal from the weight: about 33 ml per kg, 6 to 12 glasses (8 without a weight) */
export function defaultWaterGoal(kg: number | null | undefined): number {
  return kg ? Math.min(12, Math.max(6, Math.round((kg * 0.033) / GLASS_L))) : 8;
}

/**
 * Today's glasses of water (1.9), on the Today screen when the tracker is on: big glasses to tap, the next one with a
 * « + » inside. A tap fills a glass (the water rises with a wave and a few bubbles), a tap on a full one empties it
 * and the ones after. Each tap vibrates. The count of the day shows at once (WaterStore keeps the last one seen).
 */
@Component({
  selector: 'app-water-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
          <span class="small muted" aria-live="polite">{{ status() }}</span>
        </div>
        <span class="litres num"><b>{{ litres() }}</b> / {{ goalLitres() }} L</span>
      </div>

      <div class="glasses" role="group" [attr.aria-label]="'water.glasses' | t" [style.--cols]="cols()">
        @for (s of slots(); track $index; let i = $index) {
          <span class="haptic box">
            <button type="button" class="glass" [class.on]="i < shown()" [class.next]="i === shown()" [class.just]="i === just()"
              [class.extra]="i >= goal()" [disabled]="count() === null" [attr.aria-label]="glassLabel(i)" (click)="tap(i)">
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
              </svg>
              @if (i === shown()) {
                <span class="plus"><app-icon name="plus" [size]="18" [stroke]="2.8" /></span>
              }
            </button><input appHaptic="soft" />
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
      grid-template-columns: repeat(var(--cols, 8), minmax(0, 1fr));
      gap: 6px 4px;
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
      max-width: 48px;
      aspect-ratio: 40 / 52;
      padding: 0;
      background: none;
      color: var(--cool);
      transition: transform 260ms var(--ease-out);
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
    @keyframes pop {
      35% {
        transform: scale(1.14) translateY(-2px);
      }
      70% {
        transform: scale(0.97);
      }
    }
    .plus {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding-top: 4px;
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
      .just svg,
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

  /** the goal's glasses, and always one more to fill (40 at most) */
  protected readonly slots = computed(() => Array.from({ length: Math.min(MAX, Math.max(this.goal(), this.shown() + 1)) }));
  /** as many glasses a row as the goal (two rows beyond 8): adding past the goal never reshuffles them */
  protected readonly cols = computed(() => {
    const g = this.goal();
    return g <= 8 ? g : Math.ceil(g / 2);
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
    inject(DestroyRef).onDestroy(() => this.justTimer && clearTimeout(this.justTimer));
  }

  protected glassLabel(i: number): string {
    if (i < this.shown()) return this.i18n.t('water.glassFull', { n: i + 1 });
    return this.i18n.t('water.glassEmpty', { n: i + 1 });
  }

  /** an empty glass fills up to it; a full one empties, with the ones after it */
  protected tap(i: number): void {
    this.set(i < this.shown() ? i : i + 1);
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
    if (next >= this.goal() && before < this.goal()) this.toast.show(this.i18n.t('water.reached'));
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
