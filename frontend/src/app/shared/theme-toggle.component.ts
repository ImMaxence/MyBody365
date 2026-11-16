import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { ThemeService } from '../core/theme/theme.service';
import { IconComponent } from './icon.component';

/** Light ⇄ dark switch of the public pages (the app's profile also offers "Auto"). */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <button type="button" class="icon-btn" [attr.aria-label]="label()" [attr.title]="label()" (click)="toggle($event)">
      <app-icon [name]="theme.resolved() === 'dark' ? 'sun' : 'moon'" [size]="20" />
    </button>
  `,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  private readonly i18n = inject(I18nService);
  protected readonly label = computed(() => this.i18n.t(this.theme.resolved() === 'dark' ? 'theme.toLight' : 'theme.toDark'));

  protected toggle(e: MouseEvent): void {
    this.theme.set(this.theme.resolved() === 'dark' ? 'light' : 'dark', e.currentTarget as Element);
  }
}
