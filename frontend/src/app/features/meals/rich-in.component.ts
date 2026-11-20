import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { richIn } from '../../core/meals/micros';
import { IconComponent } from '../../shared/icon.component';

/**
 * 1.14: « Riche en » with the vitamins and minerals an amount brings the most of (15 % of their daily reference or more),
 * the richest first: nothing at all when it brings little of them, or when they are not known.
 */
@Component({
  selector: 'app-rich-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (rows().length) {
      <div class="rich">
        <span class="label"><app-icon name="heart" [size]="14" /> {{ 'meals.micros.sort' | t }}</span>
        <ul role="list">
          @for (r of rows(); track r.key) {
            <li>
              {{ 'meals.micros.names.' + r.key | t }} <b class="num">{{ r.pct }}&nbsp;%</b>
            </li>
          }
        </ul>
        @if (from(); as name) {
          <span class="tiny muted">{{ 'meals.micros.estimated' | t: { name } }}</span>
        }
      </div>
    }
  `,
  styles: `
    .rich {
      display: grid;
      gap: 6px;
    }
    .label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--fg-2);
    }
    .label app-icon {
      color: #c2255c;
    }
    ul {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      padding: 4px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, #d6336c 9%, var(--surface-2));
      font-size: 12.5px;
    }
    li b {
      font-weight: 700;
    }
  `,
})
export class RichInComponent {
  /** per 100 g (with factor = grams / 100), per serving (factor = servings), or already for the amount */
  readonly micros = input<Partial<Record<string, number>> | null | undefined>(null);
  readonly factor = input(1);
  /** 1.15: the close food they were taken from (the table had none for this one) */
  readonly from = input<string | null | undefined>(null);
  /** the share of the daily reference from which it counts, in % */
  readonly min = input(15);
  protected readonly rows = computed(() => richIn(this.micros(), this.factor(), this.min()).slice(0, 6));
}
