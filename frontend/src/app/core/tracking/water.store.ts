import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import { SessionStore } from '../auth/session.store';
import { readPref, writePref } from '../ui/device-prefs';
import { localDay } from './tracking.store';
import { fresh } from '../api/kept';

/** the last count seen, kept on this phone: the glasses are there at once, the server's count follows */
const KEY = 'mb.water';

interface Kept {
  owner: string;
  day: string;
  glasses: number;
}

/**
 * Today's glasses of water, for the whole app (1.9). The card showed nothing until the server answered, then the
 * glasses all came at once (a few seconds on a slow network): now the last count seen today shows at once.
 */
@Injectable({ providedIn: 'root' })
export class WaterStore {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  /** null: not known yet (nothing kept for today, the server not there yet) */
  readonly glasses = signal<number | null>(null);
  private day = '';
  /** each count set here: an answer asked for before it is too old to show */
  private version = 0;
  private saving: Promise<unknown> = Promise.resolve();
  /** 1.16: when the server last said (or was told) today's count, and the day being asked */
  private at = 0;
  private asking = '';

  /** today's count: the one kept on this phone at once, then the server's */
  load(): void {
    const today = localDay();
    if (this.day !== today) {
      this.day = today;
      this.at = 0;
      this.glasses.set(this.kept(today));
    }
    // 1.16: back on Today within 30 s, the count on screen is the server's already (or being asked)
    if (fresh(this.at) || this.asking === today) return;
    this.asking = today;
    const asked = this.version;
    void this.api
      .water(today)
      .then((w) => {
        if (this.day !== today || this.version !== asked) return;
        this.glasses.set(w.glasses);
        this.keep(w.glasses);
        this.at = Date.now();
      })
      .catch(() => undefined)
      .finally(() => (this.asking = ''));
  }

  /** shown at once, saved in order (several quick taps end on the right number); the save's own error is thrown */
  set(next: number): Promise<void> {
    this.version++;
    this.glasses.set(next);
    this.keep(next);
    const day = this.day || localDay();
    const save = this.saving.catch(() => undefined).then(() => this.api.setWater(day, next));
    this.saving = save;
    void save.then(() => (this.at = Date.now())).catch(() => (this.at = 0));
    return save.then(() => undefined);
  }

  /** the day the count is for */
  today(): string {
    return this.day || localDay();
  }

  clear(): void {
    this.version++;
    this.day = '';
    this.at = 0;
    this.glasses.set(null);
    writePref(KEY, null);
  }

  private kept(day: string): number | null {
    try {
      const k = JSON.parse(readPref(KEY) ?? 'null') as Kept | null;
      const owner = this.session.account()?.id;
      return k && owner && k.owner === owner && k.day === day && Number.isInteger(k.glasses) ? k.glasses : null;
    } catch {
      return null;
    }
  }

  private keep(glasses: number): void {
    const owner = this.session.account()?.id;
    if (owner) writePref(KEY, JSON.stringify({ owner, day: this.day, glasses } satisfies Kept));
  }
}
