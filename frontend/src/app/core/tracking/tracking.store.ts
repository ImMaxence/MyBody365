import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../api/api.service';
import type { BodyLogEntry, LogInput, MacroSplit, Milestone, MilestoneInput, ProfileInput, Summary } from '../api/models';
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

  /** the evening weigh-in (1.9): for itself, the trend and the streak keep the morning one */
  async saveEvening(day: string, weightKg: number | null): Promise<void> {
    this.summary.set(await this.api.saveEvening(day, weightKg));
    if (this.logs()) await this.loadLogs();
  }

  async saveLog(day: string, input: LogInput): Promise<Summary | null> {
    try {
      // the milestones reached before: a weigh-in that reaches another one is celebrated
      const before = input.weightKg == null ? null : (this.milestones() ?? (await this.loadMilestones().catch(() => null)));
      const s = await this.api.saveLog(day, input);
      this.lastQueued.set(false);
      this.summary.set(s);
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
    this.logs.set(null);
    this.milestones.set(null);
    this.celebrate.set(null);
  }
}
