import { DOCUMENT, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRouteSnapshot, NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, ViewTransitionInfo } from '@angular/router';

/**
 * Native-app navigation: every screen of the app has a depth in route data (`depth`: 0 for the tab
 * roots, 1 for a screen opened from them…) and, when it is deeper than 0, the screen to go back to
 * (`back`). Going deeper pushes the new screen from the right, going back pops it to the right,
 * staying at the same depth (tabs) cross-fades. The tab bar has its own view-transition-name, so it
 * stays put. Animations: styles/navigation.css.
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
  return TAB_GROUPS.some((g) => (from === g || from.startsWith(g + '/')) && (to === g || to.startsWith(g + '/')));
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
  // another tab opened from further down a screen (the goal card at the bottom of Today): Safari shows the
  // picture of the old screen from its top, a jump up just before the new one. The old one does not fade
  // there: it goes at once, the new screen arrives as usual.
  if (kind === 'fade' && (doc.defaultView?.scrollY ?? 0) > 24) root.dataset['navScrolled'] = '';
  info.transition.finished.finally(() => {
    delete root.dataset['nav'];
    delete root.dataset['navScrolled'];
  });
}

/** "Back" like a phone app, and what the edge swipe needs for it. */
@Injectable({ providedIn: 'root' })
export class StackNavigation {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
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

  constructor() {
    // 1.12: the browser keeps its hands off the scroll. Left to itself ('auto', what the router leaves when its own
    // restoration is disabled), it scrolled the screen being left to where the previous one had been, on the very
    // popstate, before the transition took its picture: the whole screen jumped up, then slid away.
    if (this.browser && this.doc.defaultView?.history) this.doc.defaultView.history.scrollRestoration = 'manual';
    // the browser animated this step back itself (its own swipe): no second animation on top
    this.doc.defaultView?.addEventListener('popstate', (e) => {
      if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) this.silent = true;
    });
    // a navigation that never happened does not keep the flag for the next one
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.leaving(e);
      if (e instanceof NavigationEnd) this.arrived(e);
      if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) this.silent = false;
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
  }

  private arrived(e: NavigationEnd): void {
    const win = this.doc.defaultView;
    this.lastId = e.id;
    this.follow(e.id, e.urlAfterRedirects.split(/[?#]/)[0]);
    if (!win || !this.browser) return;
    const y = this.restoreTo;
    this.restoreTo = null;
    if (y == null) {
      if (!this.router.parseUrl(e.urlAfterRedirects).fragment) win.scrollTo(0, 0);
      return;
    }
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
    const parent = fallback ?? dataOf<string>(this.router.routerState.snapshot.root, 'back') ?? '/app';
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
