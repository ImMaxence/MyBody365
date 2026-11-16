import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiService, errorCode } from '../../core/api/api.service';
import type { SecurityInfo } from '../../core/api/models';
import { PasskeyService } from '../../core/auth/passkey.service';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { GoogleGComponent, IconComponent } from '../../shared/icon.component';
import { BackButtonComponent } from '../../shared/back-button.component';

/** The account's ways in: its Google account and its passkeys. */
@Component({
  selector: 'app-security',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, GoogleGComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'security.title' | t }}</h1>
      </header>

      <h2 class="section-title">{{ 'security.google' | t }}</h2>
      <div class="card row google">
        <span class="g"><app-google-g /></span>
        <span class="spacer small">
          @if (info()?.googleLinked) {
            {{ 'security.googleLinked' | t: { email: info()?.googleEmail ?? '' } }}
          } @else {
            <span class="muted">{{ 'security.googleNone' | t }}</span>
          }
        </span>
      </div>
      @if (session.providers().google) {
        <a href="/api/auth/link/google" class="btn btn-secondary btn-block">
          <app-icon name="link" /> {{ (info()?.googleLinked ? 'security.googleRelink' : 'security.googleLink') | t }}
        </a>
      }

      <h2 class="section-title">{{ 'security.passkeys' | t }}</h2>
      <p class="small muted">{{ 'security.passkeysText' | t }}</p>
      @if (info(); as i) {
        @if (i.passkeys.length) {
          <div class="list">
            @for (pk of i.passkeys; track pk.id) {
              <div class="list-item">
                <span class="list-icon"><app-icon name="fingerprint" /></span>
                <span class="list-body">
                  <span class="list-title">{{ pk.label }}</span>
                  <span class="list-sub">
                    {{ 'security.passkeyCreated' | t: { date: i18n.date(pk.createdAt) } }}
                    @if (pk.lastUsedAt) {
                      · {{ 'security.passkeyUsed' | t: { date: i18n.date(pk.lastUsedAt) } }}
                    }
                  </span>
                </span>
                @if (pk.synced) {
                  <span class="chip chip-success">{{ 'security.passkeySynced' | t }}</span>
                }
                <button type="button" class="icon-btn" (click)="remove(pk.id)" [attr.aria-label]="'common.delete' | t">
                  <app-icon name="trash" [size]="20" />
                </button>
              </div>
            }
          </div>
        } @else {
          <p class="notice"><app-icon name="info" /> {{ 'security.passkeyNone' | t }}</p>
        }
        @if (methods() <= 1) {
          <p class="notice notice-accent"><app-icon name="alert" /> {{ 'security.lastMethod' | t }}</p>
        }
      } @else {
        <div class="skeleton" style="height: 120px"></div>
      }
      <button type="button" class="btn btn-dark btn-block" (click)="add()" [disabled]="busy()">
        <app-icon name="plus" /> {{ 'security.passkeyAdd' | t }}
      </button>
    </main>
  `,
  styles: `
    .small-title {
      font-size: 1.5rem;
    }
    .google .g {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: #fff;
      border: 1px solid var(--line);
    }
  `,
})
export class SecurityPage {
  protected readonly session = inject(SessionStore);
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(ApiService);
  private readonly passkeys = inject(PasskeyService);
  private readonly toast = inject(ToastService);

  protected readonly info = signal<SecurityInfo | null>(null);
  protected readonly busy = signal(false);
  protected readonly methods = () => (this.info()?.passkeys.length ?? 0) + (this.info()?.googleLinked ? 1 : 0);

  constructor() {
    void this.session.loadProviders();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.info.set(await this.api.security());
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async add(): Promise<void> {
    this.busy.set(true);
    try {
      await this.passkeys.register(this.i18n.t('security.passkeyDefault'));
      this.toast.show(this.i18n.t('security.passkeyAdded'));
      await this.load();
    } catch (e) {
      const code = errorCode(e);
      if (code !== 'passkey_cancelled') this.toast.error(this.i18n.error(code));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(id: string): Promise<void> {
    if (!confirm(this.i18n.t('security.removeConfirm'))) return;
    try {
      await this.api.deletePasskey(id);
      this.toast.show(this.i18n.t('security.passkeyRemoved'));
      await this.load();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
