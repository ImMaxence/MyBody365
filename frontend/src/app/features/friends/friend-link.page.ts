import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { FriendsApi } from '../../core/friends/friends-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';

type State = 'checking' | 'done' | 'signedOut' | 'invalid';

/**
 * /friends/add#<token>: a friend link, opened from a message or a QR code (often in the browser, not in the
 * installed app). Signed in here: the friendship is made at once. Otherwise: how to finish in the app.
 */
@Component({
  selector: 'app-friend-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, LogoComponent],
  template: `
    <main id="main" class="wrap">
      <app-logo [size]="40" />
      <div class="card stack">
        @switch (state()) {
          @case ('checking') {
            <p class="center"><span class="spinner"></span> {{ 'friends.landing.accepting' | t }}</p>
          }
          @case ('done') {
            <span class="badge ok"><app-icon name="users" /></span>
            <h1 class="h3">{{ 'friends.landing.done' | t: { name: name() } }}</h1>
            <a routerLink="/app/friends" class="btn btn-primary btn-block">{{ 'friends.landing.openApp' | t }}</a>
          }
          @case ('signedOut') {
            <span class="badge"><app-icon name="userPlus" /></span>
            <h1 class="h3">{{ 'friends.landing.title' | t }}</h1>
            <p class="muted">{{ 'friends.landing.signedOut' | t }}</p>
            <button type="button" class="btn btn-primary btn-block" (click)="copy()"><app-icon name="copy" /> {{ 'friends.landing.copy' | t }}</button>
          }
          @case ('invalid') {
            <span class="badge danger"><app-icon name="alert" /></span>
            <h1 class="h3">{{ 'friends.landing.title' | t }}</h1>
            <p class="muted">{{ message() }}</p>
            <a routerLink="/" class="btn btn-secondary btn-block">MyBody365</a>
          }
        }
      </div>
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
      animation: rise 420ms var(--ease-out);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(14px);
      }
    }
    .center {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
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
export class FriendLinkPage {
  private readonly api = inject(FriendsApi);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);

  protected readonly state = signal<State>('checking');
  protected readonly name = signal('');
  protected readonly message = signal('');
  private link = '';

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.i18n.set(this.i18n.preferred());
    const token = location.hash.replace(/^#/, '').trim();
    this.link = location.href;
    // the token leaves the address bar (and the history) at once
    history.replaceState(null, '', location.pathname);
    void this.run(token);
  }

  private async run(token: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
      this.fail('invite_invalid');
      return;
    }
    const me = await this.session.load();
    if (!me.authenticated || !me.account?.onboarded) {
      this.state.set('signedOut');
      return;
    }
    try {
      const f = await this.api.accept(token);
      this.name.set(f.name);
      this.state.set('done');
    } catch (e) {
      this.fail(errorCode(e));
    }
  }

  private fail(code: string): void {
    this.message.set(code === 'invite_invalid' ? this.i18n.t('friends.landing.invalid') : this.i18n.error(code));
    this.state.set('invalid');
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link);
      this.toast.show(this.i18n.t('friends.landing.copied'));
    } catch {
      this.toast.error(this.i18n.error('generic'));
    }
  }
}
