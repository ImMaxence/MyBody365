import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, tap } from 'rxjs';
import { isOffline } from './outbox';

/** how often the network is tried again while it is away (a cheap page of the web server): often at first, then less */
const PROBE_FIRST_MS = 4_000;
const PROBE_MS = 15_000;
const PROBE_FAST_FOR = 60_000;
/** 1.18: a loss shorter than this is not written down (a lift, a tunnel of a few seconds) */
const BLIP_MS = 8_000;
/** 1.18: how long « back at 14:47 » stays said */
const BACK_SHOWN_MS = 4_000;
const LOG_KEY = 'mb.netlog';
const LOG_MAX = 40;
const LOG_DAYS = 30;

/** 1.18: the network lost (when), and found again (when, after how long, and what went then) */
export interface NetEvent {
  kind: 'lost' | 'back';
  at: number;
  /** back: since when it was lost */
  since?: number;
  /** back: what was noted meanwhile and sent once back */
  sent?: number;
  /** back: seen when the app was opened again (the phone may have had its network back before) */
  late?: boolean;
}

/** 1.18: on an answer that comes from the phone (core/offline/offline-cache.ts): when it was kept (ms) */
export const KEPT_HEADER = 'X-MB-Kept';

/** 1.18: the last time the network came back: what the screens kept from before is asked again (core/api/kept.ts) */
let lastBack = 0;
export function cameBackAfter(at: number): boolean {
  return lastBack > 0 && at <= lastBack;
}

/**
 * 1.17: whether the app reaches its server: the phone's own word (online / offline events), and what the requests say (one
 * that never got through: away; any answer: back). Away, the screens grey what is kept on the phone; back, the outbox
 * sends it (`back`), and the screens show it being sent, then as sent. 1.18: since when it is away (the pill and the
 * notification centre say it), and a log of the losses and returns kept on the phone.
 */
@Injectable({ providedIn: 'root' })
export class Network {
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly online = signal(true);
  /** the network came back (after being away) */
  readonly back = new Subject<void>();
  /** 1.18: away since (ms), null while online */
  readonly since = signal<number | null>(null);
  /** 1.18: came back a moment ago, at that time (the pill says it) */
  readonly backAt = signal<number | null>(null);
  /** 1.18: the losses and returns of the last days, latest last */
  readonly log = signal<NetEvent[]>([]);
  private probe: ReturnType<typeof setTimeout> | null = null;
  private backTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * a loss written down by an earlier start and never closed (the app was closed while offline): started offline, it goes
   * on; started online, the first answer closes it, as seen when the app was opened again
   */
  private open: number | null = null;

  constructor() {
    if (!this.browser) return;
    this.log.set(this.readLog());
    const last = this.log().at(-1);
    if (last?.kind === 'lost') this.open = last.at;
    const win = this.doc.defaultView;
    win?.addEventListener('online', () => this.check());
    win?.addEventListener('offline', () => this.unreachable());
    // back in the app: the network is tried at once
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'visible' && !this.online()) this.check();
    });
    if (win?.navigator.onLine === false) this.unreachable();
  }

  /** an answer came (any status): the server is reachable */
  reachable(): void {
    if (this.online()) {
      if (this.open != null) {
        // lost in an earlier start, never seen coming back: back by now
        this.saveLog([...this.log(), { kind: 'back', at: Date.now(), since: this.open, late: true }]);
        this.open = null;
      }
      return;
    }
    const since = this.since() ?? Date.now();
    const now = Date.now();
    this.online.set(true);
    this.since.set(null);
    this.stopProbe();
    lastBack = now;
    if (now - since < BLIP_MS) {
      // a few seconds only: nothing written down, nothing said
      this.saveLog(this.log().filter((e) => !(e.kind === 'lost' && e.at === since)));
    } else {
      this.saveLog([...this.log(), { kind: 'back', at: now, since }]);
      this.backAt.set(now);
      if (this.backTimer) clearTimeout(this.backTimer);
      this.backTimer = setTimeout(() => this.backAt.set(null), BACK_SHOWN_MS);
    }
    this.back.next();
  }

  /** a request never got through */
  unreachable(): void {
    if (!this.online()) return;
    const now = Date.now();
    this.online.set(false);
    this.backAt.set(null);
    // still the loss of an earlier start (the app opened again without network): the same one goes on
    const since = this.open ?? now;
    this.open = null;
    this.since.set(since);
    if (since === now) this.saveLog([...this.log(), { kind: 'lost', at: now }]);
    this.startProbe(now);
  }

  /** 1.18: what was sent once back (the outbox, the photos): told on the last return */
  noteSent(n: number): void {
    if (n <= 0) return;
    const log = [...this.log()];
    const last = log.at(-1);
    if (!last || last.kind !== 'back' || Date.now() - last.at > 10 * 60_000) return;
    log[log.length - 1] = { ...last, sent: (last.sent ?? 0) + n };
    this.saveLog(log);
  }

  /** signed out: the log goes with the rest */
  clearLog(): void {
    this.saveLog([]);
  }

  /** the web server answers: back */
  private check(): void {
    if (this.online() || !this.browser) return;
    fetch('/healthz', { cache: 'no-store' })
      .then((r) => {
        if (r.ok) this.reachable();
      })
      .catch(() => undefined);
  }

  private startProbe(from: number): void {
    if (this.probe || !this.browser) return;
    const tick = () => {
      this.probe = setTimeout(
        () => {
          if (this.online()) {
            this.probe = null;
            return;
          }
          if (this.doc.defaultView?.navigator.onLine !== false) this.check();
          tick();
        },
        Date.now() - from < PROBE_FAST_FOR ? PROBE_FIRST_MS : PROBE_MS,
      );
    };
    tick();
  }

  private stopProbe(): void {
    if (this.probe) clearTimeout(this.probe);
    this.probe = null;
  }

  private readLog(): NetEvent[] {
    try {
      const list = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as NetEvent[];
      const after = Date.now() - LOG_DAYS * 86_400_000;
      return Array.isArray(list) ? list.filter((e) => e && typeof e.at === 'number' && e.at > after) : [];
    } catch {
      return [];
    }
  }

  private saveLog(list: NetEvent[]): void {
    const kept = list.slice(-LOG_MAX);
    this.log.set(kept);
    if (!this.browser) return;
    try {
      if (kept.length) localStorage.setItem(LOG_KEY, JSON.stringify(kept));
      else localStorage.removeItem(LOG_KEY);
    } catch {
      /* storage blocked: kept for this visit */
    }
  }
}

/** every request tells the network's state: one that never got through, or any answer (not one kept on the phone) */
export const networkInterceptor: HttpInterceptorFn = (req, next) => {
  const net = inject(Network);
  return next(req).pipe(
    tap({
      next: (ev) => {
        if (ev instanceof HttpResponse && !ev.headers.has(KEPT_HEADER)) net.reachable();
      },
      error: (e: unknown) => {
        if (isOffline(e)) net.unreachable();
        else if (e instanceof HttpErrorResponse && e.status > 0) net.reachable();
      },
    }),
  );
};
