import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import type { BodyLogEntry, LogInput, MacroSplit, ProfileInput, Summary } from '../api/models';
import { SessionStore } from '../auth/session.store';
import { Outbox, isOffline } from '../offline/outbox';

/** today in the user's calendar (yyyy-mm-dd), not UTC */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The account's tracking: the summary of Today / Progress and the history of the daily log. */
@Injectable({ providedIn: 'root' })
export class TrackingStore {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly outbox = inject(Outbox);

  readonly summary = signal<Summary | null>(null);
  readonly logs = signal<BodyLogEntry[] | null>(null);
  readonly lastWeight = computed(() => this.summary()?.current.weightKg ?? this.summary()?.profile.startWeightKg ?? null);
  readonly todayLog = computed(() => this.logs()?.find((l) => l.day === localDay()) ?? null);

  async load(): Promise<Summary | null> {
    try {
      const s = await this.api.summary();
      this.summary.set(s);
      return s;
    } catch {
      return null;
    }
  }

  async loadLogs(): Promise<BodyLogEntry[]> {
    const logs = await this.api.logs();
    this.logs.set(logs);
    return logs;
  }

  async saveProfile(input: ProfileInput): Promise<Summary> {
    const s = await this.api.saveProfile(input);
    this.summary.set(s);
    const account = this.session.account();
    if (account && !account.profileComplete) this.session.setAccount({ ...account, profileComplete: true });
    this.logs.set(null);
    return s;
  }

  async setAdaptive(on: boolean): Promise<Summary> {
    const s = await this.api.setAdaptive(on);
    this.summary.set(s);
    return s;
  }

  async setMacroSplit(split: MacroSplit): Promise<Summary> {
    const s = await this.api.setMacroSplit(split);
    this.summary.set(s);
    return s;
  }

  constructor() {
    // a weigh-in noted offline reached the server: the summary and the curve again
    this.outbox.sent.subscribe((p) => {
      if (p.kind !== 'weigh') return;
      void this.load().catch(() => undefined);
      if (this.logs()) void this.loadLogs().catch(() => undefined);
    });
  }

  /** the last weigh-in was kept on the phone (no network): it counts once sent */
  readonly lastQueued = signal(false);

  async saveLog(day: string, input: LogInput): Promise<Summary | null> {
    try {
      const s = await this.api.saveLog(day, input);
      this.lastQueued.set(false);
      this.summary.set(s);
      if (this.logs()) await this.loadLogs();
      return s;
    } catch (e) {
      if (!isOffline(e)) throw e;
      this.outbox.add({ kind: 'weigh', method: 'PUT', url: `/api/me/logs/${day}`, body: input, day });
      this.lastQueued.set(true);
      return this.summary();
    }
  }

  async deleteLog(day: string): Promise<void> {
    await this.api.deleteLog(day);
    await Promise.all([this.load(), this.loadLogs()]);
  }

  clear(): void {
    this.summary.set(null);
    this.logs.set(null);
  }
}
