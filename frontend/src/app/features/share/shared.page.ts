import { ChangeDetectionStrategy, Component, DOCUMENT, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Meta, Title } from '@angular/platform-browser';
import { HabitsApi, SharedView } from '../../core/api/habits-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';

/**
 * 1.19: what a member shares with a coach or a dietitian (/partage#token): their weigh-ins, their meals of the last two
 * weeks and their blood pressure, as they chose, read-only, in any browser, without an account. The token stays after the
 * # (never sent in an address the server logs); the page is never indexed and can be printed. Never a photo.
 */
@Component({
  selector: 'app-shared',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, LogoComponent],
  template: `
    <main id="main" class="wrap">
      <header class="top">
        <app-logo />
        @if (view(); as v) {
          <button type="button" class="btn btn-secondary btn-s print" (click)="print()"><app-icon name="download" [size]="18" /> {{ 'shared.print' | t }}</button>
        }
      </header>

      @if (view(); as v) {
        <section class="intro">
          <h1 class="title">{{ 'shared.title' | t: { name: v.name } }}</h1>
          <p class="muted small">
            @if (v.label) { {{ v.label }} · }{{ 'shared.until' | t: { date: i18n.date(v.until, { day: 'numeric', month: 'long', year: 'numeric' }) } }}
            · {{ 'shared.readOnly' | t }}
          </p>
        </section>

        @if (v.weight; as w) {
          <section class="card block">
            <h2 class="h3">{{ 'shared.weight.title' | t }}</h2>
            <dl class="facts">
              @if (w.startKg != null) {
                <div><dt>{{ 'shared.weight.start' | t }}</dt><dd class="num">{{ i18n.number(w.startKg, 1) }} kg</dd></div>
              }
              @if (latest(); as l) {
                <div><dt>{{ 'shared.weight.current' | t }}</dt><dd class="num">{{ i18n.number(l.kg, 1) }} kg</dd></div>
              }
              @if (w.goalKg != null) {
                <div><dt>{{ 'shared.weight.goal' | t }}</dt><dd class="num">{{ i18n.number(w.goalKg, 1) }} kg</dd></div>
              }
              @if (bmi(); as b) {
                <div><dt>{{ 'shared.weight.bmi' | t }}</dt><dd class="num">{{ i18n.number(b, 1) }}</dd></div>
              }
            </dl>
            @if (w.logs.length >= 2) {
              <svg class="chart" viewBox="0 0 600 180" preserveAspectRatio="none" role="img" [attr.aria-label]="'shared.weight.chart' | t">
                <path class="line" [attr.d]="chart()" />
              </svg>
              <p class="tiny muted axis num">
                <span>{{ i18n.date(w.logs[0].day, { day: 'numeric', month: 'short' }) }}</span>
                <span>{{ i18n.date(w.logs[w.logs.length - 1].day, { day: 'numeric', month: 'short' }) }}</span>
              </p>
            }
            <table class="table">
              <thead><tr><th>{{ 'shared.date' | t }}</th><th>{{ 'shared.weight.morning' | t }}</th><th>{{ 'shared.weight.evening' | t }}</th></tr></thead>
              <tbody>
                @for (l of recentLogs(); track l.day) {
                  <tr><td>{{ i18n.date(l.day, { weekday: 'short', day: 'numeric', month: 'short' }) }}</td><td class="num">{{ i18n.number(l.kg, 1) }} kg</td>
                    <td class="num">{{ l.eveningKg != null ? i18n.number(l.eveningKg, 1) + ' kg' : '–' }}</td></tr>
                }
              </tbody>
            </table>
          </section>
        }

        @if (v.meals; as meals) {
          <section class="card block">
            <h2 class="h3">{{ 'shared.meals.title' | t }}</h2>
            @if (v.targetKcal) {
              <p class="small muted">{{ 'shared.meals.target' | t: { kcal: i18n.number(v.targetKcal) } }}</p>
            }
            @for (d of meals; track d.day) {
              <details class="day">
                <summary>
                  <span class="d">{{ i18n.date(d.day, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
                  <b class="num">{{ i18n.number(d.kcal) }} kcal</b>
                </summary>
                <p class="tiny muted num">{{ 'shared.meals.macros' | t: { p: i18n.number(d.proteinG ?? 0), c: i18n.number(d.carbsG ?? 0), f: i18n.number(d.fatG ?? 0) } }}</p>
                <ul>
                  @for (l of d.lines; track $index) {
                    <li><span class="slot">{{ 'meals.slots.' + l.slot | t }}</span><span class="n">{{ l.name }}{{ amount(l) }}</span><span class="num">{{ i18n.number(l.kcal) }} kcal</span></li>
                  }
                </ul>
              </details>
            } @empty {
              <p class="small muted">{{ 'shared.meals.none' | t }}</p>
            }
          </section>
        }

        @if (v.bp; as bp) {
          <section class="card block">
            <h2 class="h3">{{ 'shared.bp.title' | t }}</h2>
            @if (bpAverage(); as a) {
              <p class="avg num"><b>{{ a.sys }}/{{ a.dia }}</b> mmHg @if (a.pulse) { · {{ a.pulse }} bpm } <span class="small muted">{{ 'shared.bp.average' | t: { n: bp.length } }}</span></p>
            }
            <table class="table">
              <thead><tr><th>{{ 'shared.date' | t }}</th><th></th><th>mmHg</th><th>{{ 'shared.bp.pulse' | t }}</th></tr></thead>
              <tbody>
                @for (r of bp; track r.day + r.moment) {
                  <tr [class.high]="r.systolic >= 135 || r.diastolic >= 85">
                    <td>{{ i18n.date(r.day, { day: 'numeric', month: 'short' }) }}</td><td>{{ 'shared.bp.' + r.moment | t }}</td>
                    <td class="num">{{ r.systolic }}/{{ r.diastolic }}</td><td class="num">{{ r.pulse ?? '–' }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="tiny muted">{{ 'shared.bp.note' | t }}</p>
          </section>
        }

        <p class="tiny muted foot">{{ 'shared.foot' | t: { name: v.name, date: i18n.date(v.generatedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } }}</p>
      } @else if (state() === 'gone') {
        <section class="card block center">
          <h1 class="h3">{{ 'shared.gone' | t }}</h1>
          <p class="muted">{{ 'shared.goneText' | t }}</p>
        </section>
      } @else if (state() === 'unknown') {
        <section class="card block center">
          <h1 class="h3">{{ 'shared.unknown' | t }}</h1>
          <p class="muted">{{ 'shared.unknownText' | t }}</p>
        </section>
      } @else {
        <p class="center"><span class="spinner"></span></p>
      }
    </main>
  `,
  styles: `
    .wrap {
      width: min(100% - 32px, 760px);
      margin: 0 auto;
      padding: 24px 0 64px;
      display: grid;
      gap: 18px;
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .title {
      font-family: var(--font-display);
      font-stretch: 115%;
      font-weight: 800;
      font-size: clamp(1.8rem, 6vw, 2.4rem);
      line-height: 1.05;
    }
    .intro p {
      margin: 6px 0 0;
    }
    .block {
      display: grid;
      gap: 12px;
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
      margin: 0;
    }
    .facts div {
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .facts dt {
      font-size: var(--fs-s);
      color: var(--fg-2);
    }
    .facts dd {
      margin: 2px 0 0;
      font-size: 1.2rem;
      font-weight: 750;
    }
    .chart {
      width: 100%;
      height: 180px;
    }
    .chart .line {
      fill: none;
      stroke: var(--accent);
      stroke-width: 3;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
    .axis {
      display: flex;
      justify-content: space-between;
      margin: -6px 0 0;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--fs-s);
    }
    .table th {
      text-align: left;
      font-weight: 650;
      color: var(--fg-2);
      padding: 6px 4px;
      border-bottom: 1px solid var(--line);
    }
    .table td {
      padding: 7px 4px;
      border-bottom: 1px solid var(--line);
    }
    .table tr.high td {
      color: var(--accent-text);
      font-weight: 650;
    }
    .day {
      border-top: 1px solid var(--line);
      padding: 8px 0;
    }
    .day summary {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      cursor: pointer;
      font-weight: 650;
    }
    .day summary .d::first-letter {
      text-transform: uppercase;
    }
    .day ul {
      display: grid;
      gap: 4px;
      margin: 6px 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--fs-s);
    }
    .day li {
      display: grid;
      grid-template-columns: 96px 1fr auto;
      gap: 8px;
    }
    .day .slot {
      color: var(--fg-2);
    }
    .avg {
      margin: 0;
      font-size: 1.3rem;
    }
    .center {
      text-align: center;
    }
    .foot {
      text-align: center;
    }
    @media print {
      .print {
        display: none;
      }
      .card {
        box-shadow: none;
        break-inside: avoid;
      }
      .day[open] summary ~ *,
      .day ul {
        display: grid;
      }
    }
  `,
})
export class SharedPage {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(HabitsApi);
  private readonly doc = inject(DOCUMENT);
  protected readonly view = signal<SharedView | null>(null);
  protected readonly state = signal<'loading' | 'gone' | 'unknown'>('loading');

  protected readonly latest = computed(() => this.view()?.weight?.logs.at(-1) ?? null);
  protected readonly recentLogs = computed(() => [...(this.view()?.weight?.logs ?? [])].reverse().slice(0, 30));
  protected readonly bmi = computed(() => {
    const w = this.view()?.weight;
    const kg = this.latest()?.kg;
    return w?.heightCm && kg ? kg / (w.heightCm / 100) ** 2 : null;
  });
  protected readonly chart = computed(() => {
    const logs = this.view()?.weight?.logs ?? [];
    if (logs.length < 2) return '';
    const kgs = logs.map((l) => l.kg);
    const min = Math.min(...kgs);
    const max = Math.max(...kgs);
    const span = Math.max(1, max - min);
    const t0 = Date.parse(logs[0].day);
    const t1 = Math.max(t0 + 1, Date.parse(logs[logs.length - 1].day));
    return logs
      .map((l, i) => `${i ? 'L' : 'M'}${(((Date.parse(l.day) - t0) / (t1 - t0)) * 600).toFixed(1)},${(10 + ((max - l.kg) / span) * 160).toFixed(1)}`)
      .join(' ');
  });
  protected readonly bpAverage = computed(() => {
    const rows = this.view()?.bp ?? [];
    if (!rows.length) return null;
    const n = rows.reduce((t, r) => t + r.readings, 0);
    const avg = (f: (r: (typeof rows)[number]) => number) => Math.round(rows.reduce((t, r) => t + f(r) * r.readings, 0) / n);
    const pulses = rows.filter((r) => r.pulse != null);
    return {
      sys: avg((r) => r.systolic),
      dia: avg((r) => r.diastolic),
      pulse: pulses.length ? Math.round(pulses.reduce((t, r) => t + r.pulse!, 0) / pulses.length) : null,
    };
  });

  constructor() {
    inject(Title).setTitle('MyBody365');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // the language of the one reading it (its words were loaded before the page)
    this.i18n.set(this.i18n.preferred());
    const token = (this.doc.location?.hash ?? '').replace(/^#/, '');
    if (!token) {
      this.state.set('unknown');
      return;
    }
    this.api
      .shared(token)
      .then((v) => this.view.set(v))
      .catch((e: unknown) => this.state.set(e instanceof HttpErrorResponse && e.status === 410 ? 'gone' : 'unknown'));
  }

  protected amount(l: { grams: number | null; servings: number | null; liquid: boolean }): string {
    if (l.grams) return ` · ${this.i18n.number(l.grams)} ${l.liquid ? 'ml' : 'g'}`;
    if (l.servings && l.servings !== 1) return ` · ${this.i18n.t('shared.meals.servings', { n: this.i18n.number(l.servings, l.servings % 1 ? 1 : 0) })}`;
    return '';
  }

  protected print(): void {
    // the meals of each day open on the sheet
    this.doc.querySelectorAll('details.day').forEach((d) => d.setAttribute('open', ''));
    this.doc.defaultView?.print();
  }
}
