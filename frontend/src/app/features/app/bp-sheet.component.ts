import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import { HealthStore, Moment, Reading, average, bpLevel } from '../../core/health/health.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localDay } from '../../core/tracking/tracking.store';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

interface Row {
  systolic: string;
  diastolic: string;
  pulse: string;
}

const EMPTY: Row = { systolic: '', diastolic: '', pulse: '' };

/**
 * 1.17: a blood pressure of the morning or the evening: 1 to 3 readings of the monitor (three a minute apart is the rule of
 * home measurement), their average and how it reads (core/health/health.store.ts bpLevel), never a diagnosis.
 */
@Component({
  selector: 'app-bp-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="'health.bp.' + moment() | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div>
          <h2 class="h3"><app-icon name="heartPulse" [size]="20" /> {{ 'health.bp.' + moment() | t }}</h2>
          <p class="small muted">{{ (moment() === 'MORNING' ? 'health.bp.howMorning' : 'health.bp.howEvening') | t }}</p>
        </div>

        @for (r of rows(); track $index; let i = $index) {
          <fieldset class="reading">
            <legend class="label">{{ 'health.bp.reading' | t: { n: i + 1 } }}</legend>
            <div class="inputs">
              <label class="field">
                <span class="tiny muted">{{ 'health.bp.sys' | t }}</span>
                <input class="input num" inputmode="numeric" maxlength="3" autocomplete="off" [value]="r.systolic" [attr.aria-label]="'health.bp.sysOf' | t: { n: i + 1 }"
                  (input)="set(i, 'systolic', $any($event.target).value)" />
              </label>
              <span class="slash" aria-hidden="true">/</span>
              <label class="field">
                <span class="tiny muted">{{ 'health.bp.dia' | t }}</span>
                <input class="input num" inputmode="numeric" maxlength="3" autocomplete="off" [value]="r.diastolic" [attr.aria-label]="'health.bp.diaOf' | t: { n: i + 1 }"
                  (input)="set(i, 'diastolic', $any($event.target).value)" />
              </label>
              <label class="field pulse">
                <span class="tiny muted">{{ 'health.bp.pulse' | t }}</span>
                <input class="input num" inputmode="numeric" maxlength="3" autocomplete="off" [value]="r.pulse" [attr.aria-label]="'health.bp.pulseOf' | t: { n: i + 1 }"
                  (input)="set(i, 'pulse', $any($event.target).value)" />
              </label>
              @if (i > 0) {
                <button type="button" class="icon-btn mini" [attr.aria-label]="'health.bp.removeReading' | t: { n: i + 1 }" (click)="removeRow(i)">
                  <app-icon name="x" [size]="16" />
                </button>
              }
            </div>
          </fieldset>
        }
        @if (rows().length < 3) {
          <button type="button" class="btn btn-ghost btn-s add" (click)="addRow()"><app-icon name="plus" [size]="16" /> {{ 'health.bp.addReading' | t }}</button>
        }

        @if (result(); as a) {
          <section class="avg" [attr.data-level]="a.level" aria-live="polite">
            <div class="avg-head">
              <span class="small muted">{{ (valid().length > 1 ? 'health.bp.average' : 'health.bp.yours') | t }}</span>
              <b class="num">{{ a.systolic }}/{{ a.diastolic }} <small>mmHg</small></b>
            </div>
            @if (a.pulse) {
              <span class="small muted num">{{ 'health.bp.pulseValue' | t: { n: a.pulse } }}</span>
            }
            <span class="level small">{{ 'health.bp.levels.' + a.level | t }}</span>
          </section>
          @if (a.level === 'urgent') {
            <p class="notice notice-danger" role="alert"><app-icon name="alert" /> {{ 'health.bp.urgent' | t }}</p>
          }
        }
        @if (invalid()) {
          <p class="small danger-text" role="alert">{{ 'health.bp.invalid' | t }}</p>
        }

        <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || !valid().length || invalid()" (click)="save()">
          <app-icon name="check" /> {{ 'health.bp.save' | t }}
        </button>
        @if (existing()) {
          <button type="button" class="btn btn-ghost btn-block" [disabled]="busy()" (click)="remove()"><app-icon name="trash" /> {{ 'health.bp.delete' | t }}</button>
        }
        <p class="tiny muted center">{{ 'health.bp.note' | t }}</p>
      </div>
    </dialog>
  `,
  styles: `
    /* no row of its own in the page's grid (the dialog is out of the flow anyway) */
    :host {
      display: contents;
    }
    .h3 {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .reading {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .inputs {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) minmax(0, 0.9fr) auto;
      align-items: end;
      gap: 8px;
    }
    .field {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .field .input {
      width: 100%;
      text-align: center;
      font-size: 1.25rem;
      font-weight: 750;
    }
    .slash {
      padding-bottom: 12px;
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--fg-3);
    }
    .inputs .icon-btn {
      margin-bottom: 6px;
    }
    .add {
      justify-self: start;
    }
    .avg {
      display: grid;
      gap: 2px;
      padding: 14px 16px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      --lv: #1f9d55;
    }
    .avg[data-level='high'] {
      --lv: #e2711d;
    }
    .avg[data-level='urgent'] {
      --lv: #e5484d;
    }
    .avg[data-level='low'] {
      --lv: #2b8cee;
    }
    .avg-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .avg b {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-size: 1.6rem;
      font-weight: 800;
    }
    .avg b small {
      font-size: 0.5em;
      color: var(--fg-2);
    }
    .level {
      font-weight: 700;
      color: color-mix(in srgb, var(--lv) 70%, var(--fg));
    }
    .danger-text {
      margin: 0;
      color: var(--danger);
    }
    .center {
      text-align: center;
    }
  `,
})
export class BpSheetComponent {
  private readonly store = inject(HealthStore);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly moment = signal<Moment>('MORNING');
  protected readonly day = signal(localDay());
  protected readonly rows = signal<Row[]>([{ ...EMPTY }]);
  protected readonly busy = signal(false);
  protected readonly existing = computed(() => (this.store.bp() ?? []).find((e) => e.day === this.day() && e.moment === this.moment()) ?? null);

  /** the readings filled in, as numbers */
  protected readonly valid = computed<Reading[]>(() =>
    this.rows()
      .map((r) => ({ systolic: Number(r.systolic), diastolic: Number(r.diastolic), pulse: r.pulse ? Number(r.pulse) : null }))
      .filter((r) => r.systolic > 0 && r.diastolic > 0),
  );
  /** out of what a monitor shows, or the two numbers the wrong way round */
  protected readonly invalid = computed(() =>
    this.valid().some(
      (r) => r.systolic < 60 || r.systolic > 260 || r.diastolic < 30 || r.diastolic > 160 || r.systolic <= r.diastolic || (r.pulse != null && (r.pulse < 30 || r.pulse > 220)),
    ),
  );
  protected readonly result = computed(() => {
    const v = this.valid();
    if (!v.length || this.invalid()) return null;
    const a = average(v);
    return { ...a, level: bpLevel(a.systolic, a.diastolic) };
  });

  open(moment: Moment, day = localDay()): void {
    this.moment.set(moment);
    this.day.set(day);
    this.rows.set([{ ...EMPTY }]);
    this.busy.set(false);
    this.dialog().nativeElement.showModal();
  }

  protected set(i: number, key: keyof Row, value: string): void {
    const clean = value.replace(/\D/g, '').slice(0, 3);
    this.rows.update((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: clean } : r)));
  }

  protected addRow(): void {
    this.rows.update((rows) => (rows.length < 3 ? [...rows, { ...EMPTY }] : rows));
  }

  protected removeRow(i: number): void {
    this.rows.update((rows) => rows.filter((_, j) => j !== i));
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    try {
      const queued = await this.store.saveBp(this.day(), this.moment(), this.valid());
      closeSheet(this.dialog().nativeElement);
      this.toast.show(this.i18n.t(queued ? 'offline.queued' : 'health.bp.saved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.deleteBp(this.day(), this.moment());
      closeSheet(this.dialog().nativeElement);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
