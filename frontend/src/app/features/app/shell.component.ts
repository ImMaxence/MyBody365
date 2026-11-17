import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, PLATFORM_ID, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppBadge } from '../../core/pwa/app-badge';
import { TodoStore } from '../../core/support/support-api';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, take } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { IconComponent } from '../../shared/icon.component';

/** where a back swipe has to start: the left edge of the screen, like iOS */
const EDGE = 28;
/** the phone's own back swipe starts within this strip: it is kept for the app's */
const NATIVE_EDGE = 20;
/** how far (share of the width) or how fast (px/ms) the screen must travel to go back */
const DISTANCE = 0.33;
const SPEED = 0.5;
/** the previous screen underneath: a little to the left and darker, as on iOS */
const UNDER_SHIFT = 0.28;
const UNDER_DIM = 0.82;
const SETTLE_MS = 280;
const SETTLE = `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.85, 0.25, 1), filter ${SETTLE_MS}ms cubic-bezier(0.2, 0.85, 0.25, 1)`;

/**
 * The installed app: screens above, the tab bar below (hidden on sign-in and onboarding). Screens
 * opened from a tab are pushed on a stack (core/nav/stack-navigation.ts); a swipe from the left edge
 * pops them, the screen following the finger over the previous one, as on iOS.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, TranslatePipe, IconComponent],
  host: {
    '(touchstart)': 'swipeStart($event)',
  },
  template: `
    <div id="main" class="screen" #screen>
      <router-outlet />
    </div>
    @if (showTabs()) {
      <nav class="tabbar" [attr.aria-label]="'nav.main' | t" [style.--i]="activeIndex()">
        <span class="indicator" [class.hidden]="activeIndex() < 0" aria-hidden="true"></span>
        @for (tab of tabs; track tab.path; let i = $index) {
          <a [routerLink]="tab.path" [replaceUrl]="true" [class.active]="activeIndex() === i" [attr.aria-current]="activeIndex() === i ? 'page' : null">
            <span class="ico">
              <app-icon [name]="tab.icon" [size]="23" [stroke]="activeIndex() === i ? 2.3 : 1.9" />
              @if (tab.path === '/app/account' && todo.profile()) {
                <span class="dot" aria-hidden="true"></span>
                <span class="sr-only">{{ 'todo.waiting' | t }}</span>
              }
            </span>
            <span class="lbl">{{ tab.label | t }}</span>
          </a>
        }
      </nav>
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }
    .screen {
      min-height: 100dvh;
      background: var(--bg);
    }
    /* the screen being left during a back swipe (a still copy, see lift()) */
    .swipe-ghost {
      position: fixed;
      left: 0;
      right: 0;
      z-index: 95;
      box-shadow: -12px 0 40px rgba(0, 0, 0, 0.28);
      pointer-events: none;
      will-change: transform;
    }
    /* a floating capsule; the highlight slides from tab to tab */
    .tabbar {
      /* captured on its own during screen transitions: it never slides */
      view-transition-name: tabbar;
      position: fixed;
      left: 50%;
      bottom: var(--tabbar-bottom);
      z-index: 100;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      width: min(calc(100% - 20px), 460px);
      height: var(--tabbar-h);
      padding: 5px;
      border-radius: 28px;
      transform: translateX(-50%);
      /* more covering than the other glass surfaces: the labels stay readable over any colour scrolling below */
      background: color-mix(in srgb, var(--surface) 88%, transparent);
      backdrop-filter: saturate(1.8) blur(22px);
      -webkit-backdrop-filter: saturate(1.8) blur(22px);
      border: 1px solid var(--glass-line);
      box-shadow:
        0 18px 40px -18px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
    .indicator {
      position: absolute;
      top: 5px;
      bottom: 5px;
      left: 5px;
      width: calc((100% - 10px) / 5);
      border-radius: 23px;
      background: var(--accent-soft);
      transform: translateX(calc(var(--i, 0) * 100%));
      transition:
        transform 520ms cubic-bezier(0.34, 1.4, 0.5, 1),
        opacity var(--dur-2);
    }
    .indicator.hidden {
      opacity: 0;
    }
    a {
      position: relative;
      z-index: 1;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 0;
      height: 100%;
      color: var(--fg-2);
      font-size: 10.5px;
      font-weight: 650;
      -webkit-tap-highlight-color: transparent;
      transition: color var(--dur-2);
    }
    .ico {
      display: grid;
      place-items: center;
      height: 26px;
      transition: transform var(--dur-1) var(--ease-out);
    }
    /* something waits in the profile (a passkey, the Drive backup, admin work) */
    .ico {
      position: relative;
    }
    .dot {
      position: absolute;
      top: 1px;
      right: -4px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #e5341c;
      box-shadow: 0 0 0 2px var(--surface);
      animation: dot-in 420ms cubic-bezier(0.34, 1.6, 0.5, 1) both;
    }
    @keyframes dot-in {
      from {
        transform: scale(0);
      }
    }
    a:active .ico {
      transform: scale(0.86);
    }
    a.active {
      color: var(--accent-text);
    }
    a.active .ico {
      animation: tab-pop 480ms cubic-bezier(0.34, 1.6, 0.5, 1);
    }
    @keyframes tab-pop {
      0% {
        transform: scale(0.7) translateY(3px);
      }
      60% {
        transform: scale(1.12) translateY(-2px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .indicator {
        transition: none;
      }
    }
  `,
})
export class ShellComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);
  protected readonly todo = inject(TodoStore);
  private readonly screen = viewChild.required<ElementRef<HTMLElement>>('screen');
  private readonly url = signal(this.router.url);

  protected readonly tabs = [
    { path: '/app', icon: 'home', label: 'nav.today', exact: true },
    { path: '/app/meals', icon: 'utensils', label: 'nav.meals', exact: false },
    { path: '/app/photos', icon: 'camera', label: 'nav.photos', exact: false },
    { path: '/app/progress', icon: 'chart', label: 'nav.progress', exact: false },
    { path: '/app/account', icon: 'user', label: 'nav.profile', exact: false },
  ];

  protected readonly showTabs = computed(() => {
    const url = this.url();
    const account = this.session.account();
    return account?.onboarded === true && account.profileComplete && !/^\/app\/(login|request|welcome|photos\/camera|meals\/scan)/.test(url);
  });

  /** the tab of the current screen (pushed screens belong to the tab they were opened from) */
  protected readonly activeIndex = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    if (/^\/app\/(account|admin)/.test(path)) return 4;
    if (path.startsWith('/app/progress')) return 3;
    if (path.startsWith('/app/photos')) return 2;
    if (path.startsWith('/app/meals')) return 1;
    return path === '/app' || path === '/app/' ? 0 : -1;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private swipe: { x: number; y: number; t: number; dx: number; locked: boolean } | null = null;
  /** during a swipe: the still copy of the screen being left, and how the app went back */
  private leaving: { ghost: HTMLElement; how: 'history' | 'opened' } | null = null;

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const destroy = inject(DestroyRef);
      const doc = inject(DOCUMENT);
      this.lockZoom(doc, destroy);
      this.blockNativeBack(doc, destroy);
      inject(AppBadge).watch(destroy);
      // the red dots: once signed in, then each time the app comes back (at most once a minute)
      let last = 0;
      const refresh = () => {
        if (!this.session.account()?.onboarded || Date.now() - last < 60_000) return;
        last = Date.now();
        void this.todo.refresh();
      };
      effect(() => {
        if (this.session.account()?.onboarded) untracked(refresh);
      });
      const onShow = () => doc.visibilityState === 'visible' && refresh();
      doc.addEventListener('visibilitychange', onShow);
      destroy.onDestroy(() => doc.removeEventListener('visibilitychange', onShow));
    }
  }

  /**
   * Like a phone app: no pinch, no double-tap zoom (the public site stays zoomable). The viewport says so,
   * the page refuses double taps (touch-action, base.css), and Safari's own pinch events are cancelled:
   * iOS ignores user-scalable=no on its own.
   */
  private lockZoom(doc: Document, destroy: DestroyRef): void {
    const root = doc.documentElement;
    root.classList.add('app-mode');
    const meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = meta?.content;
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    const cancel = (e: Event) => e.preventDefault();
    const options: AddEventListenerOptions = { passive: false };
    for (const type of ['gesturestart', 'gesturechange']) doc.addEventListener(type, cancel, options);
    destroy.onDestroy(() => {
      root.classList.remove('app-mode');
      if (meta && before) meta.content = before;
      for (const type of ['gesturestart', 'gesturechange']) doc.removeEventListener(type, cancel, options);
    });
  }

  /**
   * The phone's own back swipe (iOS) starts at the very edge: it moved the whole page, tab bar included,
   * over an empty grey screen, then this app animated the step back once more. It is turned off in the
   * app: a touch that starts there is kept for the app's swipe. A plain tap there still works.
   */
  private blockNativeBack(doc: Document, destroy: DestroyRef): void {
    let tap: { x: number; y: number; target: EventTarget | null } | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || t.clientX > NATIVE_EDGE) {
        tap = null;
        return;
      }
      if (e.cancelable) e.preventDefault();
      tap = { x: t.clientX, y: t.clientY, target: e.target };
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (tap && t && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10) tap = null;
    };
    // a cancelled touch start brings no click: the tap is passed on by hand
    const end = () => {
      const target = tap?.target as HTMLElement | null;
      tap = null;
      if (!(target instanceof HTMLElement)) return;
      const el = target.closest<HTMLElement>('a, button, input, select, textarea, label, summary, [role=button], [tabindex]') ?? target;
      if (el.matches('input:not([type=checkbox]):not([type=radio]), select, textarea')) el.focus();
      else el.click();
    };
    const active: AddEventListenerOptions = { passive: false };
    doc.addEventListener('touchstart', start, active);
    doc.addEventListener('touchmove', move, { passive: true });
    doc.addEventListener('touchend', end);
    destroy.onDestroy(() => {
      doc.removeEventListener('touchstart', start, active);
      doc.removeEventListener('touchmove', move);
      doc.removeEventListener('touchend', end);
    });
  }

  // ── back swipe ─────────────────────────────────────────────────────────────
  //
  // Like iOS: the screen follows the finger and the previous one is already there underneath, a little
  // to the left and darker. As soon as the drag starts, a still copy of the screen takes its place on top
  // and the app goes back for real underneath; let go far (or fast) enough and the copy leaves to the
  // right, otherwise it comes back and the app returns to the screen, without any animation.

  protected swipeStart(e: TouchEvent): void {
    const touch = e.touches[0];
    if (this.leaving || e.touches.length !== 1 || touch.clientX > EDGE || this.stack.depth() === 0) return;
    this.swipe = { x: touch.clientX, y: touch.clientY, t: e.timeStamp, dx: 0, locked: false };
    // the rest of the gesture is heard on the element touched: it still gets it once the screen it belonged
    // to has gone (the previous screen takes its place underneath as soon as the drag starts)
    const target = e.target;
    if (!target) return;
    const move = (ev: Event) => this.swipeMove(ev as TouchEvent);
    const end = (ev: Event) => {
      stop();
      this.swipeEnd(ev as TouchEvent);
    };
    const cancel = () => {
      stop();
      this.swipeCancel();
    };
    const stop = () => {
      target.removeEventListener('touchmove', move);
      target.removeEventListener('touchend', end);
      target.removeEventListener('touchcancel', cancel);
    };
    target.addEventListener('touchmove', move, { passive: false });
    target.addEventListener('touchend', end);
    target.addEventListener('touchcancel', cancel);
  }

  private swipeMove(e: TouchEvent): void {
    if (!this.swipe) return;
    const touch = e.touches[0];
    const dx = Math.max(0, touch.clientX - this.swipe.x);
    const dy = Math.abs(touch.clientY - this.swipe.y);
    if (!this.swipe.locked) {
      // a vertical scroll that happens to start at the edge is left alone
      if (dy > 10 && dy > dx) {
        this.swipe = null;
        return;
      }
      if (dx < 12) return;
      this.swipe.locked = true;
      this.lift();
    }
    if (e.cancelable) e.preventDefault();
    this.swipe.dx = dx;
    this.follow(dx);
  }

  private swipeEnd(e: TouchEvent): void {
    if (!this.swipe) return;
    const { dx, t, locked } = this.swipe;
    this.swipe = null;
    if (!locked || !this.leaving) return;
    const speed = dx / Math.max(1, e.timeStamp - t);
    this.settle(dx > window.innerWidth * DISTANCE || speed > SPEED);
  }

  /** the system took the touch: whatever was started is undone */
  private swipeCancel(): void {
    const locked = this.swipe?.locked;
    this.swipe = null;
    if (locked && this.leaving) this.settle(false);
  }

  /** the copy on top, the previous screen underneath */
  private lift(): void {
    const screen = this.screen().nativeElement;
    const ghost = screen.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.classList.add('swipe-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.top = `${-window.scrollY}px`;
    this.host.nativeElement.appendChild(ghost);
    screen.style.transition = 'none';
    this.leaving = { ghost, how: this.stack.back(undefined, true) };
  }

  private follow(dx: number): void {
    if (!this.leaving) return;
    const w = window.innerWidth;
    const p = Math.min(1, dx / w);
    const screen = this.screen().nativeElement;
    this.leaving.ghost.style.transform = `translateX(${dx}px)`;
    screen.style.transform = `translateX(${(-UNDER_SHIFT * w * (1 - p)).toFixed(1)}px)`;
    screen.style.filter = `brightness(${(UNDER_DIM + (1 - UNDER_DIM) * p).toFixed(3)})`;
  }

  /** let go: the copy leaves (back done) or comes back (the app returns to the screen) */
  private settle(back: boolean): void {
    const leaving = this.leaving;
    if (!leaving) return;
    const w = window.innerWidth;
    const screen = this.screen().nativeElement;
    leaving.ghost.style.transition = SETTLE;
    screen.style.transition = SETTLE;
    leaving.ghost.style.transform = `translateX(${back ? w : 0}px)`;
    screen.style.transform = back ? '' : `translateX(${-UNDER_SHIFT * w}px)`;
    screen.style.filter = back ? '' : `brightness(${UNDER_DIM})`;
    setTimeout(() => {
      if (back) {
        this.drop();
        return;
      }
      // the copy stays on top until the screen is there again
      this.router.events
        .pipe(
          filter((e) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
          take(1),
        )
        .subscribe(() => requestAnimationFrame(() => requestAnimationFrame(() => this.drop())));
      this.stack.undoBack(leaving.how);
      setTimeout(() => this.drop(), 1500);
    }, SETTLE_MS + 10);
  }

  private drop(): void {
    if (!this.leaving) return;
    this.leaving.ghost.remove();
    this.leaving = null;
    const screen = this.screen().nativeElement;
    screen.style.transition = '';
    screen.style.transform = '';
    screen.style.filter = '';
  }
}
