import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from '../api/api.service';
import type { Account, Me, Providers } from '../api/models';
import { I18nService } from '../i18n/i18n.service';
import { Outbox } from '../offline/outbox';
import { PhotoQueue } from '../offline/photo-queue';

const ANONYMOUS: Me = { authenticated: false };

/** The current session, resolved once on start and refreshed after sign-in / sign-out. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  private readonly outbox = inject(Outbox);
  private readonly photoQueue = inject(PhotoQueue);
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
    // the entries noted offline by this account go; another account's never do
    if (me.account?.id) {
      this.outbox.setOwner(me.account.id);
      // 1.17: and the photos taken without network
      void this.photoQueue.setOwner(me.account.id);
    }
    // the language chosen by the account wins over the device, unless a choice was made on this device
    const locale = me.account?.locale;
    if (locale) {
      if (!this.i18n.chosen()) this.i18n.set(locale);
    } else if (me.account) {
      // 1.14: none chosen yet: the app speaks the device's, and the server gets it for the notifications (once per change)
      const lang = this.i18n.lang();
      try {
        if (localStorage.getItem('mb.lang.device') !== lang) {
          void this.api
            .updateMe({ deviceLocale: lang })
            .then(() => localStorage.setItem('mb.lang.device', lang))
            .catch(() => undefined);
        }
      } catch {
        /* storage blocked: told next time */
      }
    }
  }
}
