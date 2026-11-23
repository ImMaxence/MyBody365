import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { SOURCES, SourceKey } from '../core/meals/sources';
import { IconComponent } from './icon.component';

/**
 * 1.19: « Sources des repères », folded under a card: who says each figure the card compares with, and a link to read
 * it (a new tab; in the installed app, the phone's browser sheet).
 */
@Component({
  selector: 'app-sources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (list().length) {
      <details class="sources">
        <summary class="tiny"><app-icon name="info" [size]="13" /> {{ 'meals.guideSources.title' | t }}<span class="chev" aria-hidden="true"><app-icon name="chevronDown" [size]="13" /></span></summary>
        <ul role="list">
          @for (s of list(); track s.key) {
            <li class="tiny">
              <span>{{ 'meals.guideSources.' + s.key | t }}</span>
              @if (s.url; as url) {
                <a [href]="en() ? url.en : url.fr" target="_blank" rel="noopener noreferrer"
                  >{{ 'meals.guideSources.read' | t: { host: s.host ?? '' } }}<span class="sr-only"> ({{ 'meals.guideSources.newTab' | t }})</span> <app-icon name="external" [size]="11" /></a>
              }
            </li>
          }
        </ul>
      </details>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .sources summary {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--fg-2);
      font-weight: 650;
      cursor: pointer;
      list-style: none;
      -webkit-tap-highlight-color: transparent;
    }
    .sources summary::-webkit-details-marker {
      display: none;
    }
    .chev {
      display: grid;
      transition: transform 240ms var(--ease-out);
    }
    .sources[open] .chev {
      transform: rotate(180deg);
    }
    ul {
      display: grid;
      gap: 6px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      color: var(--fg-2);
      line-height: 1.45;
    }
    li {
      display: grid;
      gap: 1px;
    }
    a {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      justify-self: start;
      color: var(--accent-text);
      font-weight: 700;
      text-decoration: none;
    }
  `,
})
export class SourcesComponent {
  readonly keys = input<readonly SourceKey[]>([]);
  private readonly i18n = inject(I18nService);
  protected readonly en = computed(() => this.i18n.lang() === 'en');
  protected readonly list = computed(() => this.keys().map((k) => SOURCES[k]));
}
