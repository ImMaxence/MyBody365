import { HttpErrorResponse, HttpEvent, HttpHeaders, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NEVER, Observable, catchError, filter, from, of, race, switchMap, tap, throwError, timer } from 'rxjs';
import { isOffline } from './outbox';
import { KEPT_HEADER } from './network';

/**
 * 1.18: the server's answers kept on the phone, for the account signed in: with no network (a basement, the metro, a
 * plane), the screens open on what they showed last time instead of staying empty. Every GET of the API is kept (its
 * last answer), but the admin pages, the sign-in and the backups; a request that never got through gets the kept answer
 * instead, marked with KEPT_HEADER (the time it was kept). The pictures are kept by the service worker (public/sw.js).
 * Signed out: all forgotten (UserDataService).
 */
const DB = 'mb-cache';
const STORE = 'answers';
/** answers kept at most (the oldest go first): the searches typed add up */
const MAX = 600;
/** kept in memory too, the latest ones */
const MEMORY = 120;
/** a bigger answer is not kept (a phone is never filled up) */
const MAX_CHARS = 400_000;
/** a request still unanswered after this time while a kept answer exists (a network that barely works): the kept one */
const SLOW_MS = 10_000;

/** the account the database holds answers for */
const OWNER_KEY = 'mb.cache.owner';
/** what the API is asked for and kept; never the admin pages, the sign-in or the backups */
const KEPT_URL = /^\/api\//;
const NOT_KEPT = /^\/api\/(admin|auth)\/|^\/api\/me\/(backup|drive)/;

interface Entry {
  key: string;
  owner: string;
  at: number;
  body: unknown;
}

/** the request never reached the server, or the server is away (a deployment, a gateway with no answer) */
export function unreachable(e: unknown): boolean {
  if (isOffline(e)) return true;
  if (!(e instanceof HttpErrorResponse)) return false;
  const s = e.status;
  return s === 0 || (s >= 502 && s <= 504) || (s >= 520 && s <= 530);
}

/** an answer that comes from the phone, and when it was kept (null: from the server) */
export function keptAt(r: HttpResponse<unknown>): number | null {
  const v = r.headers.get(KEPT_HEADER);
  return v ? Number(v) || null : null;
}

@Injectable({ providedIn: 'root' })
export class OfflineCache {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** the phone's database (none in a private window of some browsers: the memory only, for this visit) */
  private readonly idb = this.browser && typeof indexedDB !== 'undefined';
  private owner = '';
  private db: Promise<IDBDatabase | null> | null = null;
  private writes = 0;
  /** what was kept during this visit, so that a kept answer is found at once (the database is slower) */
  private readonly memory = new Map<string, Entry>();

  /**
   * the signed-in account: only its answers are kept and given back. Another account than the one the phone kept answers
   * for (a session that ended on the server, then someone else signing in): the other's answers are deleted, not just
   * left unused
   */
  setOwner(id: string | null | undefined): void {
    if ((id ?? '') !== this.owner) this.memory.clear();
    this.owner = id ?? '';
    if (!this.owner || !this.browser) return;
    try {
      const before = localStorage.getItem(OWNER_KEY);
      if (before !== this.owner) {
        if (before) void this.run('readwrite', (s) => s.clear()).catch(() => undefined);
        localStorage.setItem(OWNER_KEY, this.owner);
      }
    } catch {
      /* storage blocked: the owner check of each answer still holds */
    }
  }

  key(req: HttpRequest<unknown>): string | null {
    return this.owner ? `${this.owner} ${req.urlWithParams}` : null;
  }

  async get(key: string): Promise<Entry | null> {
    const hit = this.memory.get(key);
    if (hit) return hit;
    const found = await this.run<Entry | undefined>('readonly', (s) => s.get(key)).catch(() => undefined);
    return found && found.owner === this.owner ? found : null;
  }

  put(key: string, body: unknown): void {
    if (!this.browser || !this.owner || body == null) return;
    let size = 0;
    try {
      size = JSON.stringify(body).length;
    } catch {
      return;
    }
    if (size > MAX_CHARS) return;
    const entry: Entry = { key, owner: this.owner, at: Date.now(), body };
    // the latest ones only, in memory (a Map keeps its order: the oldest first)
    this.memory.delete(key);
    this.memory.set(key, entry);
    if (this.memory.size > MEMORY) this.memory.delete(this.memory.keys().next().value!);
    void this.run('readwrite', (s) => s.put(entry))
      .then(() => {
        if (++this.writes % 40 === 0) void this.trim();
      })
      .catch(() => undefined);
  }

  /** signed out: nothing stays */
  async clear(): Promise<void> {
    this.memory.clear();
    this.owner = '';
    try {
      localStorage.removeItem(OWNER_KEY);
    } catch {
      /* storage blocked */
    }
    await this.run('readwrite', (s) => s.clear()).catch(() => undefined);
  }

  /** the oldest answers beyond MAX go */
  private async trim(): Promise<void> {
    const n = await this.run<number>('readonly', (s) => s.count()).catch(() => 0);
    if (n <= MAX) return;
    let extra = n - MAX + 50;
    const db = await this.open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const cursor = tx.objectStore(STORE).index('at').openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c || extra-- <= 0) return;
        this.memory.delete((c.value as Entry).key);
        c.delete();
        c.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  private open(): Promise<IDBDatabase | null> {
    if (!this.idb) return Promise.resolve(null);
    return (this.db ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex('at', 'at');
        req.onsuccess = () => {
          const db = req.result;
          // another tab updates the database: this one lets go, and opens it again next time
          db.onversionchange = () => {
            db.close();
            this.db = null;
          };
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  }

  private async run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    if (!db) throw new Error('no_db');
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

function answer(req: HttpRequest<unknown>, hit: Entry): HttpResponse<unknown> {
  return new HttpResponse({
    body: hit.body,
    status: 200,
    statusText: 'OK',
    url: req.urlWithParams,
    headers: new HttpHeaders({ [KEPT_HEADER]: String(hit.at) }),
  });
}

/**
 * Keeps the last answer of each GET of the API, and gives it back when the network does not let the request through.
 * Placed before networkInterceptor: that one still sees the failure (the app knows it is offline), the screen gets the
 * kept answer.
 */
export const offlineCacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || req.responseType !== 'json' || !KEPT_URL.test(req.url) || NOT_KEPT.test(req.url)) return next(req);
  const cache = inject(OfflineCache);
  const key = cache.key(req);
  if (!key) return next(req);
  const kept = (e?: unknown): Observable<HttpEvent<unknown>> =>
    from(cache.get(key)).pipe(switchMap((hit) => (hit ? of(answer(req, hit)) : e === undefined ? NEVER : throwError(() => e))));
  const live = next(req).pipe(
    tap((ev) => {
      if (ev instanceof HttpResponse && ev.status === 200) cache.put(key, ev.body);
    }),
    catchError((e: unknown) => (unreachable(e) ? kept(e) : throwError(() => e))),
  );
  // a network that barely works: after a while, what was kept (the request is let go); with nothing kept, the request
  // goes on as long as it takes. Only the answer counts in this race (the « sent » event comes at once)
  return race(
    live.pipe(filter((ev) => ev instanceof HttpResponse)),
    timer(SLOW_MS).pipe(switchMap(() => kept())),
  );
};
