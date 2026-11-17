import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import type { CiqualImport, FoodsOverview, OffImport } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** The food data: the Ciqual table in use, its one-button update followed live, and the history. */
@Component({
  selector: 'app-admin-foods',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <section class="card ciqual">
      <div class="head">
        <span class="ico"><app-icon name="leaf" /></span>
        <div>
          <h2 class="h3">{{ 'adminFoods.ciqual' | t }}</h2>
          <p class="small muted">{{ 'adminFoods.version' | t }} · <b>{{ overview()?.ciqualVersion ? versionLabel(overview()!.ciqualVersion!) : ('adminFoods.versionNone' | t) }}</b></p>
        </div>
      </div>
      <p class="small">{{ 'adminFoods.ciqualText' | t }}</p>
      @if (overview(); as o) {
        <ul class="counts small" role="list">
          <li>{{ 'adminFoods.foods' | t: { n: i18n.number(o.ciqualFoods) } }}</li>
          @if (o.supersededFoods) {
            <li>{{ 'adminFoods.superseded' | t: { n: i18n.number(o.supersededFoods) } }}</li>
          }
          <li>{{ 'adminFoods.user' | t: { n: i18n.number(o.userFoods) } }}</li>
        </ul>
      }

      @if (running(); as r) {
        <div class="progress" aria-live="polite">
          <div class="progress-head small"><span>{{ 'adminFoods.steps.' + (r.step ?? 'dataset') | t }}</span><span class="num">{{ r.progress }} %</span></div>
          <div class="bar" role="progressbar" [attr.aria-label]="'adminFoods.update' | t" [attr.aria-valuenow]="r.progress" aria-valuemin="0" aria-valuemax="100">
            <i [style.width.%]="r.progress"></i>
          </div>
        </div>
      } @else {
        <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="start()"><app-icon name="refresh" /> {{ 'adminFoods.update' | t }}</button>
      }
      <p class="tiny muted">{{ 'adminFoods.source' | t }}</p>
    </section>

    <section class="card ciqual">
      <div class="head">
        <span class="ico off"><app-icon name="barcode" /></span>
        <div>
          <h2 class="h3">{{ 'adminFoods.offTitle' | t }}</h2>
          <p class="small muted">
            @if (overview()?.offLocalAt; as at) {
              {{ 'adminFoods.offLocal' | t: { date: i18n.dateTime(at) } }}
            } @else {
              {{ 'adminFoods.offLive' | t }}
            }
          </p>
        </div>
      </div>
      <p class="small">{{ 'adminFoods.offText' | t }}</p>
      @if (overview(); as o) {
        <ul class="counts small" role="list">
          <li>{{ 'adminFoods.off' | t: { n: i18n.number(o.offProducts) } }}</li>
        </ul>
      }
      @if (offRunning(); as r) {
        <div class="progress" aria-live="polite">
          <div class="progress-head small"><span>{{ 'adminFoods.offSteps.' + (r.step ?? 'download') | t }}</span><span class="num">{{ r.progress }} %</span></div>
          <div class="bar" role="progressbar" [attr.aria-label]="'adminFoods.offUpdate' | t" [attr.aria-valuenow]="r.progress" aria-valuemin="0" aria-valuemax="100">
            <i [style.width.%]="r.progress"></i>
          </div>
        </div>
      } @else {
        <button type="button" class="btn btn-secondary btn-block" [disabled]="busy()" (click)="startOff()"><app-icon name="refresh" /> {{ 'adminFoods.offUpdate' | t }}</button>
      }
      @for (i of overview()?.offImports ?? []; track i.id) {
        <p class="tiny muted">
          {{ i18n.dateTime(i.startedAt) }} · {{ 'adminFoods.status.' + i.status | t }}{{ i.products != null ? ' · ' + ('adminFoods.offProducts' | t: { n: i18n.number(i.products) }) : '' }}{{ i.status === 'FAILED' && i.message ? ' · ' + i.message : '' }}
        </p>
      }
      <p class="tiny muted">{{ 'adminFoods.offSource' | t }}</p>
    </section>

    <h2 class="section-title">{{ 'adminFoods.history' | t }}</h2>
    @if (overview()?.imports?.length) {
      <div class="list">
        @for (i of overview()!.imports; track i.id) {
          <div class="list-item">
            <span class="list-body">
              <span class="list-title">{{ i.version ? versionLabel(i.version) : '…' }}</span>
              <span class="list-sub">{{ i18n.dateTime(i.startedAt) }}{{ i.startedBy ? ' · ' + ('adminFoods.by' | t: { name: i.startedBy }) : '' }}{{ i.foods != null ? ' · ' + ('adminFoods.foods' | t: { n: i18n.number(i.foods) }) : '' }}</span>
              @if (i.status === 'FAILED' && i.message) {
                <span class="list-sub err">{{ i.message }}</span>
              }
            </span>
            <span class="chip" [class.chip-success]="i.status === 'DONE'" [class.chip-danger]="i.status === 'FAILED'" [class.chip-accent]="i.status === 'RUNNING'">
              {{ 'adminFoods.status.' + i.status | t }}
            </span>
          </div>
        }
      </div>
    } @else {
      <p class="small muted">{{ 'adminFoods.none' | t }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
    }
    .ciqual {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .ico {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--success-soft);
      color: var(--success);
      flex: none;
    }
    .counts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--fg-2);
      font-weight: 600;
    }
    .progress {
      display: grid;
      gap: 6px;
    }
    .progress-head {
      display: flex;
      justify-content: space-between;
      font-weight: 650;
    }
    .bar {
      height: 10px;
      border-radius: 5px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 5px;
      background: var(--flame);
      transition: width 600ms var(--ease-out);
    }
    .err {
      color: var(--danger);
    }
    .ico.off {
      background: var(--cool-soft);
      color: var(--cool);
    }
  `,
})
export class AdminFoodsTab {
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly overview = signal<FoodsOverview | null>(null);
  protected readonly running = signal<CiqualImport | null>(null);
  protected readonly offRunning = signal<OffImport | null>(null);
  protected readonly busy = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private offTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.refresh();
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearTimeout(this.timer);
      if (this.offTimer) clearTimeout(this.offTimer);
    });
  }

  private async refresh(): Promise<void> {
    try {
      const o = await this.api.foodsOverview();
      this.overview.set(o);
      const r = o.imports.find((i) => i.status === 'RUNNING');
      if (r && !this.running()) this.follow(r);
      const off = o.offImports.find((i) => i.status === 'RUNNING');
      if (off && !this.offRunning()) this.followOff(off);
    } catch {
      /* shown empty */
    }
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    try {
      this.follow(await this.api.startCiqual());
      this.toast.show(this.i18n.t('adminFoods.started'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async startOff(): Promise<void> {
    this.busy.set(true);
    try {
      this.followOff(await this.api.startOff());
      this.toast.show(this.i18n.t('adminFoods.offStarted'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  /** a long one (a large download, then a large file read): polled every 2 seconds */
  private followOff(r: OffImport): void {
    this.offRunning.set(r);
    this.offTimer = setTimeout(async () => {
      try {
        const next = await this.api.offImport(r.id);
        if (next.status === 'RUNNING') {
          this.followOff(next);
          return;
        }
        this.offRunning.set(null);
        if (next.status === 'DONE') this.toast.show(this.i18n.t('adminFoods.offDone', { n: this.i18n.number(next.products ?? 0) }));
        else this.toast.error(this.i18n.t('adminFoods.failed', { message: next.message ?? '' }));
        await this.refresh();
      } catch {
        this.followOff(r);
      }
    }, 2000);
  }

  /** polled every second until the import ends */
  private follow(r: CiqualImport): void {
    this.running.set(r);
    this.timer = setTimeout(async () => {
      try {
        const next = await this.api.ciqualImport(r.id);
        if (next.status === 'RUNNING') {
          this.follow(next);
          return;
        }
        this.running.set(null);
        const v = next.version ? this.versionLabel(next.version) : '';
        if (next.status === 'DONE') this.toast.show(this.i18n.t('adminFoods.done', { version: v, n: this.i18n.number(next.foods ?? 0) }));
        else if (next.status === 'UP_TO_DATE') this.toast.show(this.i18n.t('adminFoods.upToDate', { version: v }));
        else this.toast.error(this.i18n.t('adminFoods.failed', { message: next.message ?? '' }));
        await this.refresh();
      } catch {
        this.follow(r);
      }
    }, 1000);
  }

  /** 2025_11_03 → 3 novembre 2025 */
  protected versionLabel(v: string): string {
    const m = /^(\d{4})_(\d{2})_(\d{2})$/.exec(v);
    return m ? this.i18n.date(`${m[1]}-${m[2]}-${m[3]}`, { day: 'numeric', month: 'long', year: 'numeric' }) : v;
  }
}
