import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { BMI_BANDS, bmiBand, bmiOf, nextBmiStep, weightForBmi } from '../../core/tracking/bmi';
import { closeSheet } from '../../core/ui/sheets';
import { IconComponent } from '../../shared/icon.component';

/** the scale drawn from 15 to 45 */
const LOW = 15;
const HIGH = 45;
const pos = (v: number) => (Math.min(HIGH, Math.max(LOW, v)) - LOW) / (HIGH - LOW) * 100;

/**
 * The BMI explained: what it is, the band one is in on a coloured scale, the healthy range for one's
 * height, the next step down, the index at the goal, and what it does not say.
 */
@Component({
  selector: 'app-bmi-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="'bmi.title' | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div class="head">
          <span class="big num">{{ i18n.number(bmi(), 1) }}</span>
          <div class="head-copy">
            <h2 class="h3">{{ 'bmi.title' | t }}</h2>
            <span class="band-chip" [attr.data-c]="band().cls">{{ 'bmi.classes.' + band().cls | t }}</span>
          </div>
        </div>

        <div class="scale" role="img" [attr.aria-label]="'bmi.scaleAria' | t: { bmi: i18n.number(bmi(), 1), band: ('bmi.classes.' + band().cls | t) }">
          <div class="bands">
            @for (b of bands; track b.cls; let i = $index) {
              <i [attr.data-c]="b.cls" [class.mine]="b.cls === band().cls" [style.flex-grow]="b.width" [style.--i]="i"></i>
            }
          </div>
          <span class="marker" [style.left.%]="marker()"><span class="num">{{ i18n.number(bmi(), 1) }}</span></span>
          <div class="ticks tiny num" aria-hidden="true">
            @for (t of ticks; track t) {
              <span [style.left.%]="t.left">{{ i18n.number(t.v, t.v % 1 ? 1 : 0) }}</span>
            }
          </div>
        </div>

        <p class="small">{{ 'bmi.what' | t: { kg: i18n.number(weightKg(), 1), m: i18n.number(heightCm() / 100, 2), bmi: i18n.number(bmi(), 1) } }}</p>

        <ul class="facts" role="list">
          <li>
            <span class="f-ico ok"><app-icon name="check" [size]="15" [stroke]="2.6" /></span>
            <span class="small">{{ 'bmi.healthy' | t: { m: i18n.number(heightCm() / 100, 2), from: i18n.number(healthy().from, 1), to: i18n.number(healthy().to, 1) } }}</span>
          </li>
          @if (step(); as s) {
            <li>
              <span class="f-ico"><app-icon [name]="band().cls === 'under' ? 'trendUp' : 'trendDown'" [size]="15" /></span>
              <span class="small">{{ (band().cls === 'under' ? 'bmi.nextUp' : 'bmi.next') | t: { threshold: i18n.number(s.threshold, s.threshold % 1 ? 1 : 0), band: ('bmi.classes.' + s.cls | t), kg: i18n.number(s.weightKg, 1), diff: i18n.number(Math.abs(weightKg() - s.weightKg), 1) } }}</span>
            </li>
          } @else {
            <li>
              <span class="f-ico ok"><app-icon name="heart" [size]="15" /></span>
              <span class="small">{{ 'bmi.inNormal' | t }}</span>
            </li>
          }
          @if (goalKg(); as g) {
            <li>
              <span class="f-ico cool"><app-icon name="target" [size]="15" /></span>
              <span class="small">{{ 'bmi.atGoal' | t: { kg: i18n.number(g, 1), bmi: i18n.number(goalBmi()!, 1), band: ('bmi.classes.' + goalBand()! | t) } }}</span>
            </li>
          }
        </ul>

        <p class="notice"><app-icon name="info" [size]="18" /> {{ 'bmi.limits' | t }}</p>
        <button type="button" class="btn btn-ghost btn-block" (click)="close()">{{ 'common.close' | t }}</button>
      </div>
    </dialog>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .big {
      font-family: var(--font-display);
      font-stretch: 118%;
      font-weight: 800;
      font-size: 2.6rem;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .head-copy {
      display: grid;
      gap: 6px;
      justify-items: start;
    }
    .band-chip {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 0 10px;
      border-radius: var(--radius-pill);
      font-size: var(--fs-xs);
      font-weight: 700;
      color: var(--fg);
    }
    [data-c='under'] {
      background: var(--cal-freeze);
    }
    [data-c='normal'] {
      background: var(--cal-done);
    }
    [data-c='over'] {
      background: color-mix(in srgb, #f2b705 32%, var(--surface));
    }
    [data-c='obese1'] {
      background: color-mix(in srgb, #ff7a1a 32%, var(--surface));
    }
    [data-c='obese2'] {
      background: color-mix(in srgb, #ff4d1f 42%, var(--surface));
    }
    [data-c='obese3'] {
      background: color-mix(in srgb, #d61f1f 48%, var(--surface));
    }
    .scale {
      position: relative;
      padding: 30px 0 20px;
    }
    .bands {
      display: flex;
      gap: 3px;
      height: 14px;
    }
    .bands i {
      flex-basis: 0;
      border-radius: 4px;
      opacity: 0.75;
      animation: band-in 420ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 50ms);
    }
    .bands i:first-child {
      border-radius: 7px 4px 4px 7px;
    }
    .bands i:last-child {
      border-radius: 4px 7px 7px 4px;
    }
    .bands i.mine {
      opacity: 1;
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--fg) 35%, transparent);
    }
    @keyframes band-in {
      from {
        transform: scaleY(0.2);
        opacity: 0;
      }
    }
    .marker {
      position: absolute;
      top: 0;
      bottom: 14px;
      width: 0;
      animation: marker-in 700ms 200ms cubic-bezier(0.34, 1.4, 0.5, 1) both;
    }
    .marker::after {
      content: '';
      position: absolute;
      top: 22px;
      left: -2px;
      width: 4px;
      height: 26px;
      border-radius: 2px;
      background: var(--fg);
      box-shadow: 0 0 0 2px var(--surface);
    }
    .marker span {
      position: absolute;
      top: 0;
      left: 0;
      transform: translateX(-50%);
      padding: 1px 7px;
      border-radius: var(--radius-pill);
      background: var(--fg);
      color: var(--bg);
      font-size: 12px;
      font-weight: 750;
      white-space: nowrap;
    }
    @keyframes marker-in {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
    }
    .ticks {
      position: relative;
      height: 16px;
      margin-top: 4px;
      color: var(--fg-3);
      font-weight: 600;
    }
    .ticks span {
      position: absolute;
      transform: translateX(-50%);
    }
    .facts {
      display: grid;
      gap: 10px;
      margin: 0;
    }
    .facts li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .f-ico {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      flex: none;
      border-radius: 8px;
      background: var(--surface-3);
      color: var(--fg-2);
    }
    .f-ico.ok {
      background: var(--cal-done);
      color: var(--cal-done-ink);
    }
    .f-ico.cool {
      background: var(--cool-soft);
      color: var(--cool);
    }
    @media (prefers-reduced-motion: reduce) {
      .bands i,
      .marker {
        animation: none;
      }
    }
  `,
})
export class BmiSheetComponent {
  readonly weightKg = input.required<number>();
  readonly heightCm = input.required<number>();
  readonly goalKg = input<number | null>(null);
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly Math = Math;

  protected readonly bands = BMI_BANDS.map((b) => ({ cls: b.cls, width: Math.max(LOW, Math.min(HIGH, b.to ?? HIGH)) - Math.max(LOW, b.from) }));
  protected readonly ticks = [18.5, 25, 30, 35, 40].map((v) => ({ v, left: pos(v) }));

  protected readonly bmi = computed(() => bmiOf(this.weightKg(), this.heightCm()));
  protected readonly band = computed(() => bmiBand(this.bmi()));
  /** its label stays inside the sheet at both ends */
  protected readonly marker = computed(() => Math.min(95, Math.max(5, pos(this.bmi()))));
  protected readonly healthy = computed(() => ({ from: weightForBmi(18.5, this.heightCm()), to: weightForBmi(25, this.heightCm()) - 0.1 }));
  protected readonly step = computed(() => nextBmiStep(this.bmi(), this.heightCm()));
  protected readonly goalBmi = computed(() => {
    const g = this.goalKg();
    return g ? bmiOf(g, this.heightCm()) : null;
  });
  protected readonly goalBand = computed(() => {
    const b = this.goalBmi();
    return b === null ? null : bmiBand(b).cls;
  });

  open(): void {
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    closeSheet(this.dialog().nativeElement);
  }
}
