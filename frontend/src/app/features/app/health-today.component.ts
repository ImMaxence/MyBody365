import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { HealthStore, Intake, Moment, bpLevel } from '../../core/health/health.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { haptic } from '../../core/ui/haptics';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { WaitingNoteComponent } from '../../shared/waiting-note.component';
import { BpSheetComponent } from './bp-sheet.component';

/**
 * 1.17: on Today, for whoever turned them on in the profile: the blood pressure of the morning and of the evening (a tap
 * measures), and the intakes of the pill box of the day (a tap ticks). Off, nothing shows.
 */
@Component({
  selector: 'app-health-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, WaitingNoteComponent, BpSheetComponent],
  template: `
    @if (bpOn()) {
      <section class="card module" [attr.aria-labelledby]="'bp-title'">
        <div class="m-head">
          <span class="m-ico bp"><app-icon name="heartPulse" [size]="19" /></span>
          <h2 class="h3" id="bp-title">{{ 'health.bp.title' | t }}</h2>
          <a class="m-link small" routerLink="/app/progress" [queryParams]="{ view: 'bp' }">{{ 'health.bp.curve' | t }}</a>
        </div>
        <div class="bp-rows">
          @for (m of moments; track m) {
            @let e = store.today()[m];
            <button type="button" class="bp-row" [class.done]="!!e" [class.is-waiting]="!!e?.pending" (click)="sheet.open(m)">
              <span class="bp-moment small">
                <app-icon [name]="m === 'MORNING' ? 'sun' : 'moon'" [size]="15" /> {{ 'health.bp.short.' + m | t }}
              </span>
              @if (e) {
                <span class="bp-val num" [attr.data-level]="level(e.systolic, e.diastolic)">{{ e.systolic }}/{{ e.diastolic }}</span>
                <span class="tiny muted num">{{ e.pulse ? ('health.bp.pulseValue' | t: { n: e.pulse }) : ('health.bp.readings' | t: { n: e.readings }) }}</span>
                @if (e.pending) {
                  <app-waiting-note [waitId]="e.pending" />
                }
              } @else {
                <span class="bp-todo small">{{ 'health.bp.toMeasure' | t }}</span>
              }
            </button>
          }
        </div>
      </section>
      <app-bp-sheet #sheet />
    }

    @if (pillsOn()) {
      <section class="card module" [attr.aria-labelledby]="'pills-title'">
        <div class="m-head">
          <span class="m-ico pills"><app-icon name="pill" [size]="19" /></span>
          <h2 class="h3" id="pills-title">{{ 'health.pills.title' | t }}</h2>
          @if (box(); as b) {
            @if (b.intakes.length) {
              <span class="m-count small num">{{ 'health.pills.count' | t: { done: taken(), n: b.intakes.length } }}</span>
            }
          }
        </div>
        @if (box(); as b) {
          @if (!b.items.length) {
            <a class="m-empty small" routerLink="/app/account/health">{{ 'health.pills.addFirst' | t }} <app-icon name="chevronRight" [size]="16" /></a>
          } @else if (!b.intakes.length) {
            <p class="small muted m-none">{{ 'health.pills.noneToday' | t }}</p>
          } @else {
            <ul class="intakes" role="list">
              @for (i of b.intakes; track i.medicationId + i.slot) {
                <li>
                  <button type="button" class="intake" role="checkbox" [attr.aria-checked]="i.taken" [class.taken]="i.taken" [class.is-waiting]="!!i.pending"
                    (click)="toggle(i)">
                    <span class="box" aria-hidden="true"><app-icon name="check" [size]="15" [stroke]="2.8" /></span>
                    <span class="slot num">{{ i.slot }}</span>
                    <span class="what">
                      <span class="name">{{ nameOf(i) }}</span>
                      @if (doseOf(i); as d) {
                        <span class="tiny muted">{{ d }}</span>
                      }
                      @if (i.pending) {
                        <app-waiting-note [waitId]="i.pending" kind="edit" />
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
          }
        } @else {
          <div class="skeleton" style="height: 56px"></div>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .module {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .m-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .m-head .h3 {
      margin: 0;
      flex: 1;
    }
    .m-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 34px;
      height: 34px;
      border-radius: 11px;
    }
    .m-ico.bp {
      background: color-mix(in srgb, #e5484d 13%, var(--surface));
      color: color-mix(in srgb, #e5484d 75%, var(--fg));
    }
    .m-ico.pills {
      background: color-mix(in srgb, #8a6fd1 14%, var(--surface));
      color: color-mix(in srgb, #8a6fd1 75%, var(--fg));
    }
    .m-link,
    .m-empty {
      color: var(--accent-text);
      font-weight: 650;
    }
    .m-empty {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .m-count {
      color: var(--fg-2);
      font-weight: 650;
    }
    .m-none {
      margin: 0;
    }
    .bp-rows {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }
    .bp-row {
      display: grid;
      justify-items: start;
      gap: 3px;
      min-height: 84px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      box-shadow: inset 0 0 0 1px var(--line);
      text-align: left;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .bp-row.is-pressed {
      transform: scale(0.98);
    }
    .bp-moment {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--fg-2);
      font-weight: 650;
    }
    .bp-val {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1.1;
      --lv: #1f9d55;
      color: color-mix(in srgb, var(--lv) 55%, var(--fg));
    }
    .bp-val[data-level='high'] {
      --lv: #e2711d;
    }
    .bp-val[data-level='urgent'] {
      --lv: #e5484d;
    }
    .bp-val[data-level='low'] {
      --lv: #2b8cee;
    }
    .bp-todo {
      margin-top: auto;
      color: var(--accent-text);
      font-weight: 700;
    }
    .intakes {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .intake {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 52px;
      padding: 8px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      text-align: left;
    }
    .box {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 8px;
      box-shadow: inset 0 0 0 2px var(--line-strong);
      color: transparent;
      transition: background-color var(--dur-2), color var(--dur-2), box-shadow var(--dur-2);
    }
    .taken .box {
      background: var(--accent);
      box-shadow: none;
      color: #fff;
      animation: tick 320ms var(--ease-out);
    }
    @keyframes tick {
      50% {
        transform: scale(1.18);
      }
    }
    .slot {
      font-weight: 750;
      color: var(--fg-2);
    }
    .what {
      display: grid;
      min-width: 0;
    }
    .name {
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .taken .name {
      color: var(--fg-2);
      text-decoration: line-through;
      text-decoration-color: color-mix(in srgb, var(--fg-2) 50%, transparent);
    }
  `,
})
export class HealthTodayComponent {
  protected readonly store = inject(HealthStore);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly moments: Moment[] = ['MORNING', 'EVENING'];
  protected readonly bpOn = computed(() => !!this.session.account()?.bpEnabled);
  protected readonly pillsOn = computed(() => !!this.session.account()?.pillsEnabled);
  protected readonly box = this.store.box;
  protected readonly taken = computed(() => (this.box()?.intakes ?? []).filter((i) => i.taken).length);
  private readonly loaded = signal(false);

  constructor() {
    // asked when the module is on (and again when older than 30 s)
    effect(() => {
      const bp = this.bpOn();
      const pills = this.pillsOn();
      untracked(() => {
        if (bp) void this.store.ensureBp();
        if (pills) void this.store.ensureBox();
        this.loaded.set(true);
      });
    });
  }

  protected level(s: number, d: number): string {
    return bpLevel(s, d);
  }

  protected nameOf(i: Intake): string {
    return this.box()?.items.find((m) => m.id === i.medicationId)?.name ?? '';
  }

  protected doseOf(i: Intake): string | null {
    return this.box()?.items.find((m) => m.id === i.medicationId)?.dose ?? null;
  }

  protected async toggle(i: Intake): Promise<void> {
    haptic(i.taken ? 'tap' : 'success');
    try {
      await this.store.setTaken(i, !i.taken);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
