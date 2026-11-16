import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import type { LinkKind } from '../../core/api/models';
import { PasskeyService } from '../../core/auth/passkey.service';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { InstallService } from '../../core/pwa/install.service';
import { ToastService } from '../../core/ui/toast.service';
import { GoogleGComponent, IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';

type State = 'checking' | 'ready' | 'done' | 'invalid';

/**
 * /link#<token>: an invitation or recovery link made by an admin. It works in any browser (often
 * Safari, outside the installed app): it opens a session, then offers to create a passkey (synced
 * to the device's keychain, so it works in the app too) or to link a Google account.
 */
@Component({
  selector: 'app-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, GoogleGComponent, LogoComponent],
  template: `
    <main id="main" class="wrap">
      <app-logo [size]="40" />
      @switch (state()) {
        @case ('checking') {
          <div class="card center"><span class="spinner"></span> {{ 'link.checking' | t }}</div>
        }
        @case ('invalid') {
          <div class="card stack">
            <span class="badge danger"><app-icon name="alert" /></span>
            <h1 class="h3">{{ 'link.invalidTitle' | t }}</h1>
            <p class="muted">{{ i18n.error(error()) }}</p>
            <p class="small muted">{{ 'link.invalidText' | t }}</p>
            <a routerLink="/" class="btn btn-secondary btn-block">MyBody365</a>
          </div>
        }
        @case ('ready') {
          <div class="card stack">
            <span class="badge"><app-icon [name]="kind() === 'INVITE' ? 'sparkles' : 'key'" /></span>
            <h1 class="h3">{{ (kind() === 'INVITE' ? 'link.inviteTitle' : 'link.recoveryTitle') | t }}</h1>
            <p class="muted">{{ (kind() === 'INVITE' ? 'link.inviteText' : 'link.recoveryText') | t }}</p>
            <button type="button" class="btn btn-primary btn-block" (click)="addPasskey()" [disabled]="busy()">
              <app-icon name="fingerprint" /> {{ 'link.addPasskey' | t }}
            </button>
            <p class="tiny faint center-text">{{ 'link.passkeyHint' | t }}</p>
            @if (session.providers().google) {
              <div class="or">{{ 'common.or' | t }}</div>
              <a href="/api/auth/link/google" class="btn btn-secondary btn-block"><app-google-g /> {{ 'link.linkGoogle' | t }}</a>
            }
          </div>
        }
        @case ('done') {
          <div class="card stack">
            <span class="badge ok"><app-icon name="check" /></span>
            <h1 class="h3">{{ 'link.done' | t }}</h1>
            <p class="muted">{{ 'link.doneText' | t }}</p>
            @if (install.canOpenApp()) {
              <a routerLink="/app" class="btn btn-primary btn-block">{{ 'link.openApp' | t }}</a>
            } @else {
              <a [routerLink]="i18n.lang() === 'en' ? '/en' : '/'" fragment="install" class="btn btn-primary btn-block">
                {{ 'link.installFirst' | t }}
              </a>
            }
          </div>
        }
      }
    </main>
  `,
  styles: `
    .wrap {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: var(--space-8);
      min-height: 100dvh;
      padding: calc(var(--safe-top) + var(--space-8)) var(--space-4) calc(var(--safe-bottom) + var(--space-8));
    }
    .card {
      width: min(100%, 420px);
      padding: var(--space-8) var(--space-6);
    }
    .center {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
    }
    .center-text {
      text-align: center;
    }
    .badge {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: var(--flame);
      color: var(--accent-ink);
    }
    .badge.ok {
      background: var(--success-soft);
      color: var(--success);
    }
    .badge.danger {
      background: var(--danger-soft);
      color: var(--danger);
    }
    .spinner {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2.5px solid var(--line-strong);
      border-top-color: var(--accent);
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class LinkPage {
  protected readonly i18n = inject(I18nService);
  protected readonly session = inject(SessionStore);
  protected readonly install = inject(InstallService);
  private readonly api = inject(ApiService);
  private readonly passkeys = inject(PasskeyService);
  private readonly toast = inject(ToastService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly state = signal<State>('checking');
  protected readonly kind = signal<LinkKind>('INVITE');
  protected readonly error = signal<string>('link_invalid');
  protected readonly busy = signal(false);

  constructor() {
    if (!this.browser) return;
    this.i18n.set(this.i18n.preferred());
    const token = location.hash.replace(/^#/, '').trim();
    const linked = new URLSearchParams(location.search).get('linked') === 'google';
    // the token never stays in the address bar or the history
    history.replaceState(null, '', location.pathname);
    void this.session.loadProviders();
    if (linked) {
      // back from Google: the account is linked (see SecurityConfig)
      this.toast.show(this.i18n.t('security.googleLinkedToast'));
      this.state.set('done');
      return;
    }
    if (!token) {
      this.error.set('link_incomplete');
      this.state.set('invalid');
      return;
    }
    void this.redeem(token);
  }

  private async redeem(token: string): Promise<void> {
    try {
      const res = await this.api.redeemLink(token);
      this.kind.set(res.kind);
      this.session.setAccount(res.account);
      this.state.set('ready');
    } catch (e) {
      this.error.set(errorCode(e));
      this.state.set('invalid');
    }
  }

  protected async addPasskey(): Promise<void> {
    this.busy.set(true);
    try {
      await this.passkeys.register(this.i18n.t('security.passkeyDefault'));
      this.state.set('done');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
