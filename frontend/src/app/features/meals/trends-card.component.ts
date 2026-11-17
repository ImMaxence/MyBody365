import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Trend, trendText } from '../../core/meals/trends';
import { IconComponent } from '../../shared/icon.component';

/** What stands out in the last 7 days (core/meals/trends.ts), on the meals page and the summary of the week. */
@Component({
  selector: 'app-trends-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent],
  host: { style: 'display: contents' },
  template: `
    @if (trends().length) {
      <section class="card trends">
        <h2 class="trends-title"><app-icon name="activity" [size]="17" /> {{ 'meals.trends.title' | t }}</h2>
        <ul role="list">
          @for (tr of trends(); track tr.key) {
            <li [attr.data-tone]="tr.tone"><span class="t-dot" aria-hidden="true"></span><span>{{ text(tr) }}</span></li>
          }
        </ul>
        <a routerLink="/app/meals/stats" class="small more">{{ 'meals.trends.more' | t }} <app-icon name="chevronRight" [size]="14" /></a>
      </section>
    }
  `,
  styles: `
    .trends {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4) var(--space-5);
    }
    .trends-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 1rem;
      font-weight: 750;
    }
    .trends ul {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .trends li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: var(--fs-s);
      line-height: 1.45;
    }
    .t-dot {
      width: 8px;
      height: 8px;
      flex: none;
      margin-top: 0.45em;
      border-radius: 50%;
      background: var(--cool);
    }
    .trends li[data-tone='warn'] .t-dot {
      background: #ee8100;
    }
    .trends li[data-tone='good'] .t-dot {
      background: var(--success);
    }
    .more {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      justify-self: start;
      color: var(--accent-text);
      font-weight: 700;
      text-decoration: none;
    }
  `,
})
export class TrendsCardComponent {
  readonly trends = input<Trend[]>([]);
  private readonly i18n = inject(I18nService);

  protected text(t: Trend): string {
    return trendText(t, this.i18n);
  }
}
