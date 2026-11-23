import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/** while the app stays open in front, a new version is looked for this often */
const CHECK_MS = 15 * 60_000;
/** the Profile opened asks again, at most this often */
const ASK_MS = 2 * 60_000;

/**
 * The app's versions. A new one is downloaded in the background, then switched to without a word the next time the app
 * goes to the background (the reload is not seen, the session stays); the app looks for one each time it comes back to
 * the front. 1.20.2: while it stays open in front, a new version is looked for every 15 minutes (and when the Profile
 * opens); once downloaded it is said, a red dot on the Profile tab and « Recharger » in the Profile, for whoever wants it
 * now.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly doc = inject(DOCUMENT);
  /** a new version is downloaded, ready to be switched to */
  readonly ready = signal(false);
  private started = false;
  private asked = 0;

  /** from the app's start, in the browser */
  start(): void {
    const updates = this.updates;
    if (this.started || !updates?.isEnabled) return;
    this.started = true;
    updates.versionUpdates.pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY')).subscribe(() => {
      this.ready.set(true);
      if (this.doc.visibilityState === 'hidden') this.switchUnseen();
    });
    // a broken cache (files of an old version gone): start again from the network
    updates.unrecoverable.subscribe(() => this.doc.location.reload());
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'hidden') {
        if (this.ready()) this.switchUnseen();
      } else {
        this.check();
      }
    });
    this.doc.defaultView?.setInterval(() => {
      if (this.doc.visibilityState === 'visible') this.check();
    }, CHECK_MS);
  }

  /** the Profile opened: looked for again, not more than every 2 minutes */
  checkSoon(): void {
    if (Date.now() - this.asked > ASK_MS) this.check();
  }

  /** asked for (« Recharger »): the new version now, the page starts again on it */
  async reload(): Promise<void> {
    try {
      await this.updates?.activateUpdate();
    } catch {
      /* reloaded all the same: the page comes with the newest files the worker has */
    }
    this.doc.location.reload();
  }

  /** the app in the background: switched to without being seen */
  private switchUnseen(): void {
    void this.updates
      ?.activateUpdate()
      .then(() => this.doc.location.reload())
      .catch(() => undefined);
  }

  private check(): void {
    if (!this.updates?.isEnabled || this.ready()) return;
    this.asked = Date.now();
    void this.updates.checkForUpdate().catch(() => false);
  }
}
