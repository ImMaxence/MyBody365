import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from '../api/api.service';
import type { Account, Me, Providers } from '../api/models';
import { I18nService } from '../i18n/i18n.service';

const ANONYMOUS: Me = { authenticated: false };

/** The current session, resolved once on start and refreshed after sign-in / sign-out. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly me = signal<Me | null>(null);
  readonly account = computed<Account | null>(() => this.me()?.account ?? null);
  readonly signedIn = computed(() => this.me()?.authenticated === true);
  readonly isAdmin = computed(() => this.account()?.admin === true);
  readonly providers = signal<Providers>({ google: true, passkey: true, devLogin: false });

  private pending: Promise<Me> | null = null;

  load(): Promise<Me> {
    if (!this.browser) return Promise.resolve(ANONYMOUS);
    const cached = this.me();
    if (cached) return Promise.resolve(cached);
    this.pending ??= this.api
      .me()
      .catch(() => ANONYMOUS)
      .then((me) => {
        this.setMe(me);
        this.pending = null;
        return me;
      });
    return this.pending;
  }

  refresh(): Promise<Me> {
    this.me.set(null);
    this.pending = null;
    return this.load();
  }

  async loadProviders(): Promise<void> {
    try {
      this.providers.set(await this.api.providers());
    } catch {
      /* keep the defaults */
    }
  }

  setAccount(account: Account): void {
    this.setMe({ authenticated: true, account });
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } finally {
      this.me.set(ANONYMOUS);
    }
  }

  clear(): void {
    this.me.set(ANONYMOUS);
  }

  private setMe(me: Me): void {
    this.me.set(me);
    // the account language wins over the device, unless a choice was made on this device
    const locale = me.account?.locale;
    if (locale) {
      try {
        if (!localStorage.getItem('mb.lang')) this.i18n.set(locale);
      } catch {
        this.i18n.set(locale);
      }
    }
  }
}
