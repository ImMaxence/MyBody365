import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Grade } from '../core/api/models';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';

const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;
/** the colours of the Nutri-Score scale (Santé publique France) */
const COLORS: Record<string, string> = { a: '#038141', b: '#85bb2f', c: '#fecb02', d: '#ee8100', e: '#e63e11' };

let uid = 0;

/**
 * The Nutri-Score as on the packaging: the five letters A to E in their colours on a white label, the
 * grade of the food bigger, with a white outline. "full" (an amount sheet, a recipe) adds the title;
 * "compact" fits a list. A grade worked out by the app (a recipe, a food without an official score)
 * says so: "estimé" under the full label, a dashed outline on the compact one.
 */
@Component({
  selector: 'app-nutriscore',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  host: { role: 'img', '[attr.aria-label]': 'label()', '[class.full]': 'full()', '[class.estimated]': 'estimated()' },
  template: `
    <svg [attr.viewBox]="'0 0 106 ' + height()" aria-hidden="true">
      <defs>
        <clipPath [attr.id]="clip">
          <rect x="9" [attr.y]="top()" width="88" height="22" rx="11" />
        </clipPath>
      </defs>
      <rect x="1.5" y="1.5" width="103" [attr.height]="height() - 3" [attr.rx]="full() ? 11 : 13" class="frame" />
      @if (full()) {
        <text x="11" y="14" class="title">NUTRI-SCORE</text>
      }
      <g [attr.clip-path]="'url(#' + clip + ')'">
        @for (l of letters; track l; let i = $index) {
          <rect [attr.x]="9 + i * 17.6" [attr.y]="top()" width="17.7" height="22" [attr.fill]="colors[l]" />
        }
      </g>
      @for (l of letters; track l; let i = $index) {
        @if (l !== g()) {
          <text [attr.x]="17.8 + i * 17.6" [attr.y]="top() + 16" class="letter">{{ l.toUpperCase() }}</text>
        }
      }
      <rect [attr.x]="9 + index() * 17.6 - 4" [attr.y]="top() - 5" width="25.6" height="32" rx="8" [attr.fill]="colors[g()]" class="chosen" />
      <text [attr.x]="17.8 + index() * 17.6" [attr.y]="top() + 19" class="letter big">{{ g().toUpperCase() }}</text>
    </svg>
    @if (full() && estimated()) {
      <span class="est">{{ 'meals.nutriscoreEstimatedShort' | t }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      justify-items: center;
      gap: 2px;
      flex: none;
      width: 62px;
      line-height: 1;
    }
    :host(.full) {
      width: 128px;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }
    .frame {
      fill: #fff;
      stroke: #d4d4d4;
      stroke-width: 1.5;
    }
    :host(.estimated:not(.full)) .frame {
      stroke: #8a8a8a;
      stroke-dasharray: 4 3;
    }
    .title {
      fill: #5f6368;
      font: 800 9.5px var(--font-ui);
      letter-spacing: 0.06em;
    }
    .letter {
      fill: #fff;
      fill-opacity: 0.78;
      font: 800 13px var(--font-ui);
      text-anchor: middle;
    }
    .letter.big {
      fill-opacity: 1;
      font-size: 20px;
    }
    .chosen {
      stroke: #fff;
      stroke-width: 2.5;
      filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.35));
    }
    .est {
      font-size: 10px;
      font-weight: 650;
      color: var(--fg-2);
    }
  `,
})
export class NutriscoreComponent {
  readonly grade = input.required<Grade>();
  readonly estimated = input(false);
  /** full: with its title (sheets, recipes); compact: in a list */
  readonly size = input<'compact' | 'full'>('compact');
  private readonly i18n = inject(I18nService);
  protected readonly letters = LETTERS;
  protected readonly colors = COLORS;
  protected readonly clip = `ns-${++uid}`;
  protected readonly g = computed(() => (this.grade() ?? 'c').toLowerCase());
  protected readonly index = computed(() => Math.max(0, LETTERS.indexOf(this.g() as (typeof LETTERS)[number])));
  protected readonly full = computed(() => this.size() === 'full');
  /** room for the title on the full label */
  protected readonly top = computed(() => (this.full() ? 22 : 9));
  protected readonly height = computed(() => (this.full() ? 54 : 40));
  protected readonly label = computed(() =>
    this.i18n.t(this.estimated() ? 'meals.nutriscoreEstimated' : 'meals.nutriscore', { grade: this.g().toUpperCase() }),
  );
}
