import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { haptic } from '../../core/ui/haptics';

/** how far the finger must pull (after the resistance) to refresh */
const ARMED_AT = 64;
/** where the spinner rests while refreshing */
const REST_AT = 52;
/** the spinner shows at least this long, so that a quick answer still reads as « done » */
const MIN_SPIN_MS = 650;

/**
 * 1.18: pull to refresh, as in a phone app: on a tab at the top of its screen, a pull down brings a circle that fills as
 * the finger goes; let go once it is full and the tab asks the server again (the circle turns until it has answered). On
 * an iPhone the page bounces by itself under the finger: the circle sits in the space it leaves. Never in a sheet, on a
 * pushed screen, or from the left edge (the back swipe).
 */
@Component({
  selector: 'app-pull-refresh',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pull() > 0 || busy() || leaving()) {
      <div class="ptr" [class.busy]="busy()" [class.armed]="armed()" [class.dragging]="pull() > 0 && !busy()" [style.--pull]="shown()" aria-hidden="true">
        <svg viewBox="0 0 36 36" width="34" height="34">
          <circle class="track" cx="18" cy="18" r="13" />
          <circle class="arc" cx="18" cy="18" r="13" [style.stroke-dashoffset]="dash()" />
        </svg>
      </div>
    }
    @if (busy()) {
      <span class="sr-only" role="status">{{ label() }}</span>
    }
  `,
  styles: `
    .ptr {
      position: fixed;
      top: calc(var(--safe-top) + 6px);
      left: 50%;
      z-index: 98;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow: var(--shadow-1), inset 0 0 0 1px var(--line);
      color: var(--accent);
      transform: translate(-50%, calc(var(--pull) * 1px - 46px)) scale(calc(0.6 + min(var(--pull), 64) / 160));
      opacity: calc(min(var(--pull), 48) / 48);
      pointer-events: none;
    }
    .ptr:not(.dragging) {
      transition:
        transform 320ms cubic-bezier(0.32, 0.72, 0, 1),
        opacity 200ms ease;
    }
    .track {
      fill: none;
      stroke: color-mix(in srgb, var(--accent) 18%, transparent);
      stroke-width: 3;
    }
    .arc {
      fill: none;
      stroke: currentColor;
      stroke-width: 3;
      stroke-linecap: round;
      stroke-dasharray: 81.7;
      transform: rotate(-90deg);
      transform-origin: 50% 50%;
    }
    .armed .arc {
      stroke-width: 3.4;
    }
    .busy svg {
      animation: ptr-spin 0.8s linear infinite;
    }
    .busy .arc {
      stroke-dashoffset: 58 !important;
    }
    @keyframes ptr-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .busy svg {
        animation-duration: 2s;
      }
    }
  `,
})
export class PullRefreshComponent {
  /** whether a pull may start now (a tab, at its top, nothing open on it) */
  readonly allowed = input<() => boolean>(() => false);
  /** what a refresh does: resolved once the server has answered */
  readonly run = input<() => Promise<unknown>>(() => Promise.resolve());
  /** said to screen readers while it turns */
  readonly label = input('');
  protected readonly pull = signal(0);
  protected readonly armed = signal(false);
  protected readonly busy = signal(false);
  /** where the circle is drawn: the finger's pull, or its resting place while it turns */
  protected readonly shown = computed(() => (this.busy() ? REST_AT : this.pull()));
  protected readonly dash = computed(() => (81.7 * (1 - Math.min(1, this.pull() / ARMED_AT))).toFixed(1));
  /** let go before it was full, or done: the circle goes back up before it is removed */
  protected readonly leaving = signal(false);
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  private leave(): void {
    this.leaving.set(true);
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => this.leaving.set(false), 340);
  }
  private readonly doc = inject(DOCUMENT);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const win = this.doc.defaultView;
    if (!win) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const start = (e: TouchEvent) => {
      tracking = false;
      if (this.busy() || e.touches.length !== 1 || win.scrollY > 0) return;
      const t = e.touches[0];
      // the left edge is the back swipe's; a sheet or a field keeps its own gestures
      if (t.clientX < 28 || this.doc.querySelector('dialog[open]') || !this.allowed()()) return;
      const target = e.target as Element | null;
      if (target?.closest('input, textarea, select, [contenteditable], .slide-chips, .no-pull')) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };
    const move = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      // a sideways move (a meal line swiped, a carousel) is not a pull
      if (this.pull() === 0 && dx > 8 && dx > Math.abs(dy)) {
        tracking = false;
        return;
      }
      // an iPhone bounces past the top by itself (scrollY below 0): that counts as much as the finger's way
      const d = Math.max(0, dy * 0.5, -win.scrollY);
      if (dy < -4 && this.pull() === 0) {
        tracking = false;
        return;
      }
      this.pull.set(Math.min(110, d));
      const armed = d >= ARMED_AT;
      if (armed && !this.armed()) haptic('soft');
      this.armed.set(armed);
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      const go = this.armed();
      this.armed.set(false);
      if (go) void this.refresh();
      // pulled a little, then let go: back up (a plain tap at the top drew nothing)
      else if (this.pull() > 0) this.leave();
      this.pull.set(0);
    };
    const opts: AddEventListenerOptions = { passive: true };
    win.addEventListener('touchstart', start, opts);
    win.addEventListener('touchmove', move, opts);
    win.addEventListener('touchend', end, opts);
    win.addEventListener('touchcancel', end, opts);
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('touchstart', start);
      win.removeEventListener('touchmove', move);
      win.removeEventListener('touchend', end);
      win.removeEventListener('touchcancel', end);
    });
  }

  /** also from a tap on the tab already open, at the top of its screen */
  async refresh(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const t0 = Date.now();
    try {
      await this.run()();
    } catch {
      /* the screens say what failed */
    }
    const left = MIN_SPIN_MS - (Date.now() - t0);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    this.leave();
    this.busy.set(false);
  }
}
