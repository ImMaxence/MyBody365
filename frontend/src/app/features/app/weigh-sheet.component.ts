import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import type { BodyLogEntry } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TrackingStore, localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';

const MEASURES = ['bodyFatPct', 'waistCm', 'hipsCm', 'chestCm', 'armCm', 'thighCm'] as const;
type Measure = (typeof MEASURES)[number];
const LABEL: Record<Measure, string> = {
  bodyFatPct: 'weigh.bodyFat',
  waistCm: 'weigh.waist',
  hipsCm: 'weigh.hips',
  chestCm: 'weigh.chest',
  armCm: 'weigh.arm',
  thighCm: 'weigh.thigh',
};

/** The weigh-in of a day (today by default) and its optional measurements, in a bottom sheet. */
@Component({
  selector: 'app-weigh-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, NumberStepperComponent],
  template: `
    <dialog class="sheet" #dlg (close)="closed()">
      <div class="sheet-grip"></div>
      <form class="stack" (ngSubmit)="save()">
        <div>
          <h2 class="h3">{{ 'weigh.title' | t }}</h2>
          <p class="small muted">{{ day() === today ? ('weigh.hint' | t) : i18n.date(day(), { weekday: 'long', day: 'numeric', month: 'long' }) }}</p>
        </div>
        <app-number-stepper [(value)]="weight" [step]="0.1" [min]="30" [max]="350" [decimals]="1" unit="kg" [label]="'weigh.title' | t"
          [minusLabel]="'weigh.minus' | t" [plusLabel]="'weigh.plus' | t" />
        @if (previous() !== null) {
          <p class="delta small" [class.down]="weight() < previous()!" [class.up]="weight() > previous()!">
            {{ 'weigh.vsYesterday' | t: { delta: signed(weight() - previous()!) } }}
          </p>
        }
        <button type="button" class="btn btn-ghost btn-s more" (click)="showMore.set(!showMore())">
          <app-icon name="ruler" [size]="18" /> {{ (showMore() ? 'weigh.less' : 'weigh.more') | t }}
        </button>
        @if (showMore()) {
          <div class="measures">
            @for (m of measures; track m) {
              <div class="field">
                <label [for]="'m-' + m">{{ label[m] | t }}</label>
                <input class="input" [id]="'m-' + m" type="text" inputmode="decimal" [name]="m" [(ngModel)]="values[m]" />
              </div>
            }
          </div>
        }
        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()"><app-icon name="check" /> {{ 'weigh.save' | t }}</button>
        @if (existing()) {
          <button type="button" class="btn btn-ghost btn-block danger" (click)="remove()"><app-icon name="trash" /> {{ 'weigh.delete' | t }}</button>
        }
      </form>
    </dialog>
  `,
  styles: `
    .delta {
      margin-top: -6px;
      text-align: center;
      color: var(--fg-2);
      font-weight: 600;
    }
    .delta.down {
      color: var(--success);
    }
    .delta.up {
      color: var(--warning);
    }
    .more {
      justify-self: center;
    }
    .measures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
      animation: open 260ms var(--ease-out);
    }
    @keyframes open {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }
    .danger {
      color: var(--danger);
    }
  `,
})
export class WeighSheetComponent {
  private readonly tracking = inject(TrackingStore);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly today = localDay();
  protected readonly measures = MEASURES;
  protected readonly label = LABEL;
  protected readonly day = signal(localDay());
  protected readonly weight = signal(75);
  protected readonly previous = signal<number | null>(null);
  protected readonly existing = signal(false);
  protected readonly showMore = signal(false);
  protected readonly busy = signal(false);
  protected values: Record<Measure, string> = this.blank();

  /** @param entry the day's existing log, to edit it */
  open(day = localDay(), entry: BodyLogEntry | null = null, previousWeight: number | null = null): void {
    this.day.set(day);
    this.existing.set(!!entry);
    const fallback = previousWeight ?? this.tracking.lastWeight() ?? 75;
    this.weight.set(entry?.weightKg ?? fallback);
    this.previous.set(previousWeight ?? (entry ? null : this.tracking.lastWeight()));
    this.values = this.blank();
    for (const m of MEASURES) {
      const v = entry?.[m];
      if (v != null) this.values[m] = String(v).replace('.', this.i18n.lang() === 'fr' ? ',' : '.');
    }
    this.showMore.set(MEASURES.some((m) => entry?.[m] != null));
    this.dialog().nativeElement.showModal();
  }

  protected closed(): void {
    this.busy.set(false);
  }

  protected signed(n: number): string {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + this.i18n.number(Math.abs(n), 1);
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    try {
      const measures: Partial<Record<Measure, number | null>> = {};
      for (const m of MEASURES) {
        const n = Number(String(this.values[m] ?? '').replace(',', '.'));
        measures[m] = this.values[m] && Number.isFinite(n) && n > 0 ? n : null;
      }
      await this.tracking.saveLog(this.day(), { weightKg: this.weight(), ...measures });
      this.dialog().nativeElement.close();
      this.toast.show(this.i18n.t(this.tracking.lastQueued() ? 'offline.queued' : 'weigh.saved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    if (!confirm(this.i18n.t('weigh.deleteConfirm'))) return;
    try {
      await this.tracking.deleteLog(this.day());
      this.dialog().nativeElement.close();
      this.toast.show(this.i18n.t('weigh.deleted'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  private blank(): Record<Measure, string> {
    return { bodyFatPct: '', waistCm: '', hipsCm: '', chestCm: '', armCm: '', thighCm: '' };
  }
}
