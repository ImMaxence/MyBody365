import {
  DOCUMENT,
  Injectable,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  ActivatedRouteSnapshot,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  ResolveEnd,
  Router,
  ViewTransitionInfo,
} from '@angular/router';

/**
 * Native-app navigation: every screen of the app has a depth in route data (`depth`: 0 for the tab
 * roots, 1 for a screen opened from them…) and, when it is deeper than 0, the screen to go back to
 * (`back`). Going deeper pushes the new screen from the right, going back pops it to the right,
 * staying at the same depth (tabs) cross-fades.
 *
 * 1.12.1: inside the app, the app draws these transitions itself (StackNavigation.lift / animate), as the edge swipe
 * does: a still copy of the screen being left slides or fades while the new screen arrives, under the real tab bar.
 * The browser's view transitions (still used by the public site, styles/navigation.css) misplace what is fixed on
 * Safari: the tab bar showed up in the middle of the screen, or not at all, during a push.
 */
export type NavKind = 'push' | 'pop' | 'fade' | 'page';

export function deepest(snapshot: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let s = snapshot;
  while (s.firstChild) s = s.firstChild;
  return s;
}

/** the closest value of a route data key, from the deepest route up */
function dataOf<T>(snapshot: ActivatedRouteSnapshot, key: string): T | undefined {
  for (let s: ActivatedRouteSnapshot | null = deepest(snapshot); s; s = s.parent) {
    if (s.data[key] !== undefined) return s.data[key] as T;
  }
  return undefined;
}

export function depthOf(snapshot: ActivatedRouteSnapshot): number {
  return dataOf<number>(snapshot, 'depth') ?? 0;
}

export function navKind(fromDepth: number, toDepth: number): NavKind {
  if (toDepth > fromDepth) return 'push';
  if (toDepth < fromDepth) return 'pop';
  return 'fade';
}

/** the path of a router state, without query nor fragment */
function pathOf(snapshot: ActivatedRouteSnapshot): string {
  return deepest(snapshot)
    .pathFromRoot.flatMap((s) => s.url.map((u) => u.path))
    .join('/');
}

/** tabs that switch in place (the admin area, the legal documents): no page animation between them */
const TAB_GROUPS = ['app/admin', 'legal', 'en/legal'];

function sameTabGroup(from: string, to: string): boolean {
  return TAB_GROUPS.some(
    (g) => (from === g || from.startsWith(g + '/')) && (to === g || to.startsWith(g + '/')),
  );
}

function inApp(snapshot: ActivatedRouteSnapshot): boolean {
  return snapshot.firstChild?.routeConfig?.path === 'app';
}

/** Router hook (withViewTransitions): picks the animation of each navigation inside the app. */
export function onViewTransitionCreated(info: ViewTransitionInfo): void {
  const doc = inject(DOCUMENT);
  const stack = inject(StackNavigation);
  const reduced = doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fromApp = inApp(info.from);
  const toApp = inApp(info.to);
  // between the public site and the app: a plain switch; an anchor of the same page (#parcours): only the scroll
  const from = pathOf(info.from);
  const to = pathOf(info.to);
  // the edge swipe animates by itself, and so does the browser's own back gesture: never twice
  const silent = stack.takeSilent();
  if (silent || reduced || fromApp !== toApp || from === to || sameTabGroup(from, to)) {
    info.transition.skipTransition();
    return;
  }
  const root = doc.documentElement;
  // the public site: page to page; the app: like a phone app
  const kind = toApp ? navKind(depthOf(info.from), depthOf(info.to)) : 'page';
  root.dataset['nav'] = kind;
  info.transition.finished.finally(() => {
    delete root.dataset['nav'];
  });
}

/** "Back" like a phone app, and what the edge swipe needs for it. */
@Injectable({ providedIn: 'root' })
export class StackNavigation {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  /** the next navigation shows no screen transition */
  private silent = false;
  /** where each screen of the history was scrolled to (by navigation id), and where the one coming back goes */
  private readonly positions = new Map<number, number>();
  private lastId = 0;
  private restoreTo: number | null = null;
  private restoring: (() => void) | null = null;
  /**
   * The screens of the history as this session went through them (navigation id, path) and where it stands: enough
   * to go back several screens at once, never past the first one of the session.
   */
  private trail: { id: number; path: string }[] = [];
  private at = -1;
  private next: { how: 'push' | 'replace' | 'pop'; to: number } = { how: 'push', to: 0 };
  /** 1.12.1: the navigation under way is the app's (inside the app, from one screen to another) */
  private own = false;
  /** the browser's view transition, kept from the app's navigations */
  private vtOff = false;
  /** the still copy of the screen being left, while it goes, and what it came from */
  private ghost: { el: HTMLElement; depth: number; path: string; anims: Animation[] } | null = null;

  constructor() {
    // 1.12: the browser keeps its hands off the scroll. Left to itself ('auto', what the router leaves when its own
    // restoration is disabled), it scrolled the screen being left to where the previous one had been, on the very
    // popstate, before the transition took its picture: the whole screen jumped up, then slid away.
    if (this.browser && this.doc.defaultView?.history)
      this.doc.defaultView.history.scrollRestoration = 'manual';
    // the browser animated this step back itself (its own swipe): no second animation on top
    this.doc.defaultView?.addEventListener('popstate', (e) => {
      if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition)
        this.silent = true;
    });
    // a navigation that never happened does not keep the flag for the next one
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.leaving(e);
      if (e instanceof ResolveEnd && this.own) this.lift();
      if (e instanceof NavigationEnd) this.arrived(e);
      if (
        e instanceof NavigationCancel ||
        e instanceof NavigationError ||
        e instanceof NavigationSkipped
      ) {
        this.viewTransitionsOn();
        this.drop();
        this.own = false;
      }
      if (
        e instanceof NavigationEnd ||
        e instanceof NavigationCancel ||
        e instanceof NavigationError
      )
        this.silent = false;
    });
  }

  // ── scroll ─────────────────────────────────────────────────────────────────
  //
  // Back to a screen, it is where it was left (1.9). The router's own restoration (withInMemoryScrolling) scrolled
  // before the screen was there again: during the screen transition, or before its list came from the cache or the
  // network. The page was then too short and the screen came back at its top (a long list of recipes). Here the
  // position is tried again frame after frame, for a second at most, until the page is tall enough; a touch or the
  // wheel stops it (the person scrolls by themselves). A new screen starts at its top, an anchor is the router's.

  /** the scroll is the browser's only (no window to scroll while prerendering) */
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private leaving(e: NavigationStart): void {
    const restored = e.navigationTrigger === 'popstate' ? e.restoredState?.navigationId : undefined;
    this.next =
      restored != null
        ? { how: 'pop', to: restored }
        : { how: this.router.currentNavigation()?.extras.replaceUrl ? 'replace' : 'push', to: 0 };
    const win = this.doc.defaultView;
    if (!win || !this.browser) return;
    this.restoring?.();
    this.positions.set(this.lastId, win.scrollY);
    const back = e.navigationTrigger === 'popstate' ? e.restoredState?.navigationId : undefined;
    this.restoreTo = back != null ? (this.positions.get(back) ?? 0) : null;
    // from a screen of the app to another: the app's own transition (the edge swipe and the browser's back gesture
    // move the screens by themselves: none then), and never the browser's
    const inside = this.router.url.startsWith('/app') && e.url.startsWith('/app');
    if (inside) this.viewTransitionsOff();
    this.own =
      inside && !this.silent && !win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ── the app's own transitions (1.12.1) ─────────────────────────────────────
  //
  // Just before the new screen replaces the old one (ResolveEnd: the code of the new screen is loaded), a still copy
  // of the screen is laid over it, fixed, exactly where it is seen. Once the new screen is there, both move: push (the
  // new one comes from the right over the copy, which backs off a little and darkens), pop (the copy leaves to the
  // right, uncovering the previous screen), fade (tabs). The real tab bar stays above everything, untouched, and the
  // document can scroll at once (the copy is fixed): nothing jumps. UIKit's timing, as the swipe and navigation.css.

  private main(): HTMLElement | null {
    return this.doc.getElementById('main');
  }

  /** Angular starts no view transition when the document has none: hidden during the app's own navigations */
  private viewTransitionsOff(): void {
    const doc = this.doc as Document & { startViewTransition?: unknown };
    if (this.vtOff || typeof doc.startViewTransition !== 'function') return;
    Object.defineProperty(doc, 'startViewTransition', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    this.vtOff = true;
  }

  private viewTransitionsOn(): void {
    if (!this.vtOff) return;
    Reflect.deleteProperty(this.doc, 'startViewTransition');
    this.vtOff = false;
  }

  /** the still copy of the screen, over it, where it is seen */
  private lift(): void {
    const win = this.doc.defaultView;
    const main = this.main();
    this.drop();
    if (!win || !main?.parentElement) return;
    const el = main.cloneNode(true) as HTMLElement;
    el.removeAttribute('id');
    el.classList.add('nav-ghost');
    el.setAttribute('aria-hidden', 'true');
    el.inert = true;
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.right = '0';
    el.style.top = `${-win.scrollY}px`;
    el.style.margin = '0';
    el.style.zIndex = '94';
    el.style.pointerEvents = 'none';
    main.parentElement.appendChild(el);
    this.ghost = {
      el,
      depth: this.depth(),
      path: pathOf(this.router.routerState.snapshot.root),
      anims: [],
    };
  }

  /** the new screen is there: both move, then the copy goes */
  private animate(): void {
    const g = this.ghost;
    const win = this.doc.defaultView;
    if (!g || !win) return;
    const to = pathOf(this.router.routerState.snapshot.root);
    // the same screen again, or a tab of the admin area: no transition
    if (to === g.path || sameTabGroup(g.path, to)) {
      this.drop();
      return;
    }
    const kind = navKind(g.depth, this.depth());
    const root = this.doc.documentElement;
    // the timing of navigation.css (--nav-dur: 500ms)
    const raw = win.getComputedStyle(root).getPropertyValue('--nav-dur').trim();
    const ms = (parseFloat(raw) || 500) * (/ms$/.test(raw) || !raw ? 1 : 1000);
    // whatever happens to the animations (a browser that draws no frame, an app sent to the background), the copy never
    // stays: gone shortly after the transition should have ended
    win.setTimeout(() => this.ghost === g && this.drop(), ms + 400);
    // once the new screen is rendered (by Angular, not on the browser's next frame: the copy covers it meanwhile)
    afterNextRender(
      () => {
        const main = this.main();
        if (this.ghost !== g || !main) return;
        const slide = { duration: ms, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
        const shadow = '-6px 0 24px rgba(0, 0, 0, 0.16)';
        root.dataset['nav'] = kind;
        main.style.position = 'relative';
        main.style.zIndex = '95';
        if (kind === 'push') {
          g.anims = [
            g.el.animate(
              [
                { transform: 'translateX(0)', filter: 'brightness(1)' },
                { transform: 'translateX(-30%)', filter: 'brightness(0.86)' },
              ],
              slide,
            ),
            main.animate(
              [
                { transform: 'translateX(100%)', boxShadow: shadow },
                { transform: 'translateX(0)', boxShadow: shadow },
              ],
              slide,
            ),
          ];
        } else if (kind === 'pop') {
          g.el.style.zIndex = '96';
          g.el.style.boxShadow = shadow;
          g.anims = [
            g.el.animate(
              [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
              slide,
            ),
            main.animate(
              [
                { transform: 'translateX(-30%)', filter: 'brightness(0.86)' },
                { transform: 'translateX(0)', filter: 'brightness(1)' },
              ],
              slide,
            ),
          ];
        } else {
          // tabs: the old screen fades away, the new one fades in while settling 8 px
          g.el.style.zIndex = '96';
          g.anims = [
            g.el.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 200,
              easing: 'ease',
              fill: 'forwards',
            }),
            main.animate(
              [
                { opacity: 0, transform: 'translateY(8px)' },
                { opacity: 1, transform: 'none' },
              ],
              { duration: 380, easing: slide.easing },
            ),
          ];
        }
        void Promise.all(g.anims.map((a) => a.finished))
          .catch(() => undefined)
          .then(() => this.ghost === g && this.drop());
      },
      { injector: this.injector },
    );
  }

  /** the copy gone, the screen as it is (at once when another navigation starts) */
  private drop(): void {
    const g = this.ghost;
    if (!g) return;
    this.ghost = null;
    for (const a of g.anims) a.cancel();
    g.el.remove();
    const main = this.main();
    main?.style.removeProperty('position');
    main?.style.removeProperty('z-index');
    delete this.doc.documentElement.dataset['nav'];
  }

  /** a transition of the app is under way (the edge swipe waits for its end) */
  busy(): boolean {
    return this.ghost !== null;
  }

  private arrived(e: NavigationEnd): void {
    const win = this.doc.defaultView;
    this.lastId = e.id;
    this.follow(e.id, e.urlAfterRedirects.split(/[?#]/)[0]);
    this.viewTransitionsOn();
    if (!win || !this.browser) return;
    if (this.own) this.animate();
    this.own = false;
    const y = this.restoreTo;
    this.restoreTo = null;
    if (y == null) {
      if (!this.router.parseUrl(e.urlAfterRedirects).fragment) win.scrollTo(0, 0);
      return;
    }
    this.restore(win, y);
  }

  /** to that scroll, frame after frame until the page is tall enough (a second at most); a touch stops it */
  private restore(win: Window, y: number): void {
    let tries = 0;
    let frame = 0;
    const stop = () => {
      win.cancelAnimationFrame(frame);
      win.removeEventListener('touchstart', stop);
      win.removeEventListener('wheel', stop);
      this.restoring = null;
    };
    this.restoring = stop;
    win.addEventListener('touchstart', stop, { passive: true });
    win.addEventListener('wheel', stop, { passive: true });
    const step = () => {
      win.scrollTo(0, y);
      if (Math.abs(win.scrollY - y) <= 1 || ++tries > 60) stop();
      else frame = win.requestAnimationFrame(step);
    };
    step();
  }

  /** depth of the current screen (0: a tab) */
  depth(): number {
    return depthOf(this.router.routerState.snapshot.root);
  }

  /** 1.17: false on a screen whose gestures are its own (route data `swipe: false`, the photo touch-up): no back swipe */
  swipeable(): boolean {
    return dataOf<boolean>(this.router.routerState.snapshot.root, 'swipe') !== false;
  }

  /** the screen "back" leads to when there is nothing to pop (route data `back`) */
  parentUrl(): string {
    return dataOf<string>(this.router.routerState.snapshot.root, 'back') ?? '/app';
  }

  /** true when an earlier screen of this app session is in the history */
  canPop(): boolean {
    const state = this.doc.defaultView?.history.state as { navigationId?: number } | null;
    return (state?.navigationId ?? 1) > 1;
  }

  /**
   * Pops the stack when there is one, otherwise opens the parent screen (route data `back`). Says which,
   * so that a cancelled swipe can come back: `history` (forward again) or `opened` (back again).
   */
  back(fallback?: string, silent = false): 'history' | 'opened' {
    const parent =
      fallback ?? dataOf<string>(this.router.routerState.snapshot.root, 'back') ?? '/app';
    this.silent = silent;
    if (this.canPop()) {
      this.doc.defaultView?.history.back();
      return 'history';
    }
    void this.router.navigateByUrl(parent);
    return 'opened';
  }

  /** the trail of the session, kept as the navigations go */
  private follow(id: number, path: string): void {
    const { how, to } = this.next;
    this.next = { how: 'push', to: 0 };
    if (how === 'pop') {
      const i = this.trail.findIndex((x) => x.id === to);
      if (i >= 0) {
        this.at = i;
        // the router gives the entry it came back to a new id
        this.trail[i] = { id, path };
        return;
      }
      this.trail = [{ id, path }];
      this.at = 0;
      return;
    }
    if (how === 'replace' && this.at >= 0) {
      this.trail[this.at] = { id, path };
      return;
    }
    this.trail = [...this.trail.slice(0, this.at + 1), { id, path }];
    this.at = this.trail.length - 1;
  }

  /**
   * Back to an earlier screen of the session, however far (a recipe added from « Ajouter un repas » → Recettes →
   * the recipe: back to the meals, past the screens in between). When it is not in this session's history, it opens.
   */
  backTo(path: string): void {
    for (let i = this.at - 1; i >= 0; i--) {
      if (this.trail[i].path === path) {
        this.doc.defaultView?.history.go(i - this.at);
        return;
      }
    }
    void this.router.navigateByUrl(path);
  }

  /** undoes `back` without any animation (a swipe let go too early) */
  undoBack(how: 'history' | 'opened'): void {
    this.silent = true;
    const history = this.doc.defaultView?.history;
    if (how === 'history') history?.forward();
    else history?.back();
  }

  /** read once by the router hook */
  takeSilent(): boolean {
    const s = this.silent;
    this.silent = false;
    return s;
  }
}
