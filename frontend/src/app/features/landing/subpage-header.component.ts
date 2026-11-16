import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';

/** Top bar of the secondary public pages (legal texts, changelog): back to where one came from, theme, logo. */
@Component({
  selector: 'app-subpage-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, LogoComponent, ThemeToggleComponent],
  template: `
    <header class="container top">
      <a [routerLink]="home()" class="back" (click)="back($event)"><app-icon name="chevronLeft" [size]="20" /> {{ 'legal.back' | t }}</a>
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
  private readonly stack = inject(StackNavigation);
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  protected readonly home = computed(() => (this.i18n.lang() === 'en' ? '/en' : '/'));

  /**
   * Back to the screen before (the Profile when opened from the app, the home page from the site);
   * nothing to go back to: the Profile inside the installed app, the home page in a browser.
   */
  protected back(e: MouseEvent): void {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (this.stack.canPop()) {
      this.doc.defaultView?.history.back();
      return;
    }
    const installed = this.doc.defaultView?.matchMedia('(display-mode: standalone)').matches;
    void this.router.navigateByUrl(installed ? '/app/account' : this.home());
  }
}
