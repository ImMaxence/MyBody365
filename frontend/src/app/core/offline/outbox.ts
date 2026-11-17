import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, firstValueFrom } from 'rxjs';

export type PendingKind = 'meal' | 'weigh' | 'water';

/** a write the server has not received yet: kept on the phone, sent when the network is back */
export interface Pending {
  id: string;
  kind: PendingKind;
  method: 'POST' | 'PUT';
  url: string;
  body: unknown;
  /** the day it is about (the screens of that day reload once it is sent) */
  day: string;
  at: number;
  /** the account it belongs to: never sent for another one */
  owner: string;
  /** a meal: what to show of it until it is sent */
  preview?: { slot: string; name: string; nutrients: Record<string, number | undefined> & { kcal: number }; grams?: number; servings?: number };
}

const KEY = 'mb.outbox';
/** a few days of meals noted underground, never a phone filled up */
const MAX = 200;

/**
 * A request that never reached the server (no network), not one the server refused: a network error, or the 504
 * the app's service worker answers with when the network is away (no body, unlike a gateway's own 504 page).
 */
export function isOffline(e: unknown): boolean {
  if (!(e instanceof HttpErrorResponse)) return false;
  if (e.status === 0) return true;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return e.status === 504 && (offline || !e.headers.get('content-type'));
}

/**
 * Noted without network (a gym in a basement, the metro): a meal, a weigh-in or the glasses of water are kept
 * on the phone, in order, then sent as soon as the network is back (back online, back in the app, every 30 s).
 * Signed out: they are dropped (UserDataService). Refused by the server when sent (rare: a day too far, a food
 * deleted meanwhile): dropped and said once.
 */
@Injectable({ providedIn: 'root' })
export class Outbox {
  private readonly http = inject(HttpClient);
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly pending = signal<Pending[]>(this.read());
  /** reached the server: the stores reload what it is about */
  readonly sent = new Subject<Pending>();
  readonly refused = new Subject<Pending>();
  private owner = '';
  private flushing = false;

  constructor() {
    if (!this.browser) return;
    const win = this.doc.defaultView;
    win?.addEventListener('online', () => void this.flush());
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'visible') void this.flush();
    });
    win?.setInterval(() => {
      if (this.pending().length) void this.flush();
    }, 30_000);
  }

  /** the signed-in account (the session says it): what another one left is dropped, the rest goes */
  setOwner(id: string | null | undefined): void {
    this.owner = id ?? '';
    if (!this.owner) return;
    const mine = this.pending().filter((p) => p.owner === this.owner);
    if (mine.length !== this.pending().length) this.save(mine);
    void this.flush();
  }

  add(p: Omit<Pending, 'id' | 'at' | 'owner'>): void {
    let list = this.pending();
    // the glasses of a day, a weigh-in of a day: the last one counts
    if (p.kind !== 'meal') list = list.filter((x) => !(x.kind === p.kind && x.day === p.day));
    const id = this.doc.defaultView?.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    this.save([...list, { ...p, id, at: Date.now(), owner: this.owner }].slice(-MAX));
  }

  /** in the order they were noted; stops at the first one the network does not let through */
  async flush(): Promise<void> {
    if (this.flushing || !this.owner || !this.pending().length) return;
    this.flushing = true;
    try {
      for (const p of [...this.pending()]) {
        if (p.owner !== this.owner) {
          this.remove(p.id);
          continue;
        }
        try {
          await firstValueFrom(this.http.request(p.method, p.url, { body: p.body }));
          this.remove(p.id);
          this.sent.next(p);
        } catch (e) {
          const status = e instanceof HttpErrorResponse ? e.status : 0;
          // still no network, signed out, or the server away: another time
          if (status === 0 || status === 401 || status === 403 || status >= 500) break;
          this.remove(p.id);
          this.refused.next(p);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  clear(): void {
    this.save([]);
  }

  private remove(id: string): void {
    this.save(this.pending().filter((p) => p.id !== id));
  }

  private read(): Pending[] {
    try {
      const raw = this.browser ? localStorage.getItem(KEY) : null;
      const list = raw ? (JSON.parse(raw) as Pending[]) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private save(list: Pending[]): void {
    this.pending.set(list);
    if (!this.browser) return;
    try {
      if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage blocked or full: kept for this visit */
    }
  }
}
