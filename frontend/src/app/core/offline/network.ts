import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, tap } from 'rxjs';
import { isOffline } from './outbox';

/** how often the network is tried again while it is away (a cheap page of the web server) */
const PROBE_MS = 15_000;

/**
 * 1.17: whether the app reaches its server: the phone's own word (online / offline events), and what the requests say (one
 * that never got through: away; any answer: back). Away, the screens grey what is kept on the phone; back, the outbox
 * sends it (`back`), and the screens show it being sent, then as sent.
 */
@Injectable({ providedIn: 'root' })
export class Network {
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly online = signal(true);
  /** the network came back (after being away) */
  readonly back = new Subject<void>();
  private probe: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (!this.browser) return;
    const win = this.doc.defaultView;
    this.online.set(win?.navigator.onLine !== false);
    win?.addEventListener('online', () => this.reachable());
    win?.addEventListener('offline', () => this.unreachable());
    if (!this.online()) this.startProbe();
  }

  /** an answer came (any status): the server is reachable */
  reachable(): void {
    if (this.online()) return;
    this.online.set(true);
    this.stopProbe();
    this.back.next();
  }

  /** a request never got through */
  unreachable(): void {
    if (!this.online()) return;
    this.online.set(false);
    this.startProbe();
  }

  private startProbe(): void {
    if (this.probe || !this.browser) return;
    this.probe = setInterval(() => {
      if (this.doc.defaultView?.navigator.onLine === false) return;
      fetch('/healthz', { cache: 'no-store' })
        .then((r) => {
          if (r.ok) this.reachable();
        })
        .catch(() => undefined);
    }, PROBE_MS);
  }

  private stopProbe(): void {
    if (this.probe) clearInterval(this.probe);
    this.probe = null;
  }
}

/** every request tells the network's state: one that never got through, or any answer */
export const networkInterceptor: HttpInterceptorFn = (req, next) => {
  const net = inject(Network);
  return next(req).pipe(
    tap({
      next: (ev) => {
        if (ev instanceof HttpResponse) net.reachable();
      },
      error: (e: unknown) => {
        if (isOffline(e)) net.unreachable();
        else if (e instanceof HttpErrorResponse && e.status > 0) net.reachable();
      },
    }),
  );
};
