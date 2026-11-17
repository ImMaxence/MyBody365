import { ChangeDetectionStrategy, Component, DOCUMENT, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { I18nService } from './core/i18n/i18n.service';
import { RouterOutlet } from '@angular/router';
import { InstallService } from './core/pwa/install.service';
import { ThemeService } from './core/theme/theme.service';
import { installSheets } from './core/ui/sheets';
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
          <app-icon [name]="toast.kind === 'error' ? 'alert' : toast.action ? 'sparkles' : 'check'" />
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

  constructor() {
    // every bottom sheet closes by a click outside, a tap on its grip or a swipe down
    if (isPlatformBrowser(inject(PLATFORM_ID))) installSheets(this.document);
    // a new version is downloaded in the background, then switched to without a word: the next time the app
    // goes to the background (the reload is not seen, the session stays). Nothing to tap. The app looks for a
    // new version each time it comes back to the front.
    const updates = inject(SwUpdate);
    if (!updates.isEnabled) return;
    let ready = false;
    updates.versionUpdates
      .pipe(
        filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        ready = true;
        if (this.document.visibilityState === 'hidden') this.switchVersion(updates);
      });
    // a broken cache (files of an old version gone): start again from the network
    updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => this.document.location.reload());
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'hidden') {
        if (ready) this.switchVersion(updates);
      } else {
        void updates.checkForUpdate().catch(() => false);
      }
    });
  }

  private switchVersion(updates: SwUpdate): void {
    void updates
      .activateUpdate()
      .then(() => this.document.location.reload())
      .catch(() => undefined);
  }
}
