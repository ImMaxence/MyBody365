import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { StackNavigation } from '../core/nav/stack-navigation';
import { IconComponent } from './icon.component';

/** the title of the screen a back button leads to, as iOS shows it ("‹ Profil") */
const TITLES: [RegExp, string][] = [
  [/^\/app\/?$/, 'nav.today'],
  [/^\/app\/meals\/recipes\/?$/, 'meals.recipes'],
  [/^\/app\/meals\/add\/?$/, 'meals.add'],
  [/^\/app\/meals\/?$/, 'nav.meals'],
  [/^\/app\/photos\/?$/, 'nav.photos'],
  [/^\/app\/progress\/?$/, 'nav.progress'],
  [/^\/app\/account\/?$/, 'nav.profile'],
];

/**
 * The back button of a pushed screen, the iOS way: a chevron and the title of the previous screen, in the
 * accent colour, above the large title. Pops the stack (or opens the parent screen after a direct link).
 */
@Component({
  selector: 'app-back-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <button type="button" class="back-link" [attr.aria-label]="label()" (click)="stack.back(fallback())">
      <app-icon name="chevronLeft" [size]="26" [stroke]="2.2" />
      @if (parentTitle(); as t) {
        <span class="txt">{{ t }}</span>
      }
    </button>
  `,
  styles: `
    :host {
      display: contents;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0;
      min-height: 44px;
      margin-left: -10px;
      padding: 0 10px 0 2px;
      border-radius: var(--radius-pill);
      color: var(--accent-text);
      font-size: 1.0625rem;
      font-weight: 550;
      letter-spacing: -0.01em;
      transition: opacity var(--dur-1);
    }
    .back-link.is-pressed {
      opacity: 0.45;
    }
    .txt {
      max-width: 60vw;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class BackButtonComponent {
  /** where to go when there is nothing to pop (default: the route's `back` data) */
  readonly fallback = input<string>();
  protected readonly stack = inject(StackNavigation);
  private readonly i18n = inject(I18nService);
  /** the parent screen of this one (static: read once) */
  private readonly parent = this.stack.parentUrl();

  protected readonly parentTitle = computed(() => {
    const url = (this.fallback() ?? this.parent).split(/[?#]/)[0];
    const key = TITLES.find(([re]) => re.test(url))?.[1];
    return key ? this.i18n.t(key) : null;
  });
  protected readonly label = computed(() => {
    const back = this.i18n.t('common.back');
    const t = this.parentTitle();
    return t ? `${back}, ${t}` : back;
  });
}
