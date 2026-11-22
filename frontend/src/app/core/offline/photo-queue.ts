import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { ApiService } from '../api/api.service';
import type { Photo, Pose } from '../api/models';
import { Network } from './network';
import { isOffline } from './outbox';

/** a photo taken without network, kept in the phone's database (a picture is too big for localStorage) */
interface Stored {
  id: string;
  owner: string;
  day: string;
  pose: Pose;
  blob: Blob;
  at: number;
}

/** what the screens show of it: its picture from the phone */
export interface QueuedPhoto {
  id: string;
  day: string;
  pose: Pose;
  url: string;
  at: number;
}

const DB = 'mb-offline';
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * 1.17: the photo of the day taken without network (a gym in a basement): kept on the phone, shown greyed in the Photos
 * tab (« Sera envoyée plus tard »), sent when the network is back (a spinner on it), then in the list like the others.
 * One photo a day and a pose: a new one replaces the one waiting. Signed out: forgotten.
 */
@Injectable({ providedIn: 'root' })
export class PhotoQueue {
  private readonly api = inject(ApiService);
  private readonly network = inject(Network);
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly items = signal<QueuedPhoto[]>([]);
  readonly sending = signal<string | null>(null);
  /** reached the server (the Photos tab puts it in its list) */
  readonly arrived = new Subject<{ queued: string; photo: Photo }>();
  private owner = '';
  private flushing = false;

  constructor() {
    if (!this.browser || typeof indexedDB === 'undefined') return;
    this.network.back.subscribe(() => void this.flush());
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'visible') void this.flush();
    });
    this.doc.defaultView?.setInterval(() => {
      if (this.items().length) void this.flush();
    }, 30_000);
  }

  /** the signed-in account: its photos waiting are shown, then sent */
  async setOwner(id: string | null | undefined): Promise<void> {
    this.owner = id ?? '';
    await this.refresh();
    void this.flush();
  }

  async add(blob: Blob, day: string, pose: Pose): Promise<void> {
    const old = (await this.all()).filter((s) => s.owner === this.owner && s.day === day && s.pose === pose);
    for (const s of old) await run('readwrite', (st) => st.delete(s.id));
    const id = this.doc.defaultView?.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    await run('readwrite', (st) => st.put({ id, owner: this.owner, day, pose, blob, at: Date.now() } satisfies Stored));
    await this.refresh();
  }

  /** one after the other; stops at the first one the network does not let through */
  async flush(): Promise<void> {
    if (this.flushing || !this.owner || !this.items().length || typeof indexedDB === 'undefined') return;
    this.flushing = true;
    try {
      for (const s of await this.all()) {
        if (s.owner !== this.owner) continue;
        this.sending.set(s.id);
        try {
          const photo = await this.api.uploadPhoto(s.blob, s.day, s.pose);
          await run('readwrite', (st) => st.delete(s.id));
          this.arrived.next({ queued: s.id, photo });
        } catch (e) {
          const status = e instanceof HttpErrorResponse ? e.status : 0;
          if (isOffline(e) || status === 0 || status === 401 || status === 403 || status >= 500) break;
          // refused (the storage full, a day too far): dropped, it would never go
          await run('readwrite', (st) => st.delete(s.id));
        }
      }
    } finally {
      this.sending.set(null);
      this.flushing = false;
      await this.refresh();
    }
  }

  async clear(): Promise<void> {
    this.owner = '';
    if (this.browser && typeof indexedDB !== 'undefined') await run('readwrite', (st) => st.clear()).catch(() => undefined);
    await this.refresh();
  }

  private async all(): Promise<Stored[]> {
    if (!this.browser || typeof indexedDB === 'undefined') return [];
    try {
      const list = await run<Stored[]>('readonly', (st) => st.getAll() as IDBRequest<Stored[]>);
      return list.sort((a, b) => a.at - b.at);
    } catch {
      return [];
    }
  }

  /** the pictures shown, from the phone (the old addresses let go) */
  private async refresh(): Promise<void> {
    const mine = this.owner ? (await this.all()).filter((s) => s.owner === this.owner) : [];
    for (const q of this.items()) URL.revokeObjectURL(q.url);
    this.items.set(mine.map((s) => ({ id: s.id, day: s.day, pose: s.pose, at: s.at, url: URL.createObjectURL(s.blob) })));
  }
}
