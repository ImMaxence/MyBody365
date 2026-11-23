import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { BpEntry, HealthStore } from '../../core/health/health.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SessionStore } from '../../core/auth/session.store';
import { localDay } from '../../core/tracking/tracking.store';
import { shiftDay } from '../../core/meals/meals.store';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

/**
 * 1.19: « Relevé pour ton médecin »: the self-measurement protocol of the French guidelines (HAS): 3 days in a row, 3
 * readings a minute apart in the morning (before breakfast and the medicines) and in the evening (before bed), seated and
 * calm. The page follows the 6 sessions of the 3 days chosen (the last 3 by default), gives the mean of all the readings,
 * of the mornings and of the evenings, against the threshold of self-measurement (135/85), every session, and the
 * treatments of the pill box with their doses; then it is printed (or saved as a PDF from the print sheet) for the doctor.
 * An indication, never a diagnosis: the doctor reads it.
 */
@Component({
  selector: 'app-bp-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page report">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'bpReport.title' | t }}</h1>
      </header>
      <section class="card stack no-print">
        <p class="small">{{ 'bpReport.how' | t }}</p>
        <ol class="steps small">
          <li>{{ 'bpReport.step1' | t }}</li>
          <li>{{ 'bpReport.step2' | t }}</li>
          <li>{{ 'bpReport.step3' | t }}</li>
        </ol>
        <label class="field">
          <span class="label">{{ 'bpReport.from' | t }}</span>
          <span class="input-icon"><input class="input" type="date" [value]="from()" [max]="today" (change)="from.set($any($event.target).value || defaultFrom)" /><span class="end"><app-icon name="calendar" [size]="17" /></span></span>
        </label>
      </section>

      <section class="card stack">
        <h2 class="h3">{{ 'bpReport.sessions' | t: { from: i18n.date(from(), { day: 'numeric', month: 'long' }), to: i18n.date(to(), { day: 'numeric', month: 'long' }) } }}</h2>
        <ul class="grid" role="list">
          @for (s of sessions(); track s.day + s.moment) {
            <li [class.done]="s.entry" [class.part]="s.entry && s.entry.readings < 3">
              <span class="when">{{ i18n.date(s.day, { weekday: 'short', day: 'numeric' }) }} · {{ 'bpReport.' + s.moment | t }}</span>
              @if (s.entry; as e) {
                <b class="num">{{ e.systolic }}/{{ e.diastolic }}</b>
                <span class="tiny muted">{{ (e.readings === 1 ? 'bpReport.readingsOne' : 'bpReport.readingsMany') | t: { n: e.readings } }}</span>
              } @else {
                <span class="tiny muted">{{ 'bpReport.missing' | t }}</span>
              }
            </li>
          }
        </ul>
        <p class="small" [class.ok]="complete()">
          <app-icon [name]="complete() ? 'check' : 'info'" [size]="16" />
          {{ complete() ? ('bpReport.complete' | t) : ('bpReport.incomplete' | t: { n: doneCount() }) }}
        </p>
      </section>

      @if (averages(); as a) {
        <section class="card stack">
          <h2 class="h3">{{ 'bpReport.averages' | t }}</h2>
          <div class="avgs">
            <div><span class="label">{{ 'bpReport.all' | t }}</span><b class="num" [class.high]="a.all.high">{{ a.all.sys }}/{{ a.all.dia }}</b></div>
            @if (a.morning) {
              <div><span class="label">{{ 'bpReport.MORNING' | t }}</span><b class="num" [class.high]="a.morning.high">{{ a.morning.sys }}/{{ a.morning.dia }}</b></div>
            }
            @if (a.evening) {
              <div><span class="label">{{ 'bpReport.EVENING' | t }}</span><b class="num" [class.high]="a.evening.high">{{ a.evening.sys }}/{{ a.evening.dia }}</b></div>
            }
            @if (a.pulse) {
              <div><span class="label">{{ 'bpReport.pulse' | t }}</span><b class="num">{{ a.pulse }}</b></div>
            }
          </div>
          <p class="tiny muted">{{ 'bpReport.threshold' | t }}</p>
        </section>
      }

      @if (meds().length) {
        <section class="card stack">
          <h2 class="h3">{{ 'bpReport.meds' | t }}</h2>
          <ul class="meds small">
            @for (m of meds(); track m.id) {
              <li><b>{{ m.name }}</b>@if (m.dose) { · {{ m.dose }} } · {{ m.times.join(', ') }}</li>
            }
          </ul>
        </section>
      }

      <p class="tiny muted print-only">{{ 'bpReport.footer' | t: { name: name(), date: i18n.date(today, { day: 'numeric', month: 'long', year: 'numeric' }) } }}</p>
      <button type="button" class="btn btn-primary btn-block no-print" [disabled]="!averages()" (click)="print()">
        <app-icon name="download" [size]="18" /> {{ 'bpReport.print' | t }}
      </button>
      <p class="tiny muted center no-print">{{ 'bpReport.disclaimer' | t }}</p>
    </main>
  `,
  styles: `
    .small-title {
      font-size: 1.6rem;
    }
    .steps {
      display: grid;
      gap: 4px;
      margin: 0;
      padding-left: 20px;
      color: var(--fg-2);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .grid li {
      display: grid;
      gap: 2px;
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      border: 1.5px dashed var(--line-strong);
    }
    .grid li.done {
      border: 1.5px solid color-mix(in srgb, var(--success) 45%, transparent);
      background: color-mix(in srgb, var(--success) 8%, var(--surface));
    }
    .grid li.part {
      border-color: color-mix(in srgb, #f5b301 60%, transparent);
    }
    .when {
      font-size: var(--fs-s);
      font-weight: 650;
      color: var(--fg-2);
    }
    .grid b {
      font-size: 1.2rem;
    }
    .ok {
      color: var(--success);
      font-weight: 650;
    }
    p.small {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
    }
    .avgs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 10px;
    }
    .avgs div {
      display: grid;
      gap: 2px;
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .avgs b {
      font-size: 1.5rem;
    }
    .avgs b.high {
      color: var(--accent-text);
    }
    .meds {
      display: grid;
      gap: 6px;
      margin: 0;
      padding-left: 18px;
    }
    .center {
      text-align: center;
    }
    .print-only {
      display: none;
    }
    @media print {
      .no-print {
        display: none !important;
      }
      .print-only {
        display: block;
      }
      .card {
        box-shadow: none;
        break-inside: avoid;
      }
    }
  `,
})
export class BpReportPage {
  protected readonly i18n = inject(I18nService);
  private readonly health = inject(HealthStore);
  private readonly doc = inject(DOCUMENT);
  private readonly session = inject(SessionStore);
  protected readonly today = localDay();
  protected readonly defaultFrom = shiftDay(this.today, -2);
  /** the first of the 3 days */
  protected readonly from = signal(this.defaultFrom);
  protected readonly to = computed(() => shiftDay(this.from(), 2));
  protected readonly name = computed(() => this.session.account()?.displayName ?? '');

  /** the 6 sessions of the 3 days, each with what was measured */
  protected readonly sessions = computed(() => {
    const list = this.health.bp() ?? [];
    const out: { day: string; moment: 'MORNING' | 'EVENING'; entry: BpEntry | null }[] = [];
    for (let i = 0; i < 3; i++) {
      const day = shiftDay(this.from(), i);
      for (const moment of ['MORNING', 'EVENING'] as const) {
        out.push({ day, moment, entry: list.find((e) => e.day === day && e.moment === moment && !e.pending) ?? null });
      }
    }
    return out;
  });
  protected readonly doneCount = computed(() => this.sessions().filter((s) => s.entry).length);
  /** the 6 sessions, each with its 3 readings */
  protected readonly complete = computed(() => this.sessions().every((s) => s.entry && s.entry.readings >= 3));

  /** the means of the readings (a session weighs as many readings as it has) */
  protected readonly averages = computed(() => {
    const entries = this.sessions()
      .map((s) => s.entry)
      .filter((e): e is BpEntry => !!e);
    if (!entries.length) return null;
    const mean = (list: BpEntry[]) => {
      if (!list.length) return null;
      const n = list.reduce((t, e) => t + e.readings, 0);
      const sys = Math.round(list.reduce((t, e) => t + e.systolic * e.readings, 0) / n);
      const dia = Math.round(list.reduce((t, e) => t + e.diastolic * e.readings, 0) / n);
      return { sys, dia, high: sys >= 135 || dia >= 85 };
    };
    const pulses = entries.filter((e) => e.pulse != null);
    return {
      all: mean(entries)!,
      morning: mean(entries.filter((e) => e.moment === 'MORNING')),
      evening: mean(entries.filter((e) => e.moment === 'EVENING')),
      pulse: pulses.length ? Math.round(pulses.reduce((t, e) => t + e.pulse!, 0) / pulses.length) : null,
    };
  });

  protected readonly meds = computed(() => this.health.box()?.items ?? []);

  constructor() {
    void this.health.ensureBp();
    void this.health.ensureBox();
  }

  protected print(): void {
    this.doc.defaultView?.print();
  }
}
