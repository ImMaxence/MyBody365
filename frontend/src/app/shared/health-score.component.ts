import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { healthBand } from '../core/meals/health';

/**
 * The health score of MyBody365 (1.13), in place of the Nutri-Score: « 7,5 /10 » on a tint of its band (green, lime,
 * amber, orange, red). "compact" fits a list; "full" (an amount sheet, a recipe) draws a ring around the score with its
 * name and its word (« Très bon »…).
 */
@Component({
  selector: 'app-health-score',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()', '[class.full]': "size() === 'full'", '[attr.data-band]': 'band()' },
  template: `
    @if (size() === 'full') {
      <span class="ring" [style.--p]="score() * 10">
        <b class="num">{{ text() }}</b>
      </span>
      <span class="copy">
        <span class="name">{{ i18n.t('meals.health.name') }}</span>
        <span class="word">{{ i18n.t('meals.health.bands.' + band()) }}</span>
      </span>
    } @else {
      <b class="num">{{ text() }}</b><small>/10</small>
    }
  `,
  styles: `
    :host {
      --hs: #1f9d55;
      display: inline-flex;
      align-items: baseline;
      justify-content: center;
      gap: 1px;
      flex: none;
      min-width: 50px;
      padding: 4px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--hs) 15%, var(--surface));
      /* the text half-way to the ink: 4.5:1 at least on its tint, in both themes */
      color: color-mix(in srgb, var(--hs) 50%, var(--fg));
      line-height: 1;
      font-family: var(--font-ui);
    }
    :host([data-band='good']) {
      --hs: #5fae2e;
    }
    :host([data-band='fair']) {
      --hs: #d19a00;
    }
    :host([data-band='weak']) {
      --hs: #e2711d;
    }
    :host([data-band='poor']) {
      --hs: #e5484d;
    }
    b {
      font-size: 15px;
      font-weight: 800;
    }
    small {
      font-size: 10px;
      font-weight: 700;
    }
    :host(.full) {
      align-items: center;
      gap: 10px;
      padding: 6px 14px 6px 6px;
      border-radius: 20px;
    }
    .ring {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background:
        radial-gradient(closest-side, var(--surface) 76%, transparent 78%),
        conic-gradient(var(--hs) calc(var(--p) * 1%), color-mix(in srgb, var(--hs) 18%, transparent) 0);
    }
    .ring b {
      font-size: 16px;
      color: color-mix(in srgb, var(--hs) 50%, var(--fg));
    }
    .copy {
      display: grid;
      gap: 3px;
      text-align: left;
    }
    .name {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--fg-2);
    }
    .word {
      font-size: 15px;
      font-weight: 750;
    }
  `,
})
export class HealthScoreComponent {
  readonly score = input.required<number>();
  readonly size = input<'compact' | 'full'>('compact');
  protected readonly i18n = inject(I18nService);
  protected readonly band = computed(() => healthBand(this.score()));
  protected readonly text = computed(() => this.i18n.number(this.score(), this.score() % 1 ? 1 : 0));
  protected readonly label = computed(() =>
    this.i18n.t('meals.health.label', { score: this.text(), band: this.i18n.t('meals.health.bands.' + this.band()) }),
  );
}
