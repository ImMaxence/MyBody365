import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import { PasskeyService } from '../../core/auth/passkey.service';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { GoogleGComponent, IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';

/**
 * Sign-in: Google or a passkey. Where a password app would say "forgot your password?", this one
 * offers to request access (newcomers) or a recovery link (people who lost theirs).
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, GoogleGComponent, LogoComponent],
  template: `
    <main class="login">
      <div class="art" aria-hidden="true">
        <div class="orb"></div>
        <svg viewBox="0 0 200 200" class="ring">
          <defs>
            <linearGradient id="lg-ring" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stop-color="#ff3d1f" />
              <stop offset=".5" stop-color="#ff7a1a" />
              <stop offset="1" stop-color="#ffc23d" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="84" class="track" />
          <circle cx="100" cy="100" r="84" class="value" stroke="url(#lg-ring)" />
        </svg>
        <app-logo [size]="72" [wordmark]="false" class="center-logo" />
      </div>

      <div class="copy">
        <p class="eyebrow">{{ 'auth.welcomeEyebrow' | t }}</p>
        <h1 class="display title">{{ 'auth.title' | t }}</h1>
        <p class="muted">{{ 'auth.subtitle' | t }}</p>
      </div>

      @if (errorMessage()) {
        <p class="notice notice-danger" role="alert"><app-icon name="alert" /> {{ errorMessage() }}</p>
      }

      <div class="actions">
        @if (session.providers().google) {
          <a class="btn btn-secondary btn-block google" href="/api/auth/oauth2/authorization/google" (click)="busy.set(true)">
            <app-google-g /> {{ 'auth.google' | t }}
          </a>
        }
        <button type="button" class="btn btn-dark btn-block" (click)="passkey()" [disabled]="busy()">
          <app-icon name="fingerprint" /> {{ busy() ? ('auth.signingIn' | t) : ('auth.passkey' | t) }}
        </button>
        @if (session.providers().devLogin) {
          <div class="dev">
            <a class="btn btn-ghost btn-s" href="/api/auth/dev-login?as=admin">{{ 'auth.devAdmin' | t }}</a>
            <a class="btn btn-ghost btn-s" href="/api/auth/dev-login?as=user">{{ 'auth.devUser' | t }}</a>
          </div>
        }
      </div>

      <div class="help">
        <a routerLink="/app/request" class="help-row">
          <span>
            <span class="small muted">{{ 'auth.noAccess' | t }}</span>
            <strong>{{ 'auth.requestAccess' | t }}</strong>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
        <a routerLink="/app/request" [queryParams]="{ kind: 'lost' }" class="help-row">
          <span>
            <span class="small muted">{{ 'auth.lostAccess' | t }}</span>
            <strong>{{ 'auth.lostAccessCta' | t }}</strong>
          </span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      </div>

      <p class="tiny faint legal">
        {{ legalBefore() }}<a [routerLink]="prefix() + '/legal/cgu'">{{ 'auth.terms' | t }}</a>{{ legalMiddle()
        }}<a [routerLink]="prefix() + '/legal/confidentialite'">{{ 'auth.privacy' | t }}</a>{{ legalAfter() }}
      </p>
    </main>
  `,
  styles: `
    .login {
      display: grid;
      gap: var(--space-5);
      align-content: center;
      width: min(100%, 440px);
      min-height: 100dvh;
      margin-inline: auto;
      padding: calc(var(--safe-top) + var(--space-6)) var(--space-5) calc(var(--safe-bottom) + var(--space-6));
    }
    .art {
      position: relative;
      display: grid;
      place-items: center;
      height: 200px;
    }
    .orb {
      position: absolute;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(circle, var(--accent-glow), transparent 68%);
    }
    .ring {
      position: absolute;
      width: 190px;
      height: 190px;
      transform: rotate(-90deg);
    }
    .ring circle {
      fill: none;
      stroke-width: 10;
    }
    .ring .track {
      stroke: var(--line);
    }
    .ring .value {
      stroke-linecap: round;
      stroke-dasharray: 527.8;
      stroke-dashoffset: 527.8;
      animation: fill 1.6s var(--ease-out) 0.2s forwards;
    }
    @keyframes fill {
      to {
        stroke-dashoffset: 60;
      }
    }
    .center-logo {
      position: relative;
      filter: drop-shadow(0 14px 30px var(--accent-glow));
    }
    .copy {
      display: grid;
      gap: var(--space-2);
      text-align: center;
    }
    .title {
      font-size: 2.3rem;
    }
    .actions {
      display: grid;
      gap: var(--space-3);
    }
    .google {
      font-weight: 600;
    }
    .dev {
      display: flex;
      justify-content: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .help {
      display: grid;
      border-radius: var(--radius-l);
      border: 1px solid var(--line);
      background: var(--surface);
      overflow: hidden;
    }
    .help-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: 14px 16px;
    }
    .help-row + .help-row {
      border-top: 1px solid var(--line);
    }
    .help-row > span {
      display: grid;
    }
    .help-row strong {
      font-weight: 650;
    }
    .legal {
      text-align: center;
    }
    .legal a {
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  `,
})
export class LoginPage {
  /** ?error= from the Google sign-in (not_allowed, suspended…) */
  readonly error = input<string>();

  protected readonly session = inject(SessionStore);
  private readonly i18n = inject(I18nService);
  private readonly passkeys = inject(PasskeyService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  private readonly passkeyError = signal<string | null>(null);
  protected readonly errorMessage = computed(() => {
    const code = this.passkeyError() ?? this.error();
    return code ? this.i18n.error(code) : null;
  });

  protected readonly prefix = computed(() => (this.i18n.lang() === 'en' ? '/en' : ''));
  private readonly legalParts = computed(() => this.i18n.t('auth.legal').split(/\{terms\}|\{privacy\}/));
  protected readonly legalBefore = computed(() => this.legalParts()[0] ?? '');
  protected readonly legalMiddle = computed(() => this.legalParts()[1] ?? '');
  protected readonly legalAfter = computed(() => this.legalParts()[2] ?? '');

  constructor() {
    void this.session.loadProviders();
  }

  protected async passkey(): Promise<void> {
    this.busy.set(true);
    this.passkeyError.set(null);
    try {
      await this.passkeys.authenticate();
      await this.session.refresh();
      await this.router.navigateByUrl('/app');
    } catch (e) {
      const code = errorCode(e);
      if (code !== 'passkey_cancelled') this.passkeyError.set(code);
    } finally {
      this.busy.set(false);
    }
  }
}
