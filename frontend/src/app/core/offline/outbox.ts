import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, firstValueFrom } from 'rxjs';
import { Network } from './network';

/**
 * what can wait for the network: a meal added, changed (1.17) or deleted (1.17), the weigh-in, the evening weigh-in (1.17),
 * the glasses of water, a line of the shopping list ticked (1.17)
 */
export type PendingKind = 'meal' | 'meal-edit' | 'meal-delete' | 'weigh' | 'evening' | 'water' | 'shopping' | 'bp' | 'intake';

/** a write the server has not received yet: kept on the phone, sent when the network is back */
export interface Pending {
  id: string;
  kind: PendingKind;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body: unknown;
  /** the day it is about (the screens of that day reload once it is sent) */
  day: string;
  at: number;
  /** the account it belongs to: never sent for another one */
  owner: string;
  /** a meal: what to show of it until it is sent */
  preview?: { slot: string; name: string; nutrients: Record<string, number | undefined> & { kcal: number }; grams?: number; servings?: number };
  /** 1.17: the meal line a change or a deletion is about */
  target?: string;
}

const KEY = 'mb.outbox';
/** a few days of meals noted underground, never a phone filled up */
const MAX = 200;
/** 1.17: how long « everything is sent » stays said */
const DONE_MS = 2600;

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
 * deleted meanwhile): dropped and said once. 1.17: the screens show each one greyed (« sera envoyé plus tard »), the one
 * being sent with a spinner (`sending`), then as sent; the shell says when everything went (`done`).
 */
@Injectable({ providedIn: 'root' })
export class Outbox {
  private readonly http = inject(HttpClient);
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly network = inject(Network);
  readonly pending = signal<Pending[]>(this.read());
  /** reached the server: the stores reload what it is about */
  readonly sent = new Subject<Pending>();
  readonly refused = new Subject<Pending>();
  /** 1.17: the one on its way now */
  readonly sending = signal<string | null>(null);
  /** 1.17: a flush is going on (the network is back) */
  readonly syncing = signal(false);
  /** 1.17: how many went in the flush that just emptied the outbox (0 once said) */
  readonly done = signal(0);
  private owner = '';
  private flushing = false;
  private doneTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.browser) return;
    const win = this.doc.defaultView;
    win?.addEventListener('online', () => void this.flush());
    this.network.back.subscribe(() => void this.flush());
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
    if (p.kind === 'meal-edit' || p.kind === 'meal-delete' || p.kind === 'shopping' || p.kind === 'bp' || p.kind === 'intake') {
      // the last change of a line counts; a deletion makes its changes moot
      list = list.filter((x) => !(x.target != null && x.target === p.target && (x.kind === p.kind || p.kind === 'meal-delete')));
    } else if (p.kind !== 'meal') {
      // the glasses of a day, a weigh-in of a day: the last one counts
      list = list.filter((x) => !(x.kind === p.kind && x.day === p.day));
    }
    const id = this.doc.defaultView?.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    this.save([...list, { ...p, id, at: Date.now(), owner: this.owner }].slice(-MAX));
    // the request that just failed says the network is away: the screens grey what waits
    this.network.unreachable();
  }

  /** what waits for one kind (and one day, one line) */
  of(kind: PendingKind, day?: string, target?: string): Pending[] {
    return this.pending().filter((p) => p.kind === kind && (day == null || p.day === day) && (target == null || p.target === target));
  }

  /** in the order they were noted; stops at the first one the network does not let through */
  async flush(): Promise<void> {
    if (this.flushing || !this.owner || !this.pending().length) return;
    this.flushing = true;
    this.syncing.set(true);
    let went = 0;
    try {
      for (const p of [...this.pending()]) {
        if (p.owner !== this.owner) {
          this.remove(p.id);
          continue;
        }
        this.sending.set(p.id);
        try {
          await firstValueFrom(this.http.request(p.method, p.url, { body: p.body }));
          this.remove(p.id);
          went++;
          this.sent.next(p);
        } catch (e) {
          const status = e instanceof HttpErrorResponse ? e.status : 0;
          // still no network, signed out, or the server away: another time
          if (isOffline(e) || status === 0 || status === 401 || status === 403 || status >= 500) break;
          // a line deleted meanwhile: its change or deletion has nothing left to do
          this.remove(p.id);
          if (!(status === 404 && (p.kind === 'meal-delete' || p.kind === 'meal-edit'))) this.refused.next(p);
        }
      }
    } finally {
      this.sending.set(null);
      this.syncing.set(false);
      this.flushing = false;
    }
    if (went > 0 && !this.pending().length) {
      this.done.set(went);
      if (this.doneTimer) clearTimeout(this.doneTimer);
      this.doneTimer = setTimeout(() => this.done.set(0), DONE_MS);
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
