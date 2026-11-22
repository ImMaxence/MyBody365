import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * A short vibration (1.9): a glass of water, the timer's buttons and its changes of phase.
 *
 * Android has the Vibration API. iPhone has none: Safari only plays its haptic when a switch
 * (`<input type="checkbox" switch>`, iOS 17.4+) is flipped. Flipping a hidden one from script worked up to
 * iOS 26.4, Apple stopped it in 26.5. So the buttons that should vibrate carry a real switch on top of them
 * (HapticDirective): the finger flips it, the phone vibrates, and the tap goes on to the button. What happens
 * without a tap (the end of a rest) vibrates on Android, and on the iPhones that still allow the script way.
 */
export type HapticKind = 'tap' | 'soft' | 'success' | 'work' | 'rest' | 'done';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 12,
  soft: 8,
  success: [16, 70, 28],
  work: [120, 60, 120],
  rest: 200,
  done: [200, 80, 200, 80, 400],
};

/** how many taps of the switch stand for each kind (iPhone: one tick each) */
const TICKS: Record<HapticKind, number> = { tap: 1, soft: 1, success: 2, work: 2, rest: 1, done: 3 };

function win(): (Window & typeof globalThis) | null {
  return typeof window === 'undefined' ? null : window;
}

export function isIos(): boolean {
  const nav = win()?.navigator;
  if (!nav) return false;
  return /iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/** the Vibration API alone (Android): false when there is none */
function vibrate(kind: HapticKind): boolean {
  const nav = win()?.navigator;
  if (typeof nav?.vibrate !== 'function') return false;
  try {
    nav.vibrate(PATTERNS[kind]);
  } catch {
    /* refused (no tap yet): nothing */
  }
  return true;
}

/** the script way on iPhone (iOS 17.4 to 26.4): a hidden switch flipped by a click on its label */
function iosTick(): void {
  const doc = win()?.document;
  if (!doc) return;
  const label = doc.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  const box = doc.createElement('input');
  box.type = 'checkbox';
  box.setAttribute('switch', '');
  label.appendChild(box);
  doc.head.appendChild(label);
  label.click();
  label.remove();
}

/** a vibration not tied to a tap (the timer's phases): Android, and the older iPhones */
export function haptic(kind: HapticKind = 'tap'): void {
  if (vibrate(kind)) return;
  if (!isIos()) return;
  const n = TICKS[kind];
  for (let i = 0; i < n; i++) setTimeout(iosTick, i * 110);
}

/**
 * On a switch placed right after a button, inside a `.haptic` box (styles/components.css). On iPhone the switch lies
 * over the button, the finger flips it (the phone vibrates), and the tap is handed to the button. Elsewhere the switch
 * stays hidden and the button's own tap vibrates (the Vibration API, Android). The button stays the control for the
 * keyboard and the screen readers; the switch is hidden from them.
 *
 * <span class="haptic"><button type="button" (click)="add()">+</button><input appHaptic /></span>
 */
@Directive({
  selector: 'input[appHaptic]',
  host: {
    type: 'checkbox',
    switch: '',
    tabindex: '-1',
    'aria-hidden': 'true',
    class: 'haptic-switch',
    '(click)': 'tap($event)',
  },
})
export class HapticDirective {
  /** the vibration on Android (the iPhone's is the switch's own) */
  readonly appHaptic = input<HapticKind | ''>('');
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const input = this.el.nativeElement;
      if (isIos()) return;
      // no switch needed: the button itself vibrates
      input.hidden = true;
      const target = input.previousElementSibling as HTMLElement | null;
      const onTap = () => vibrate(this.appHaptic() || 'tap');
      target?.addEventListener('click', onTap);
      destroy.onDestroy(() => target?.removeEventListener('click', onTap));
    });
  }

  protected tap(e: Event): void {
    e.stopPropagation();
    const target = this.el.nativeElement.previousElementSibling as HTMLButtonElement | null;
    if (!target || target.disabled) return;
    vibrate(this.appHaptic() || 'tap');
    target.click();
  }
}
