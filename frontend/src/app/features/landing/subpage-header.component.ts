import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';

/** Top bar of the secondary public pages (legal texts, changelog): back home, theme, logo. */
@Component({
  selector: 'app-subpage-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, LogoComponent, ThemeToggleComponent],
  template: `
    <header class="container top">
      <a [routerLink]="home()" class="back"><app-icon name="chevronLeft" [size]="20" /> {{ 'legal.back' | t }}</a>
      <span class="end">
        <app-theme-toggle />
        <app-logo [size]="28" [wordmark]="false" />
      </span>
    </header>
  `,
  styles: `
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: calc(var(--safe-top) + var(--space-4)) 0 var(--space-4);
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 44px;
      font-weight: 600;
      color: var(--fg-2);
    }
    .end {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }
  `,
})
export class SubpageHeaderComponent {
  private readonly i18n = inject(I18nService);
  protected readonly home = computed(() => (this.i18n.lang() === 'en' ? '/en' : '/'));
}
