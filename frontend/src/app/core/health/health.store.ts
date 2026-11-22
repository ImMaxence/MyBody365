import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { fresh } from '../api/kept';
import { Outbox, isOffline } from '../offline/outbox';
import { localDay } from '../tracking/tracking.store';

export type Moment = 'MORNING' | 'EVENING';

/** a reading of the monitor, in mmHg (the pulse in beats a minute) */
export interface Reading {
  systolic: number;
  diastolic: number;
  pulse?: number | null;
}

/** a moment of a day: the average of its readings; pending: kept on the phone, not sent yet (its outbox id) */
export interface BpEntry {
  day: string;
  moment: Moment;
  systolic: number;
  diastolic: number;
  pulse?: number | null;
  readings: number;
  pending?: string;
}

export interface BpSettings {
  reminder: boolean;
  morning: string;
  evening: string;
}

export interface Medication {
  id: string;
  name: string;
  dose?: string | null;
  times: string[];
  days: number[];
  reminders: boolean;
}

export interface MedicationInput {
  name: string;
  dose?: string | null;
  times: string[];
  days: number[];
  reminders: boolean;
}

/** an intake of the day: a medicine at one of its times; pending: ticked without network (its outbox id) */
export interface Intake {
  medicationId: string;
  slot: string;
  taken: boolean;
  takenAt?: string | null;
  pending?: string;
}

export interface PillBox {
  items: Medication[];
  day: string;
  intakes: Intake[];
}

/**
 * How a blood pressure measured at home reads (the French and European guides for home measurement): under 135/85 in
 * the usual range, from 135/85 high for a home measure, from 180/110 to see a doctor at once; under 90 of systolic, low.
 * Information only: never a diagnosis.
 */
export type BpLevel = 'low' | 'ok' | 'high' | 'urgent';

export function bpLevel(systolic: number, diastolic: number): BpLevel {
  if (systolic >= 180 || diastolic >= 110) return 'urgent';
  if (systolic >= 135 || diastolic >= 85) return 'high';
  if (systolic < 90) return 'low';
  return 'ok';
}

/** the average of readings, as the server keeps it (rounded; the pulse of those that give it) */
export function average(readings: Reading[]): { systolic: number; diastolic: number; pulse: number | null } {
  const ok = readings.filter((r) => r.systolic > 0 && r.diastolic > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const pulses = ok.map((r) => r.pulse).filter((p): p is number => p != null && p > 0);
  return { systolic: avg(ok.map((r) => r.systolic)), diastolic: avg(ok.map((r) => r.diastolic)), pulse: pulses.length ? avg(pulses) : null };
}

/**
 * 1.17: the blood pressure (the last 90 days) and the pill box of the signed-in member, kept between their screens (Today,
 * Progress, the profile) and asked again when older than 30 s. Without network, a measure or an intake is kept on the
 * phone (greyed) and sent when the network is back.
 */
@Injectable({ providedIn: 'root' })
export class HealthStore {
  private readonly http = inject(HttpClient);
  private readonly outbox = inject(Outbox);

  private readonly serverBp = signal<BpEntry[] | null>(null);
  private bpAt = 0;
  readonly settings = signal<BpSettings | null>(null);
  private readonly serverBox = signal<PillBox | null>(null);
  private boxAt = 0;

  /** the measures, oldest first, with those waiting on the phone */
  readonly bp = computed<BpEntry[] | null>(() => {
    const list = this.serverBp();
    if (!list) return null;
    const waiting = this.outbox.of('bp');
    if (!waiting.length) return list;
    const byKey = new Map(list.map((e) => [e.day + '/' + e.moment, e]));
    for (const p of waiting) {
      const [day, moment] = (p.target ?? '').split('/');
      if (p.method === 'DELETE') byKey.delete(p.target!);
      else {
        const a = average((p.body as { readings: Reading[] }).readings);
        byKey.set(p.target!, { day, moment: moment as Moment, ...a, readings: (p.body as { readings: Reading[] }).readings.length, pending: p.id });
      }
    }
    return [...byKey.values()].sort((x, y) => x.day.localeCompare(y.day) || (x.moment === 'MORNING' ? -1 : 1));
  });

  /** today's morning and evening */
  readonly today = computed(() => {
    const d = localDay();
    const list = this.bp() ?? [];
    return { MORNING: list.find((e) => e.day === d && e.moment === 'MORNING') ?? null, EVENING: list.find((e) => e.day === d && e.moment === 'EVENING') ?? null };
  });

  /** the pill box, with the intakes ticked without network */
  readonly box = computed<PillBox | null>(() => {
    const b = this.serverBox();
    if (!b) return null;
    const waiting = this.outbox.of('intake', b.day);
    if (!waiting.length) return b;
    const map = new Map(waiting.map((p) => [p.target!, p]));
    return {
      ...b,
      intakes: b.intakes.map((i) => {
        const p = map.get(`${i.medicationId}/${b.day}/${i.slot}`);
        return p ? { ...i, taken: (p.body as { taken: boolean }).taken, pending: p.id } : i;
      }),
    };
  });

  constructor() {
    this.outbox.sent.subscribe((p) => {
      if (p.kind === 'bp') void this.loadBp().catch(() => undefined);
      if (p.kind === 'intake') void this.loadBox().catch(() => undefined);
    });
  }

  // ── the blood pressure ────────────────────────────────────────────────

  async loadBp(): Promise<BpEntry[]> {
    const list = await firstValueFrom(this.http.get<BpEntry[]>('/api/me/bp', { params: { days: 90 } }));
    this.serverBp.set(list);
    this.bpAt = Date.now();
    return list;
  }

  ensureBp(): Promise<unknown> {
    return this.serverBp() && fresh(this.bpAt) ? Promise.resolve() : this.loadBp().catch(() => undefined);
  }

  /** saved, or kept on the phone without network (true then) */
  async saveBp(day: string, moment: Moment, readings: Reading[]): Promise<boolean> {
    const body = { readings };
    try {
      const e = await firstValueFrom(this.http.put<BpEntry>(`/api/me/bp/${day}/${moment}`, body));
      this.serverBp.update((l) => [...(l ?? []).filter((x) => !(x.day === day && x.moment === moment)), e].sort((x, y) => x.day.localeCompare(y.day)));
      return false;
    } catch (err) {
      if (!isOffline(err)) throw err;
      this.outbox.add({ kind: 'bp', method: 'PUT', url: `/api/me/bp/${day}/${moment}`, body, day, target: `${day}/${moment}` });
      return true;
    }
  }

  async deleteBp(day: string, moment: Moment): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/me/bp/${day}/${moment}`));
    this.serverBp.update((l) => (l ?? []).filter((x) => !(x.day === day && x.moment === moment)));
  }

  async loadSettings(): Promise<BpSettings> {
    const s = await firstValueFrom(this.http.get<BpSettings>('/api/me/bp/settings'));
    this.settings.set(s);
    return s;
  }

  async saveSettings(s: BpSettings): Promise<void> {
    this.settings.set(s);
    this.settings.set(await firstValueFrom(this.http.put<BpSettings>('/api/me/bp/settings', s)));
  }

  // ── the pill box ──────────────────────────────────────────────────────

  async loadBox(): Promise<PillBox> {
    const b = await firstValueFrom(this.http.get<PillBox>('/api/me/medications'));
    this.serverBox.set(b);
    this.boxAt = Date.now();
    return b;
  }

  ensureBox(): Promise<unknown> {
    const b = this.serverBox();
    // a new day: today's intakes
    return b && b.day === localDay() && fresh(this.boxAt) ? Promise.resolve() : this.loadBox().catch(() => undefined);
  }

  async addMedication(m: MedicationInput): Promise<void> {
    this.setBox(await firstValueFrom(this.http.post<PillBox>('/api/me/medications', m)));
  }

  async updateMedication(id: string, m: MedicationInput): Promise<void> {
    this.setBox(await firstValueFrom(this.http.put<PillBox>(`/api/me/medications/${id}`, m)));
  }

  async deleteMedication(id: string): Promise<void> {
    this.setBox(await firstValueFrom(this.http.delete<PillBox>(`/api/me/medications/${id}`)));
  }

  /** ticked at once on screen; without network, kept on the phone and sent later */
  async setTaken(i: Intake, taken: boolean): Promise<void> {
    const b = this.serverBox();
    if (!b) return;
    const day = b.day;
    this.serverBox.set({ ...b, intakes: b.intakes.map((x) => (x.medicationId === i.medicationId && x.slot === i.slot ? { ...x, taken } : x)) });
    const body = { day, slot: i.slot, taken };
    try {
      this.setBox(await firstValueFrom(this.http.put<PillBox>(`/api/me/medications/${i.medicationId}/intake`, body)));
    } catch (e) {
      if (isOffline(e)) {
        this.outbox.add({ kind: 'intake', method: 'PUT', url: `/api/me/medications/${i.medicationId}/intake`, body, day, target: `${i.medicationId}/${day}/${i.slot}` });
        return;
      }
      this.serverBox.set(b);
      throw e;
    }
  }

  private setBox(b: PillBox): void {
    this.serverBox.set(b);
    this.boxAt = Date.now();
  }

  clear(): void {
    this.serverBp.set(null);
    this.serverBox.set(null);
    this.settings.set(null);
    this.bpAt = 0;
    this.boxAt = 0;
  }
}
