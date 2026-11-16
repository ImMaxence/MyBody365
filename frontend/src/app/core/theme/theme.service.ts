import { DOCUMENT, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'mb.theme';
const BAR = { light: '#f3f1ec', dark: '#0a0a0c' } as const;

/**
 * Light / dark / auto. "Auto" leaves <html> without data-theme so the CSS follows the system
 * (prefers-color-scheme) from the very first paint; a forced choice sets data-theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly mode = signal<ThemeMode>('system');
  private readonly systemDark = signal(false);
  readonly resolved = computed<'light' | 'dark'>(() =>
    this.mode() === 'system' ? (this.systemDark() ? 'dark' : 'light') : (this.mode() as 'light' | 'dark'),
  );

  constructor() {
    if (this.browser) {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      this.systemDark.set(mq.matches);
      mq.addEventListener('change', (e) => this.systemDark.set(e.matches));
      this.mode.set(this.read());
    }
    effect(() => this.apply());
  }

  /**
   * @param origin the button pressed: the new theme grows from it in a circle (view transition)
   */
  set(mode: ThemeMode, origin?: Element | null): void {
    const before = this.resolved();
    const commit = () => {
      this.mode.set(mode);
      try {
        localStorage.setItem(KEY, mode);
      } catch {
        /* storage blocked */
      }
      this.apply();
    };
    const doc = this.document as Document & { startViewTransition?: (cb: () => void) => ViewTransition };
    const view = this.document.defaultView;
    const reduced = view?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const after = mode === 'system' ? (this.systemDark() ? 'dark' : 'light') : mode;
    if (!this.browser || !doc.startViewTransition || reduced || after === before || !view) {
      commit();
      return;
    }
    let x = view.innerWidth / 2;
    let y = 40;
    if (origin) {
      const r = origin.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    const radius = Math.hypot(Math.max(x, view.innerWidth - x), Math.max(y, view.innerHeight - y));
    const root = this.document.documentElement;
    root.classList.add('theming');
    const transition = doc.startViewTransition(commit);
    transition.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 680, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', pseudoElement: '::view-transition-new(root)' },
        ),
      )
      .catch(() => undefined);
    transition.finished.finally(() => root.classList.remove('theming'));
  }

  private apply(): void {
    const root = this.document.documentElement;
    const mode = this.mode();
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    const color = BAR[this.resolved()];
    this.document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      if (mode === 'system') {
        // keep the two media-specific tags of index.html
        m.setAttribute('content', m.getAttribute('media')?.includes('dark') ? BAR.dark : BAR.light);
      } else {
        m.setAttribute('content', color);
      }
    });
  }

  private read(): ThemeMode {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }
}
