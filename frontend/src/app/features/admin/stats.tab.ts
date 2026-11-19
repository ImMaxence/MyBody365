import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';

interface Sample {
  at: string;
  hostCpu?: number | null;
  hostMemUsed?: number | null;
  appCpu?: number | null;
  appMem?: number | null;
  storageCpu?: number | null;
  storageMem?: number | null;
}

interface Part {
  key: string;
  bytes: number;
}

/** what the project takes on the server (backend admin/ServerStats.java) */
export interface ServerStats {
  at: string;
  since: string;
  cpus?: number;
  hostCpu?: number | null;
  hostMemTotal?: number | null;
  hostMemUsed?: number | null;
  diskTotal?: number | null;
  diskUsed?: number | null;
  appMem?: number | null;
  appMemLimit?: number | null;
  appCpu?: number | null;
  heapUsed?: number;
  heapMax?: number;
  uptimeSeconds?: number;
  threads?: number;
  storageMem?: number | null;
  storageCpu?: number | null;
  storageBytes?: number | null;
  storageFiles?: number | null;
  databaseBytes?: number | null;
  connections?: number | null;
  tables: Part[];
  files: Part[];
  counts: Record<string, number>;
  history: Sample[];
}

type SeriesKey = 'storage' | 'host' | 'app';
interface Series {
  key: SeriesKey;
  values: (number | null)[];
}

/** the chart's frame (viewBox units) */
const W = 320;
const H = 120;
const PAD = { l: 34, r: 8, t: 8, b: 18 };

/**
 * 1.13: « Statistiques »: what MyBody365 takes on its server. The storage (the database, the photos, the disk), the memory
 * and the processor of the app, of the photo storage and of the whole machine, their last 24 hours, and a few counts.
 * Refreshed every 30 seconds while open.
 */
@Component({
  selector: 'app-admin-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, TranslatePipe, IconComponent],
  template: `
    <p class="small muted intro">{{ 'adminStats.intro' | t }}</p>
    @if (stats(); as s) {
      <!-- the storage: what the project keeps, then the disk it sits on -->
      <section class="card block">
        <h2 class="h3 head"><app-icon name="archive" [size]="18" /> {{ 'adminStats.storage.title' | t }}</h2>
        <p class="hero num">{{ bytes(projectBytes()) }}</p>
        <p class="small muted">{{ 'adminStats.storage.text' | t }}</p>
        <ul class="rows" role="list">
          <li><span>{{ 'adminStats.storage.database' | t }}</span><b class="num">{{ bytes(s.databaseBytes) }}</b></li>
          <li><span>{{ 'adminStats.storage.files' | t: { n: i18n.number(s.storageFiles ?? 0) } }}</span><b class="num">{{ bytes(filesBytes()) }}</b></li>
          @for (f of s.files; track f.key) {
            <li class="sub"><span>{{ 'adminStats.files.' + f.key | t }}</span><span class="num">{{ bytes(f.bytes) }}</span></li>
          }
        </ul>
        @if (s.diskTotal) {
          <div class="meter-head small"><span>{{ 'adminStats.storage.disk' | t }}</span><span class="num">{{ bytes(s.diskUsed) }} / {{ bytes(s.diskTotal) }}</span></div>
          <div class="meter" role="img" [attr.aria-label]="'adminStats.storage.diskLabel' | t: { used: bytes(s.diskUsed), total: bytes(s.diskTotal), pct: pct(s.diskUsed, s.diskTotal) }">
            <i class="host" [style.width.%]="pct(s.diskUsed, s.diskTotal)"></i>
            <i class="app" [style.width.%]="pct(projectBytes(), s.diskTotal)"></i>
          </div>
          <p class="tiny muted">{{ 'adminStats.storage.diskNote' | t: { pct: pctText(projectBytes(), s.diskTotal) } }}</p>
        }
        <details class="tables">
          <summary class="small">{{ 'adminStats.storage.tables' | t }}</summary>
          <ul class="rows" role="list">
            @for (t of s.tables; track t.key) {
              <li class="sub"><span class="mono">{{ t.key }}</span><span class="num">{{ bytes(t.bytes) }}</span></li>
            }
          </ul>
        </details>
      </section>

      <!-- the memory -->
      <section class="card block">
        <h2 class="h3 head"><app-icon name="layers" [size]="18" /> {{ 'adminStats.memory.title' | t }}</h2>
        <p class="hero num">{{ bytes(projectMem()) }}</p>
        <p class="small muted">{{ 'adminStats.memory.text' | t }}</p>
        <ul class="rows" role="list">
          <li>
            <span><i class="key app"></i>{{ 'adminStats.series.app' | t }}</span>
            <b class="num">{{ bytes(s.appMem) }}@if (s.appMemLimit) {<span class="muted"> / {{ bytes(s.appMemLimit) }}</span>}</b>
          </li>
          <li class="sub"><span>{{ 'adminStats.memory.heap' | t }}</span><span class="num">{{ bytes(s.heapUsed) }} / {{ bytes(s.heapMax) }}</span></li>
          <li><span><i class="key storage"></i>{{ 'adminStats.series.storage' | t }}</span><b class="num">{{ s.storageMem != null ? bytes(s.storageMem) : ('adminStats.unknown' | t) }}</b></li>
          <li><span>{{ 'adminStats.memory.database' | t }}</span><span class="small muted">{{ 'adminStats.memory.databaseNote' | t }}</span></li>
        </ul>
        @if (s.hostMemTotal) {
          <div class="meter-head small"><span><i class="key host"></i>{{ 'adminStats.series.host' | t }}</span><span class="num">{{ bytes(s.hostMemUsed) }} / {{ bytes(s.hostMemTotal) }}</span></div>
          <div class="meter" role="img" [attr.aria-label]="'adminStats.memory.hostLabel' | t: { used: bytes(s.hostMemUsed), total: bytes(s.hostMemTotal) }">
            <i class="host" [style.width.%]="pct(s.hostMemUsed, s.hostMemTotal)"></i>
            <i class="app" [style.width.%]="pct(projectMem(), s.hostMemTotal)"></i>
          </div>
        }
        @if (memChart(); as c) {
          <ng-container *ngTemplateOutlet="chart; context: { $implicit: c }" />
        }
      </section>

      <!-- the processor -->
      <section class="card block">
        <h2 class="h3 head"><app-icon name="gauge" [size]="18" /> {{ 'adminStats.cpu.title' | t }}</h2>
        <p class="hero num">{{ s.appCpu != null ? i18n.number(s.appCpu, 1) + ' %' : '—' }}</p>
        <p class="small muted">{{ 'adminStats.cpu.text' | t: { n: s.cpus ?? 1 } }}</p>
        <ul class="rows" role="list">
          <li><span><i class="key app"></i>{{ 'adminStats.series.app' | t }}</span><b class="num">{{ cpu(s.appCpu) }}</b></li>
          <li><span><i class="key storage"></i>{{ 'adminStats.series.storage' | t }}</span><b class="num">{{ cpu(s.storageCpu) }}</b></li>
          <li><span><i class="key host"></i>{{ 'adminStats.series.host' | t }}</span><b class="num">{{ cpu(s.hostCpu) }}</b></li>
        </ul>
        @if (cpuChart(); as c) {
          <ng-container *ngTemplateOutlet="chart; context: { $implicit: c }" />
        }
      </section>

      <!-- a few counts -->
      <section class="card block">
        <h2 class="h3 head"><app-icon name="bars" [size]="18" /> {{ 'adminStats.counts.title' | t }}</h2>
        <div class="counts">
          @for (c of countList(); track c.key) {
            <div class="count"><b class="num">{{ i18n.number(c.n) }}</b><span class="tiny muted">{{ 'adminStats.counts.' + c.key | t }}</span></div>
          }
        </div>
      </section>

      <p class="tiny muted foot">
        {{ 'adminStats.since' | t: { since: i18n.dateTime(s.since), up: uptime(s.uptimeSeconds ?? 0) } }}
        <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="load()"><app-icon name="refresh" [size]="15" /> {{ 'adminStats.refresh' | t }}</button>
      </p>
    } @else if (error()) {
      <p class="small muted">{{ i18n.error(error()!) }}</p>
    } @else {
      <div class="skeleton" style="height: 220px; border-radius: 24px"></div>
      <div class="skeleton" style="height: 220px; border-radius: 24px"></div>
    }

    <ng-template #chart let-c>
      <figure class="chart">
        <figcaption class="legend tiny">
          <span>{{ c.title | t }}</span>
          @for (sr of c.series; track sr.key) {
            <span class="leg"><i class="key" [class]="'key ' + sr.key"></i>{{ 'adminStats.series.' + sr.key | t }}</span>
          }
        </figcaption>
        <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" role="img" [attr.aria-label]="c.label" (pointermove)="hover($event, c)" (pointerleave)="hovered.set(null)">
          @for (g of c.grid; track g.y) {
            <line class="grid" [attr.x1]="pad.l" [attr.x2]="w - pad.r" [attr.y1]="g.y" [attr.y2]="g.y" />
            <text class="axis" [attr.x]="pad.l - 4" [attr.y]="g.y + 3" text-anchor="end">{{ g.label }}</text>
          }
          @for (t of c.ticks; track t.x) {
            <text class="axis" [attr.x]="t.x" [attr.y]="h - 4" text-anchor="middle">{{ t.label }}</text>
          }
          @for (sr of c.paths; track sr.key) {
            <path [attr.d]="sr.d" [class]="'line ' + sr.key" />
          }
          @if (hovered(); as hv) {
            @if (hv.chart === c.id) {
              <line class="cross" [attr.x1]="hv.x" [attr.x2]="hv.x" [attr.y1]="pad.t" [attr.y2]="h - pad.b" />
              @for (d of hv.dots; track d.key) {
                <circle [attr.cx]="hv.x" [attr.cy]="d.y" r="3.5" [class]="'dot ' + d.key" />
              }
            }
          }
        </svg>
        @if (hovered(); as hv) {
          @if (hv.chart === c.id) {
            <div class="tip tiny" [style.left.%]="(hv.x / w) * 100">
              <b>{{ hv.time }}</b>
              @for (d of hv.dots; track d.key) {
                <span><i [class]="'key ' + d.key"></i>{{ 'adminStats.series.' + d.key | t }} <b class="num">{{ d.text }}</b></span>
              }
            </div>
          }
        }
      </figure>
    </ng-template>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
      /* the series: storage, machine, app (validated for colour-blind readers, each theme its own steps) */
      --s-storage: #166534;
      --s-host: #3a46db;
      --s-app: #ff5a1f;
    }
    :host-context(html[data-theme='dark']) {
      --s-storage: #2a9d55;
      --s-host: #7c86f0;
      --s-app: #e85a24;
    }
    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme='light'])) {
        --s-storage: #2a9d55;
        --s-host: #7c86f0;
        --s-app: #e85a24;
      }
    }
    .intro {
      margin: 0;
    }
    .block {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .hero {
      margin: 0;
      font: 800 2rem/1.1 var(--font-display);
    }
    .block > p {
      margin: 0;
    }
    .rows {
      display: grid;
      gap: 6px;
      margin: var(--space-1) 0 0;
      padding: 0;
      list-style: none;
    }
    .rows li {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      font-size: 14px;
    }
    .rows li.sub {
      padding-left: 14px;
      font-size: 13px;
      color: var(--fg-2);
    }
    .rows li > span:first-child {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .mono {
      font-family: ui-monospace, monospace;
      font-size: 12px;
    }
    .key {
      display: inline-block;
      flex: none;
      width: 10px;
      height: 10px;
      border-radius: 3px;
      margin-right: 2px;
    }
    .key.storage {
      background: var(--s-storage);
    }
    .key.host {
      background: var(--s-host);
    }
    .key.app {
      background: var(--s-app);
    }
    .meter-head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .meter-head > span:first-child {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .meter {
      position: relative;
      height: 10px;
      border-radius: 999px;
      background: var(--surface-2);
      overflow: hidden;
    }
    .meter i {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: 999px;
    }
    .meter i.host {
      background: color-mix(in srgb, var(--s-host) 35%, transparent);
    }
    .meter i.app {
      background: var(--s-app);
      min-width: 3px;
    }
    .tables summary {
      cursor: pointer;
      color: var(--fg-2);
    }
    .counts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .count {
      display: grid;
      gap: 2px;
    }
    .count b {
      font-size: 1.15rem;
    }
    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin: 0;
    }
    .chart {
      position: relative;
      margin: var(--space-2) 0 0;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin-bottom: 4px;
      color: var(--fg-2);
    }
    .legend > span:first-child {
      flex-basis: 100%;
      font-weight: 700;
    }
    .leg {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      touch-action: pan-y;
    }
    .grid {
      stroke: var(--line);
      stroke-width: 1;
    }
    .axis {
      fill: var(--fg-3);
      font: 600 8px var(--font-ui);
    }
    .line {
      fill: none;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .line.storage {
      stroke: var(--s-storage);
    }
    .line.host {
      stroke: var(--s-host);
    }
    .line.app {
      stroke: var(--s-app);
    }
    .cross {
      stroke: var(--fg-3);
      stroke-width: 1;
      stroke-dasharray: 3 3;
    }
    .dot {
      stroke: var(--surface);
      stroke-width: 2;
    }
    .dot.storage {
      fill: var(--s-storage);
    }
    .dot.host {
      fill: var(--s-host);
    }
    .dot.app {
      fill: var(--s-app);
    }
    .tip {
      position: absolute;
      top: 18px;
      z-index: 2;
      display: grid;
      gap: 2px;
      padding: 6px 8px;
      border-radius: 10px;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      box-shadow: var(--shadow-1);
      transform: translateX(-50%);
      pointer-events: none;
      white-space: nowrap;
    }
    .tip span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  `,
})
export class AdminStatsTab {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18nService);
  protected readonly stats = signal<ServerStats | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly hovered = signal<{ chart: string; x: number; time: string; dots: { key: SeriesKey; y: number; text: string }[] } | null>(null);
  protected readonly w = W;
  protected readonly h = H;
  protected readonly pad = PAD;

  /** what the project keeps on the disk: the database and the photo storage's volumes (else the files it knows of) */
  protected readonly filesBytes = computed(() => {
    const s = this.stats();
    if (!s) return 0;
    return s.storageBytes ?? s.files.reduce((t, f) => t + f.bytes, 0);
  });
  protected readonly projectBytes = computed(() => (this.stats()?.databaseBytes ?? 0) + this.filesBytes());
  /** the memory the project takes, as far as it can be read: the app and the photo storage */
  protected readonly projectMem = computed(() => (this.stats()?.appMem ?? 0) + (this.stats()?.storageMem ?? 0));

  protected readonly countList = computed(() => Object.entries(this.stats()?.counts ?? {}).map(([key, n]) => ({ key, n })));

  protected readonly memChart = computed(() => {
    const h = this.stats()?.history ?? [];
    if (h.length < 2) return null;
    return this.chartOf('mem', 'adminStats.memory.chart', h, [
      { key: 'storage', values: h.map((x) => x.storageMem ?? null) },
      { key: 'host', values: h.map((x) => x.hostMemUsed ?? null) },
      { key: 'app', values: h.map((x) => x.appMem ?? null) },
    ], (v) => this.bytes(v, 0));
  });

  protected readonly cpuChart = computed(() => {
    const h = this.stats()?.history ?? [];
    if (h.length < 2) return null;
    return this.chartOf('cpu', 'adminStats.cpu.chart', h, [
      { key: 'storage', values: h.map((x) => x.storageCpu ?? null) },
      { key: 'host', values: h.map((x) => x.hostCpu ?? null) },
      { key: 'app', values: h.map((x) => x.appCpu ?? null) },
    ], (v) => `${this.i18n.number(v, v < 10 && v % 1 ? 1 : 0)} %`, 100);
  });

  constructor() {
    void this.load();
    const timer = setInterval(() => void this.load(), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async load(): Promise<void> {
    this.busy.set(true);
    try {
      this.stats.set(await firstValueFrom(this.http.get<ServerStats>('/api/admin/stats')));
      this.error.set(null);
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      this.busy.set(false);
    }
  }

  private chartOf(id: string, title: string, h: Sample[], all: Series[], fmt: (v: number) => string, cap?: number) {
    const series = all.filter((s) => s.values.some((v) => v != null));
    if (!series.length) return null;
    const known = series.flatMap((s) => s.values.filter((v): v is number => v != null));
    const top = niceTop(Math.max(1, ...known), cap);
    const t0 = Date.parse(h[0].at);
    const t1 = Date.parse(h[h.length - 1].at);
    const span = Math.max(1, t1 - t0);
    const x = (i: number) => PAD.l + ((Date.parse(h[i].at) - t0) / span) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
    const paths = series.map((s) => {
      let d = '';
      let pen = false;
      s.values.forEach((v, i) => {
        if (v == null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      });
      return { key: s.key, d };
    });
    const grid = [0, 0.5, 1].map((f) => ({ y: y(top * f), label: fmt(top * f) }));
    const ticks = [0, 0.5, 1].map((f) => {
      const at = new Date(t0 + span * f);
      return { x: PAD.l + f * (W - PAD.l - PAD.r), label: this.i18n.date(at.toISOString(), { hour: '2-digit', minute: '2-digit' }) };
    });
    const last = series.map((s) => `${this.i18n.t('adminStats.series.' + s.key)} ${fmt(s.values.filter((v) => v != null).at(-1) ?? 0)}`).join(', ');
    return { id, title, series, paths, grid, ticks, h, x, y, fmt, label: `${this.i18n.t(title)} : ${last}` };
  }

  protected hover(e: PointerEvent, c: NonNullable<ReturnType<AdminStatsTab['chartOf']>>): void {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < c.h.length; i++) if (Math.abs(c.x(i) - px) < Math.abs(c.x(best) - px)) best = i;
    const dots = c.series
      .map((s) => ({ s, v: s.values[best] }))
      .filter((d): d is { s: Series; v: number } => d.v != null)
      .map((d) => ({ key: d.s.key, y: c.y(d.v), text: c.fmt(d.v) }));
    this.hovered.set({ chart: c.id, x: c.x(best), time: this.i18n.date(c.h[best].at, { hour: '2-digit', minute: '2-digit' }), dots });
  }

  protected bytes(v?: number | null, digits = 1): string {
    if (v == null) return '—';
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let n = v;
    let u = 0;
    while (n >= 1024 && u < units.length - 1) {
      n /= 1024;
      u++;
    }
    return `${this.i18n.number(n, u === 0 || n >= 100 ? 0 : digits)} ${this.i18n.lang() === 'en' ? units[u].replace('o', 'B') : units[u]}`;
  }

  protected pct(part?: number | null, total?: number | null): number {
    return part && total ? Math.min(100, (100 * part) / total) : 0;
  }

  protected pctText(part?: number | null, total?: number | null): string {
    const p = this.pct(part, total);
    return this.i18n.number(p, p < 1 ? 2 : p < 10 ? 1 : 0);
  }

  protected cpu(v?: number | null): string {
    return v == null ? this.i18n.t('adminStats.unknown') : `${this.i18n.number(v, 1)} %`;
  }

  protected uptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return d ? this.i18n.t('adminStats.uptimeDays', { d, h }) : h ? this.i18n.t('adminStats.uptimeHours', { h, m }) : this.i18n.t('adminStats.uptimeMinutes', { m });
  }
}

/** a round top for the axis: 1, 2, 2.5, 5 × 10ⁿ above the highest value (100 % at most for a share) */
function niceTop(max: number, cap?: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const top = [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= max) ?? 10 * p;
  return cap ? Math.min(cap, top) : top;
}
