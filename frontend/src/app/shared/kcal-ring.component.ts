import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/** The day's calories as a ring: what is left (or over) in the middle, the ring fills as meals are logged. */
@Component({
  selector: 'app-kcal-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <div class="ring" [class.over]="over()" role="img" [attr.aria-label]="label()" [style.--size.px]="size()">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" class="track" />
        <circle cx="50" cy="50" r="44" class="val" pathLength="100" [style.stroke-dashoffset]="100 - pct()" />
      </svg>
      <div class="center">
        <span class="v num">{{ i18n.number(Math.abs(left())) }}</span>
        <span class="u">{{ 'meals.kcal' | t }} {{ (over() ? 'meals.over' : 'meals.left') | t }}</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .ring {
      position: relative;
      width: var(--size);
      height: var(--size);
    }
    svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    circle {
      fill: none;
      stroke-width: 9;
      stroke-linecap: round;
    }
    .track {
      stroke: var(--surface-3);
    }
    .val {
      stroke: var(--accent);
      stroke-dasharray: 100;
      transition: stroke-dashoffset 900ms var(--ease-out);
      animation: fill-in 1100ms var(--ease-out) both;
    }
    .over .val {
      stroke: var(--warning);
    }
    @keyframes fill-in {
      from {
        stroke-dashoffset: 100;
      }
    }
    .center {
      position: absolute;
      inset: 14%;
      display: grid;
      place-content: center;
      justify-items: center;
      text-align: center;
      line-height: 1.05;
    }
    .v {
      font-weight: 800;
      font-size: calc(var(--size) * 0.2);
      letter-spacing: -0.02em;
    }
    .u {
      max-width: 9ch;
      font-size: calc(var(--size) * 0.085);
      font-weight: 600;
      color: var(--fg-2);
    }
    @media (prefers-reduced-motion: reduce) {
      .val {
        animation: none;
        transition: none;
      }
    }
  `,
})
export class KcalRingComponent {
  readonly eaten = input.required<number>();
  readonly target = input<number | null | undefined>(null);
  readonly size = input(132);
  protected readonly i18n = inject(I18nService);
  protected readonly Math = Math;

  protected readonly left = computed(() => Math.round((this.target() ?? 0) - this.eaten()));
  protected readonly over = computed(() => this.left() < 0);
  protected readonly pct = computed(() => {
    const t = this.target();
    return t ? Math.min(100, (this.eaten() / t) * 100) : 0;
  });
  protected readonly label = computed(() =>
    this.i18n.t('meals.ringLabel', { eaten: this.i18n.number(Math.round(this.eaten())), target: this.i18n.number(this.target() ?? 0) }),
  );
}
