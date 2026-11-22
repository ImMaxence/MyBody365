import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import type { BodyLogEntry, LogInput, MacroSplit, Milestone, MilestoneInput, ProfileInput, Summary } from '../api/models';
import { SessionStore } from '../auth/session.store';
import { Outbox, isOffline } from '../offline/outbox';
import { FRESH_MS, forget, fresh, keep, kept } from '../api/kept';

/** 1.16: today's summary, kept on the phone so that Today opens complete on the next start */
const SUMMARY_KEY = 'mb.summary';

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
  /** one's milestones (1.8), in the order of the way */
  readonly milestones = signal<Milestone[] | null>(null);
  /** a milestone the last weigh-in has just reached: the shell celebrates it */
  readonly celebrate = signal<Milestone | null>(null);

  async loadMilestones(): Promise<Milestone[]> {
    const list = await this.api.milestones();
    this.milestones.set(list);
    return list;
  }

  async addMilestone(input: MilestoneInput): Promise<void> {
    this.milestones.set(await this.api.addMilestone(input));
  }

  async updateMilestone(id: string, input: MilestoneInput): Promise<void> {
    this.milestones.set(await this.api.updateMilestone(id, input));
  }

  async deleteMilestone(id: string): Promise<void> {
    this.milestones.set(await this.api.deleteMilestone(id));
  }

  async load(): Promise<Summary | null> {
    try {
      const s = await this.api.summary();
      this.put(s);
      return s;
    } catch {
      return null;
    }
  }

  /**
   * 1.16: the summary seen less than FRESH_MS ago as it is (the one kept on the phone for today shows at once), else the
   * server's: coming back to a tab no longer asks for everything again
   */
  ensure(maxAge = FRESH_MS): Promise<Summary | null> {
    if (!this.summary()) this.restore();
    if (this.summary() && fresh(this.summaryAt, maxAge)) return Promise.resolve(this.summary());
    return (this.loadingSummary ??= this.load().finally(() => (this.loadingSummary = null)));
  }

  async loadLogs(): Promise<BodyLogEntry[]> {
    const logs = await this.api.logs();
    this.logs.set(logs);
    this.logsAt = Date.now();
    return logs;
  }

  /** 1.16: the history seen less than FRESH_MS ago as it is, else the server's */
  ensureLogs(maxAge = FRESH_MS): Promise<BodyLogEntry[]> {
    const logs = this.logs();
    if (logs && fresh(this.logsAt, maxAge)) return Promise.resolve(logs);
    return (this.loadingLogs ??= this.loadLogs().finally(() => (this.loadingLogs = null)));
  }

  private summaryAt = 0;
  private logsAt = 0;
  private loadingSummary: Promise<Summary | null> | null = null;
  private loadingLogs: Promise<BodyLogEntry[]> | null = null;

  /** a summary from the server: fresh, and kept on the phone for today */
  private put(s: Summary): void {
    this.summary.set(s);
    this.summaryAt = Date.now();
    keep(SUMMARY_KEY, this.session.account()?.id, localDay(), s);
  }

  private restore(): void {
    const s = kept<Summary>(SUMMARY_KEY, this.session.account()?.id, localDay());
    if (s) this.summary.set(s);
  }

  async saveProfile(input: ProfileInput): Promise<Summary> {
    const s = await this.api.saveProfile(input);
    this.put(s);
    const account = this.session.account();
    if (account && !account.profileComplete) this.session.setAccount({ ...account, profileComplete: true });
    this.logs.set(null);
    return s;
  }

  async setAdaptive(on: boolean): Promise<Summary> {
    const s = await this.api.setAdaptive(on);
    this.put(s);
    return s;
  }

  async setMacroSplit(split: MacroSplit): Promise<Summary> {
    const s = await this.api.setMacroSplit(split);
    this.put(s);
    return s;
  }

  constructor() {
    // a weigh-in noted offline reached the server: the summary and the curve again
    this.outbox.sent.subscribe((p) => {
      if (p.kind !== 'weigh' && p.kind !== 'evening') return;
      void this.load().catch(() => undefined);
      if (this.logs()) void this.loadLogs().catch(() => undefined);
    });
  }

  /** the last weigh-in was kept on the phone (no network): it counts once sent */
  readonly lastQueued = signal(false);

  /** the evening weigh-in (1.9): for itself, the trend and the streak keep the morning one */
  async saveEvening(day: string, weightKg: number | null): Promise<void> {
    try {
      this.put(await this.api.saveEvening(day, weightKg));
      this.lastQueued.set(false);
      if (this.logs()) await this.loadLogs();
    } catch (e) {
      // 1.17: without network, kept on the phone (shown greyed on Today) and sent when it is back
      if (!isOffline(e)) throw e;
      const url = `/api/me/logs/${day}/evening`;
      this.outbox.add({ kind: 'evening', method: weightKg == null ? 'DELETE' : 'PUT', url, body: weightKg == null ? null : { weightKg }, day });
      this.lastQueued.set(true);
    }
  }

  async saveLog(day: string, input: LogInput): Promise<Summary | null> {
    try {
      // the milestones reached before: a weigh-in that reaches another one is celebrated
      const before = input.weightKg == null ? null : (this.milestones() ?? (await this.loadMilestones().catch(() => null)));
      const s = await this.api.saveLog(day, input);
      this.lastQueued.set(false);
      this.put(s);
      if (this.logs()) await this.loadLogs();
      if (before) void this.newlyReached(before);
      return s;
    } catch (e) {
      if (!isOffline(e)) throw e;
      this.outbox.add({ kind: 'weigh', method: 'PUT', url: `/api/me/logs/${day}`, body: input, day });
      this.lastQueued.set(true);
      return this.summary();
    }
  }

  /** the furthest milestone this weigh-in reached, if any */
  private async newlyReached(before: Milestone[]): Promise<void> {
    const was = new Set(before.filter((m) => m.reachedOn).map((m) => m.id));
    const now = await this.loadMilestones().catch(() => null);
    const fresh = (now ?? []).filter((m) => m.reachedOn && !was.has(m.id));
    if (fresh.length) this.celebrate.set(fresh[fresh.length - 1]);
  }

  async deleteLog(day: string): Promise<void> {
    await this.api.deleteLog(day);
    await Promise.all([this.load(), this.loadLogs()]);
  }

  clear(): void {
    this.summary.set(null);
    this.summaryAt = 0;
    this.logsAt = 0;
    forget(SUMMARY_KEY);
    this.logs.set(null);
    this.milestones.set(null);
    this.celebrate.set(null);
  }
}
