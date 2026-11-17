import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService, Lang } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { FlagComponent } from '../../shared/flag.component';
import { IconComponent } from '../../shared/icon.component';

/** The app itself: light, dark or as the phone; French or English. */
@Component({
  selector: 'app-app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, BackButtonComponent, FlagComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'account.settings' | t }}</h1>
      </header>

      <section class="block">
        <h2 class="section-title">{{ 'account.appearance' | t }}</h2>
        <div class="seg" role="group" [attr.aria-label]="'theme.label' | t">
          @for (m of modes; track m.mode) {
            <button type="button" [attr.aria-pressed]="theme.mode() === m.mode" (click)="theme.set(m.mode, $any($event.currentTarget))">
              <app-icon [name]="m.icon" /> {{ 'theme.' + m.mode | t }}
            </button>
          }
        </div>
        <p class="tiny muted">{{ 'account.themeHint' | t }}</p>
      </section>

      <section class="block">
        <h2 class="section-title">{{ 'account.language' | t }}</h2>
        <div class="seg" role="group" [attr.aria-label]="'account.language' | t">
          <button type="button" lang="fr" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="setLang('fr')"><app-flag lang="fr" /> Français</button>
          <button type="button" lang="en" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="setLang('en')"><app-flag lang="en" /> English</button>
        </div>
        <p class="tiny muted">{{ 'account.languageHint' | t }}</p>
      </section>
    </main>
  `,
  styles: `
    .block {
      display: grid;
      gap: var(--space-2);
    }
  `,
})
export class AppSettingsPage {
  private readonly session = inject(SessionStore);
  private readonly api = inject(ApiService);
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly modes: { mode: ThemeMode; icon: string }[] = [
    { mode: 'system', icon: 'contrast' },
    { mode: 'light', icon: 'sun' },
    { mode: 'dark', icon: 'moon' },
  ];

  protected async setLang(lang: Lang): Promise<void> {
    this.i18n.set(lang, true);
    try {
      this.session.setAccount(await this.api.updateMe({ locale: lang }));
    } catch {
      /* kept on this device anyway */
    }
  }
}
