import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';

/**
 * The red badge on the app icon (counted by public/sw.js, one per notification received while the app was
 * not on screen): cleared whenever the app comes to the front.
 */
@Injectable({ providedIn: 'root' })
export class AppBadge {
  private readonly doc = inject(DOCUMENT);

  /** clears now and each time the app is shown again, until `destroy` ends */
  watch(destroy: DestroyRef): void {
    const onShow = () => {
      if (this.doc.visibilityState === 'visible') this.clear();
    };
    onShow();
    this.doc.addEventListener('visibilitychange', onShow);
    destroy.onDestroy(() => this.doc.removeEventListener('visibilitychange', onShow));
  }

  clear(): void {
    const nav = this.doc.defaultView?.navigator as (Navigator & { clearAppBadge?: () => Promise<void> }) | undefined;
    if (!nav) return;
    nav.clearAppBadge?.().catch(() => undefined);
    // the worker keeps the count: back to zero there too
    nav.serviceWorker?.controller?.postMessage({ type: 'MB_BADGE_CLEAR' });
  }
}
