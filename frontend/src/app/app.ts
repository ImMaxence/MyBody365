import { ChangeDetectionStrategy, Component, DOCUMENT, EnvironmentInjector, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { I18nService } from './core/i18n/i18n.service';
import { Router, RouterOutlet } from '@angular/router';
import { AppUpdate } from './core/pwa/app-update';
import { InstallService } from './core/pwa/install.service';
import { StackNavigation } from './core/nav/stack-navigation';
import { ThemeService } from './core/theme/theme.service';
import { bootSplash } from './core/ui/boot-splash';
import { installSheets } from './core/ui/sheets';
import { installPress } from './core/ui/press';
import { ToastService } from './core/ui/toast.service';
import { IconComponent } from './shared/icon.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, IconComponent],
  template: `
    <router-outlet />
    <div class="toast-host" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class.error]="toast.kind === 'error'" role="status" (click)="toasts.dismiss(toast.id)">
          <app-icon [name]="toast.icon ?? (toast.kind === 'error' ? 'alert' : toast.action ? 'sparkles' : 'check')" />
          <span class="toast-text">{{ toast.text }}</span>
          @if (toast.action; as action) {
            <button type="button" class="toast-action" (click)="action.run()">{{ action.label }}</button>
          }
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
  // started at boot: the theme follows the saved choice, the install prompt is caught early
  private readonly theme = inject(ThemeService);
  private readonly install = inject(InstallService);
  private readonly i18n = inject(I18nService);
  private readonly document = inject(DOCUMENT);
  // from the first screen: it keeps where each screen was scrolled to
  private readonly stack = inject(StackNavigation);

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    // 1.15: the logo shown while the app starts leaves once the first screen is drawn (never on the public pages)
    bootSplash(this.document, inject(Router), inject(EnvironmentInjector), !browser);
    // every bottom sheet closes by a click outside, a tap on its grip or a swipe down
    if (browser) installSheets(this.document);
    // 1.20: a button pressed only by a real tap, never by a finger scrolling over it
    if (browser) installPress(this.document);
    // a new version is downloaded in the background, then switched to without a word the next time the app goes to
    // the background; 1.20.2: while it stays open in front, it is said in the Profile, with « Recharger » (core/pwa/app-update.ts)
    if (browser) inject(AppUpdate).start();
  }
}
