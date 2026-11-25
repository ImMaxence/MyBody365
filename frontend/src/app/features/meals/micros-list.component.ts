import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MICROS, pctOf, type MicroKey } from '../../core/meals/micros';

/**
 * 1.14: every vitamin and mineral known for an amount (a serving of a recipe), in % of the reference of a whole day, the
 * richest in bold. Nothing at all when none is known (a recipe written by hand). 1.21: under each one, the ingredients that
 * bring it the most, and a tap on it says what it is for.
 */
@Component({
  selector: 'app-micros-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    @if (rows().length) {
      <ul class="micros" role="list">
        @for (m of rows(); track m.key) {
          <li [class.rich]="m.pct >= 15">
            <button type="button" class="mi-row" (click)="info.emit(m.key)">
              <span class="mi-name">{{ 'meals.micros.names.' + m.key | t }}</span>
              <span class="mi-bar" aria-hidden="true"><i [style.width.%]="m.bar"></i></span>
              <span class="mi-pct num">{{ m.pct }}&nbsp;%</span>
            </button>
            @if (m.from.length) {
              <span class="mi-src tiny">{{ 'meals.micros.mostly' | t: { list: m.from.join(', ') } }}</span>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .micros {
      display: grid;
      gap: 7px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      gap: 2px;
      font-size: 13px;
      color: var(--fg-2);
    }
    .mi-row {
      display: grid;
      grid-template-columns: minmax(0, 7.5rem) minmax(0, 1fr) 3.2rem;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      min-height: 24px;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .mi-src {
      color: var(--fg-3, var(--fg-2));
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    li.rich {
      color: var(--fg);
      font-weight: 700;
    }
    .mi-name {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .mi-bar {
      height: 6px;
      border-radius: 3px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .mi-bar i {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: color-mix(in srgb, var(--success, #1f9d55) 55%, var(--surface-3));
    }
    li.rich .mi-bar i {
      background: var(--success, #1f9d55);
    }
    .mi-pct {
      text-align: right;
    }
  `,
})
export class MicrosListComponent {
  readonly micros = input<Partial<Record<string, number>> | null | undefined>(null);
  readonly factor = input(1);
  /** 1.21: the ingredients that bring each one the most */
  readonly sources = input<Partial<Record<string, string[]>> | null>(null);
  /** 1.21: one was tapped: what it is for */
  readonly info = output<MicroKey>();
  protected readonly rows = computed(() => {
    const known = this.micros() ?? {};
    const from = this.sources() ?? {};
    return MICROS.filter((m) => known[m.key] != null).map((m) => {
      const pct = pctOf(m, (known[m.key] ?? 0) * this.factor());
      return { key: m.key, pct, bar: Math.min(100, pct), from: pct > 0 ? (from[m.key] ?? []) : [] };
    });
  });
}
