import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { StackNavigation } from '../core/nav/stack-navigation';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { IconComponent } from './icon.component';

/** The "‹" of a pushed screen: pops the stack (or opens the parent screen after a direct link). */
@Component({
  selector: 'app-back-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <button type="button" class="icon-btn back" [attr.aria-label]="'common.back' | t" (click)="stack.back(fallback())">
      <app-icon name="chevronLeft" />
    </button>
  `,
  styles: `
    :host {
      display: contents;
    }
    .back {
      margin-left: -10px;
    }
  `,
})
export class BackButtonComponent {
  /** where to go when there is nothing to pop (default: the route's `back` data) */
  readonly fallback = input<string>();
  protected readonly stack = inject(StackNavigation);
}
