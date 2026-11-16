import { DOCUMENT, Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, ViewTransitionInfo } from '@angular/router';

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
  if (reduced || fromApp !== toApp || from === to || sameTabGroup(from, to)) {
    stack.endSwipe();
    info.transition.skipTransition();
    return;
  }
  const root = doc.documentElement;
  // the public site: page to page; the app: like a phone app
  root.dataset['nav'] = toApp ? navKind(depthOf(info.from), depthOf(info.to)) : 'page';
  // a back swipe: the screen leaves from where the finger dropped it
  stack.endSwipe();
  info.transition.finished.finally(() => {
    delete root.dataset['nav'];
    root.style.removeProperty('--swipe-from');
  });
}

/** "Back" like a phone app, and the edge swipe that does it. */
@Injectable({ providedIn: 'root' })
export class StackNavigation {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private swiped: HTMLElement | null = null;

  /** depth of the current screen (0: a tab) */
  depth(): number {
    return depthOf(this.router.routerState.snapshot.root);
  }

  /** true when an earlier screen of this app session is in the history */
  canPop(): boolean {
    const state = this.doc.defaultView?.history.state as { navigationId?: number } | null;
    return (state?.navigationId ?? 1) > 1;
  }

  /** pops the stack when there is one, otherwise opens the parent screen (route data `back`) */
  back(fallback?: string): void {
    const parent = fallback ?? dataOf<string>(this.router.routerState.snapshot.root, 'back') ?? '/app';
    if (this.canPop()) this.doc.defaultView?.history.back();
    else void this.router.navigateByUrl(parent);
  }

  /** The finger let go of a screen dragged by `dx` px: it leaves from there (see onViewTransitionCreated). */
  releaseSwipe(el: HTMLElement, dx: number): void {
    this.swiped = el;
    this.doc.documentElement.style.setProperty('--swipe-from', `${Math.round(dx)}px`);
    this.back();
    // no view transition in this browser: just put the screen back in place
    if (!('startViewTransition' in this.doc)) this.endSwipe();
  }

  endSwipe(): void {
    if (this.swiped) {
      this.swiped.style.transform = '';
      this.swiped.style.transition = '';
      this.swiped.style.boxShadow = '';
      this.swiped = null;
    }
  }
}
