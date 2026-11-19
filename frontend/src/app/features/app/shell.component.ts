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
import { Outbox } from '../../core/offline/outbox';
import { TimerRun } from '../../core/engage/timer-run';
import { MilestoneCelebrationComponent } from './milestone-celebration.component';
import { ToastService } from '../../core/ui/toast.service';
import { ShoppingStore } from '../../core/meals/shopping.store';

/** how far (share of the width) or how fast (px/ms, the last moves) the screen must travel to go back */
const DISTANCE = 0.4;
const SPEED = 0.45;
/** the previous screen underneath: a little to the left and darker, as on iOS (navigation.css too) */
const UNDER_SHIFT = 0.3;
const UNDER_DIM = 0.86;
const SETTLE_MS = 340;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SETTLE = `transform ${SETTLE_MS}ms ${EASE}, filter ${SETTLE_MS}ms ${EASE}`;

/**
 * The installed app: screens above, the tab bar below (hidden on sign-in and onboarding). Screens
 * opened from a tab are pushed on a stack (core/nav/stack-navigation.ts); a swipe from the left edge
 * pops them, the screen following the finger over the previous one, as on iOS.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, TranslatePipe, IconComponent, MilestoneCelebrationComponent],
  template: `
    <div id="main" class="screen" #screen>
      <router-outlet />
    </div>
    @if (shield()) {
      <!-- under the status bar: a solid band of the page colour, so that nothing scrolls under the time and the
           battery (iOS 26 blurs what passes there, with no setting to turn it off) -->
      <div class="status-shield" aria-hidden="true"></div>
    }
    <!-- the left edge: the back swipe (see edgeStart) -->
    <!-- a milestone reached by the weigh-in just noted, wherever it was noted -->
    <app-milestone-celebration />
    <div class="edge" aria-hidden="true" (touchstart)="edgeStart($event)" (touchmove)="edgeMove($event)" (touchend)="edgeEnd($event)"
      (touchcancel)="edgeCancel()"></div>
    @if (showTabs() && (outbox.pending().length || timerAway())) {
      <div class="floating" [class.low]="tabsAway()">
        @if (timerAway()) {
          <!-- the workout timer goes on while one looks at something else: one tap back to it -->
          <a class="timer-pill" routerLink="/app/timer" [attr.data-phase]="timer.state() === 'paused' ? 'paused' : timer.phase()"
            [attr.aria-label]="'engage.timer.pill' | t: { phase: timerLabel(), time: clockOf(timer.shown()) }">
            <app-icon [name]="timer.state() === 'paused' ? 'pause' : 'timer'" [size]="16" />
            <span>{{ timerLabel() }}</span>
            <b class="num">{{ clockOf(timer.shown()) }}</b>
          </a>
        }
        @if (outbox.pending().length; as n) {
          <!-- noted without network: it goes as soon as the network is back -->
          <p class="outbox" role="status"><app-icon name="cloud" [size]="15" /> {{ (n === 1 ? 'offline.one' : 'offline.many') | t: { n: n } }}</p>
        }
      </div>
    }
    @if (showTabs()) {
      <!-- 1.13: out of the way while scrolling down a page, back as soon as one scrolls up (as YouTube's) -->
      <nav class="tabbar" [attr.aria-label]="'nav.main' | t" [style.--i]="activeIndex()" (focusin)="revealTabs()">
        <span class="indicator" [class.hidden]="activeIndex() < 0" aria-hidden="true"></span>
        @for (tab of tabs; track tab.path; let i = $index) {
          <a [routerLink]="tab.path" [replaceUrl]="true" [class.active]="activeIndex() === i" [attr.aria-current]="activeIndex() === i ? 'page' : null">
            <span class="ico">
              <app-icon [name]="tab.icon" [size]="23" [stroke]="activeIndex() === i ? 2.3 : 1.9" />
              <!-- 1.12: a red dot on each tab where something waits (Profile, Today, Meals, Photos) -->
              @if (waiting(tab.path)) {
                <span class="dot" aria-hidden="true"></span>
              }
            </span>
            <span class="lbl">{{ tab.label | t }}</span>
            @if (waiting(tab.path)) {
              <span class="sr-only">{{ 'todo.tabWaiting' | t }}</span>
            }
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
    /* the app opening: the first screen fades in (later screens have their transitions) */
    #main {
      animation: app-in 420ms ease-out backwards;
    }
    @keyframes app-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    .floating {
      position: fixed;
      left: 0;
      right: 0;
      bottom: calc(var(--tabbar-bottom) + var(--tabbar-h) + 10px - var(--vv-stuck, 0px));
      z-index: 96;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }
    .timer-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: var(--radius-pill);
      background: var(--accent);
      color: #fff;
      box-shadow: var(--shadow-1);
      font-size: var(--fs-s);
      font-weight: 650;
      text-decoration: none;
      pointer-events: auto;
      animation: pill-in 260ms var(--ease-out) both;
    }
    .timer-pill[data-phase='rest'] {
      background: var(--cool);
    }
    .timer-pill[data-phase='paused'] {
      background: var(--surface);
      color: var(--fg-1);
      box-shadow: var(--shadow-1), inset 0 0 0 1px var(--line);
    }
    .timer-pill b {
      font-variant-numeric: tabular-nums;
    }
    @keyframes pill-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .timer-pill {
        animation: none;
      }
    }
    .outbox {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      padding: 6px 12px;
      border-radius: var(--radius-pill);
      background: var(--surface);
      box-shadow: var(--shadow-1), inset 0 0 0 1px var(--line);
      color: var(--fg-2);
      font-size: var(--fs-s);
      font-weight: 650;
      white-space: nowrap;
      pointer-events: none;
    }
    .status-shield {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 97;
      height: var(--safe-top);
      background: var(--bg);
      pointer-events: none;
    }
    /* the left edge of the screen: where a back swipe starts (above the screens, under the tab bar) */
    .edge {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 99;
      width: 20px;
      touch-action: none;
    }
    /* the screen being left during a back swipe (a still copy, see lift()) */
    .swipe-ghost {
      position: fixed;
      left: 0;
      right: 0;
      z-index: 95;
      box-shadow: -6px 0 24px rgba(0, 0, 0, 0.16);
      pointer-events: none;
      will-change: transform;
    }
    /* a floating capsule; the highlight slides from tab to tab */
    .tabbar {
      /* captured on its own during screen transitions: it never slides */
      view-transition-name: tabbar;
      position: fixed;
      left: 50%;
      /* --vv-stuck: iOS keeping the page as short as with the keyboard (core/ui/sheets.ts) */
      bottom: calc(var(--tabbar-bottom) - var(--vv-stuck, 0px));
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
    /* 1.14: the capsule follows the scroll (--tab-y, written frame by frame), then settles with a gentle ease */
    .tabbar {
      transform: translate(-50%, var(--tab-y, 0px));
      transition: opacity 200ms ease;
      will-change: transform;
    }
    .tabbar.snap {
      transition:
        transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
        opacity 200ms ease;
    }
    .tabbar.away {
      pointer-events: none;
    }
    .floating {
      transition: bottom 420ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .floating.low {
      bottom: calc(var(--tabbar-bottom) + 10px - var(--vv-stuck, 0px));
    }
    /* the keyboard is up: out of the way */
    :host-context(.keyboard-open) .tabbar {
      opacity: 0;
      pointer-events: none;
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
  protected readonly outbox = inject(Outbox);
  protected readonly timer = inject(TimerRun);
  /** a run of the timer goes on, and its screen is not the one shown */
  protected readonly timerAway = computed(() => this.timer.active() && !this.url().startsWith('/app/timer'));
  protected readonly timerLabel = computed(() => this.i18n.t(this.timer.state() === 'paused' ? 'engage.timer.paused' : 'engage.timer.' + this.timer.phase()));

  protected clockOf(s: number): string {
    const v = Math.max(0, Math.ceil(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  }
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);
  protected readonly todo = inject(TodoStore);
  private readonly screen = viewChild.required<ElementRef<HTMLElement>>('screen');
  private readonly url = signal(this.router.url);
  /** 1.13: the tab bar slid away while scrolling down (back on the way up, at the top, on a new screen) */
  protected readonly tabsAway = signal(false);
  /** brings the tab bar back (set by hideOnScroll in the browser) */
  protected revealTabs: () => void = () => undefined;
  private dotsAt = 0;

  protected readonly tabs = [
    { path: '/app', icon: 'home', label: 'nav.today', exact: true },
    { path: '/app/meals', icon: 'utensils', label: 'nav.meals', exact: false },
    { path: '/app/photos', icon: 'camera', label: 'nav.photos', exact: false },
    { path: '/app/progress', icon: 'chart', label: 'nav.progress', exact: false },
    { path: '/app/account', icon: 'user', label: 'nav.profile', exact: false },
  ];

  private readonly shopping = inject(ShoppingStore);
  /** the lines of the shopping list not in the basket: the list itself once loaded (it changes as one ticks), else the server's count */
  private readonly shoppingLeft = computed(() => (this.shopping.list() ? this.shopping.left() : (this.todo.todo()?.shoppingLeft ?? 0)));

  /** something waits behind this tab */
  protected waiting(path: string): boolean {
    switch (path) {
      case '/app/account':
        return this.todo.profile();
      case '/app':
        return this.todo.today();
      case '/app/meals':
        return this.shoppingLeft() > 0;
      case '/app/photos':
        return this.todo.photos();
      default:
        return false;
    }
  }

  protected readonly showTabs = computed(() => {
    const url = this.url();
    const account = this.session.account();
    return account?.onboarded === true && account.profileComplete && !/^\/app\/(login|request|welcome|photos\/camera|meals\/scan)/.test(url);
  });

  /** the band under the status bar: everywhere but the full-screen camera */
  protected readonly shield = computed(() => !/^\/app\/(photos\/camera|meals\/scan)/.test(this.url()));

  /** the tab of the current screen (pushed screens belong to the tab they were opened from) */
  protected readonly activeIndex = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    if (/^\/app\/(account|admin)/.test(path)) return 4;
    if (path.startsWith('/app/progress')) return 3;
    if (path.startsWith('/app/photos')) return 2;
    if (path.startsWith('/app/meals')) return 1;
    // Today, and the screens opened from it (the timer, the friends and their challenges)
    return path === '/app' || path === '/app/' || /^\/app\/(timer|friends|challenges)(\/|$)/.test(path) ? 0 : -1;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private swipe: {
    x: number;
    y: number;
    t: number;
    lastX: number;
    lastT: number;
    /** px/ms, smoothed over the last moves */
    speed: number;
    dx: number;
    moved: boolean;
    locked: boolean;
    /** a back swipe may start (a pushed screen, nothing settling) */
    armed: boolean;
  } | null = null;
  private readonly doc = inject(DOCUMENT);
  /** during a swipe: the still copy of the screen being left, and how the app went back */
  private leaving: { ghost: HTMLElement; how: 'history' | 'opened' } | null = null;

  constructor() {
    // sent later and refused by the server (rare: a day too far, a food deleted meanwhile): said once
    this.outbox.refused.pipe(takeUntilDestroyed()).subscribe(() => this.toastService.error(this.i18n.t('offline.refused')));
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.url.set(e.urlAfterRedirects);
        // 1.12: back on a tab, the dots catch up with what was just done (a photo taken, a request answered)
        if (this.stack.depth() === 0 && this.session.account()?.onboarded && Date.now() - this.dotsAt > 8_000) {
          this.dotsAt = Date.now();
          void this.todo.refresh();
        }
      });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const destroy = inject(DestroyRef);
      const doc = inject(DOCUMENT);
      this.lockZoom(doc, destroy);
      this.hideOnScroll(doc, destroy);
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
   * 1.13, reworked in 1.14: like YouTube's, the tab bar follows the scroll. Scrolling down a page pushes it below the
   * screen at half the speed of the page, scrolling up brings it back the same way, and when the scroll stops it settles
   * shown or hidden, whichever is closer. It is always there near the top of a page and on a new screen. Only the member's
   * own scrolling counts (a finger, a wheel, the keys, and the momentum after the finger): the scroll a screen is put back
   * to, or a field brought into view, moves nothing; the rubber band of iOS beyond either end is not a direction. The bar
   * is moved by a CSS variable written on its element, frame by frame, without going through Angular.
   */
  private hideOnScroll(doc: Document, destroy: DestroyRef): void {
    const win = doc.defaultView;
    if (!win) return;
    let lastY = win.scrollY;
    let offset = 0;
    let quietUntil = 0;
    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let userUntil = 0;
    const mark = (ms: number) => () => (userUntil = Math.max(userUntil, Date.now() + ms));
    const onMove = mark(600);
    const onKey = mark(800);
    // the momentum after the finger goes on for a while: it still counts
    const onEnd = () => {
      mark(1500)();
      settleSoon();
    };
    const bar = () => doc.querySelector<HTMLElement>('nav.tabbar');
    /** how far the bar goes to leave the screen: its height and the gap under it, and a little more for its shadow */
    const range = () => {
      const b = bar();
      if (!b) return 120;
      return Math.max(60, win.innerHeight - b.getBoundingClientRect().top + Math.max(0, offset) + 16);
    };
    const paint = (snap: boolean) => {
      const b = bar();
      if (!b) return;
      b.classList.toggle('snap', snap);
      b.style.setProperty('--tab-y', offset.toFixed(1) + 'px');
      const away = offset >= range() * 0.6;
      b.classList.toggle('away', away);
      if (this.tabsAway() !== away) this.tabsAway.set(away);
    };
    const settle = () => {
      settleTimer = null;
      const r = range();
      if (offset > 0 && offset < r) {
        offset = offset > r / 2 ? r : 0;
        paint(true);
      }
    };
    function settleSoon(): void {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 160);
    }
    const show = () => {
      if (offset === 0) return;
      offset = 0;
      paint(true);
    };
    const read = () => {
      frame = 0;
      const max = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
      const raw = win.scrollY;
      const y = Math.min(Math.max(raw, 0), max);
      const d = y - lastY;
      lastY = y;
      if (Date.now() < quietUntil || this.stack.busy()) return;
      // near the top of a page, or pulled beyond it: always there
      if (raw < 56) {
        show();
        return;
      }
      // beyond the bottom (the rubber band), or a scroll the member did not make: nothing moves
      if (raw > max || Date.now() > userUntil || d === 0) return;
      offset = Math.min(range(), Math.max(0, offset + d * 0.5));
      paint(false);
      settleSoon();
    };
    const onScroll = () => {
      if (!frame) frame = win.requestAnimationFrame(read);
    };
    win.addEventListener('scroll', onScroll, { passive: true });
    win.addEventListener('touchmove', onMove, { passive: true });
    win.addEventListener('wheel', onMove, { passive: true });
    win.addEventListener('touchend', onEnd, { passive: true });
    win.addEventListener('keydown', onKey);
    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      // a new screen: the bar is there, and the scroll it is put back to says nothing
      quietUntil = Date.now() + 700;
      lastY = win.scrollY;
      show();
    });
    // a keyboard user tabbing to it: back
    this.revealTabs = () => show();
    // the toasts come down with it
    effect(() => doc.documentElement.classList.toggle('tabs-away', this.tabsAway()));
    destroy.onDestroy(() => {
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('touchmove', onMove);
      win.removeEventListener('wheel', onMove);
      win.removeEventListener('touchend', onEnd);
      win.removeEventListener('keydown', onKey);
      if (frame) win.cancelAnimationFrame(frame);
      if (settleTimer) clearTimeout(settleTimer);
      sub.unsubscribe();
      doc.documentElement.classList.remove('tabs-away');
    });
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

  // ── back swipe ─────────────────────────────────────────────────────────────
  //
  // Like iOS: a touch that starts on the left edge (the invisible strip .edge) drags the screen to the right,
  // with the previous screen already there underneath, a little to the left and darker. The strip keeps the
  // whole gesture: it never leaves the page, even when the screen under the finger does (as soon as the drag
  // starts, a still copy of the screen takes its place on top and the app goes back for real underneath).
  // Let go far or fast enough and the copy leaves to the right; otherwise it comes back and the app returns
  // to the screen, without any animation. The strip also keeps the phone's own back swipe away (it showed
  // an empty grey screen, then this app animated once more), and passes a plain tap on to what is below.

  protected edgeStart(e: TouchEvent): void {
    const touch = e.touches[0];
    if (e.cancelable) e.preventDefault();
    this.swipe = {
      x: touch.clientX,
      y: touch.clientY,
      t: e.timeStamp,
      lastX: touch.clientX,
      lastT: e.timeStamp,
      speed: 0,
      dx: 0,
      moved: false,
      locked: false,
      armed: e.touches.length === 1 && !this.leaving && !this.stack.busy() && this.stack.depth() > 0,
    };
  }

  protected edgeMove(e: TouchEvent): void {
    const s = this.swipe;
    if (!s) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    const dx = Math.max(0, touch.clientX - s.x);
    const dy = Math.abs(touch.clientY - s.y);
    if (Math.hypot(touch.clientX - s.x, touch.clientY - s.y) > 8) s.moved = true;
    // the speed of the last moves (a flick goes back even when short)
    const dt = Math.max(1, e.timeStamp - s.lastT);
    s.speed = 0.6 * s.speed + 0.4 * ((touch.clientX - s.lastX) / dt);
    s.lastX = touch.clientX;
    s.lastT = e.timeStamp;
    if (!s.armed) return;
    if (!s.locked) {
      // a vertical move that happens to start at the edge is not a back swipe
      if (dy > 12 && dy > dx) {
        s.armed = false;
        return;
      }
      if (dx < 10) return;
      s.locked = true;
      this.lift();
    }
    s.dx = dx;
    this.follow(dx);
  }

  protected edgeEnd(e: TouchEvent): void {
    const s = this.swipe;
    this.swipe = null;
    if (!s) return;
    if (s.locked && this.leaving) {
      // a flick: still moving fast when the finger lifts (held still first, it is not one)
      const flick = e.timeStamp - s.lastT < 90 && s.speed > SPEED;
      this.settle(s.dx > window.innerWidth * DISTANCE || flick);
      return;
    }
    // a plain tap on the edge: to what is under it
    if (!s.moved) this.tapThrough(s.x, s.y, e.target as HTMLElement);
  }

  /** the system took the touch: whatever was started is undone */
  protected edgeCancel(): void {
    const s = this.swipe;
    this.swipe = null;
    if (s?.locked && this.leaving) this.settle(false);
  }

  private tapThrough(x: number, y: number, strip: HTMLElement): void {
    const below = this.doc.elementsFromPoint(x, y).find((el) => el !== strip && !strip.contains(el)) as HTMLElement | undefined;
    if (!below) return;
    const el = below.closest<HTMLElement>('a, button, input, select, textarea, label, summary, [role=button], [tabindex]') ?? below;
    if (el.matches('input:not([type=checkbox]):not([type=radio]), select, textarea')) el.focus();
    else el.click();
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
