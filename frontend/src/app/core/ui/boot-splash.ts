import { EnvironmentInjector, afterNextRender } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take } from 'rxjs';

/** the logo stays this long at least in the app (from the page's start): its ring has drawn, it never just flickers */
const MIN_MS = 750;
/** whatever happens (no network, a guard that never answers), the screen is not hidden longer than this */
const MAX_MS = 8000;
const LEAVE_MS = 340;

/**
 * 1.15: the logo in the middle of the screen while the app starts (#boot in index.html, drawn before any script): it
 * leaves with a fade and a little zoom once the first screen is drawn. The prerendered public pages never carry it
 * (removed while they are rendered), the other pages drawn in the browser drop it at once.
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
          setTimeout(leave, Math.max(0, MIN_MS - performance.now()));
        },
        { injector },
      );
    });
}
