import { EnvironmentInjector, afterNextRender } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take } from 'rxjs';

/** the logo stays this long at least in the app (from the page's start): its ring has drawn, it never just flickers */
const MIN_MS = 750;
/** whatever happens (no network, a guard that never answers), the screen is not hidden longer than this */
const MAX_MS = 8000;
const LEAVE_MS = 340;
/** 1.16: once the first screen is drawn, what was handed to holdSplash is waited for this long at most */
const HOLD_MS = 1200;

const held: Promise<unknown>[] = [];

/**
 * 1.16: something to load while the logo is on screen (the tabs and Today's data, core/nav/warm-up.ts): the logo leaves
 * once it is there, or HOLD_MS after the first screen is drawn, whichever comes first
 */
export function holdSplash(p: Promise<unknown>): void {
  held.push(p.catch(() => undefined));
}

/**
 * 1.15: the logo in the middle of the screen while the app starts (#boot in index.html, drawn before any script): it
 * leaves with a fade and a little zoom once the first screen is drawn. The prerendered public pages never carry it
 * (removed while they are rendered), the other pages drawn in the browser drop it at once. 1.16: it also waits for the
 * five tabs and Today's data loaded behind it (holdSplash).
 */
export function bootSplash(doc: Document, router: Router, injector: EnvironmentInjector, server: boolean): void {
  const el = doc.getElementById('boot');
  if (server) {
    el?.remove();
    doc.getElementById('boot-style')?.remove();
    return;
  }
  if (!el) return;
  const inApp = /^\/app(\/|$)/.test(doc.location.pathname);
  let gone = false;
  const leave = () => {
    if (gone) return;
    gone = true;
    el.classList.add('leaving');
    setTimeout(() => {
      el.remove();
      doc.getElementById('boot-style')?.remove();
    }, LEAVE_MS + 40);
  };
  if (!inApp) {
    leave();
    return;
  }
  const safety = setTimeout(leave, MAX_MS);
  router.events
    .pipe(
      filter((e) => e instanceof NavigationEnd || e instanceof NavigationError),
      take(1),
    )
    .subscribe(() => {
      // the first screen drawn, then the rest of the minimum
      afterNextRender(
        () => {
          clearTimeout(safety);
          // 1.16: then the tabs and Today's data, for a moment at most
          void Promise.race([Promise.all(held), new Promise((resolve) => setTimeout(resolve, HOLD_MS))]).then(() =>
            setTimeout(leave, Math.max(0, MIN_MS - performance.now())),
          );
        },
        { injector },
      );
    });
}
