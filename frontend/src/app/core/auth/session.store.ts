import { Injectable, Injector, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ApiService } from '../api/api.service';
import type { Account, Me, Providers } from '../api/models';
import { I18nService } from '../i18n/i18n.service';
import { Outbox } from '../offline/outbox';
import { PhotoQueue } from '../offline/photo-queue';
import { Network } from '../offline/network';
import { OfflineCache, unreachable } from '../offline/offline-cache';

const ANONYMOUS: Me = { authenticated: false };

/**
 * 1.18: the account signed in on this phone, kept for the starts without network: the app opens on its screens (with what
 * they showed last time, core/offline/offline-cache.ts) instead of the sign-in screen. The session itself stays on the
 * server (a cookie): this copy opens nothing there. Forgotten at sign-out.
 */
const KEPT_ME = 'mb.me';

function readKept(): Me | null {
  try {
    const me = JSON.parse(localStorage.getItem(KEPT_ME) ?? 'null') as Me | null;
    return me?.authenticated && me.account?.id ? me : null;
  } catch {
    return null;
  }
}

function writeKept(me: Me | null): void {
  try {
    if (me?.authenticated && me.account) localStorage.setItem(KEPT_ME, JSON.stringify(me));
    else localStorage.removeItem(KEPT_ME);
  } catch {
    /* storage blocked: the next start without network shows the sign-in screen */
  }
}

/** The current session, resolved once on start and refreshed after sign-in / sign-out. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  private readonly outbox = inject(Outbox);
  private readonly photoQueue = inject(PhotoQueue);
  private readonly cache = inject(OfflineCache);
  private readonly network = inject(Network);
  private readonly injector = inject(Injector);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** 1.18: the account comes from the phone (started without network): the server is asked again once it is back */
  private fromPhone = false;

  readonly me = signal<Me | null>(null);
  readonly account = computed<Account | null>(() => this.me()?.account ?? null);
  readonly signedIn = computed(() => this.me()?.authenticated === true);
  readonly isAdmin = computed(() => this.account()?.admin === true);
  readonly providers = signal<Providers>({ google: true, passkey: true, devLogin: false });

  private pending: Promise<Me> | null = null;

  constructor() {
    if (this.browser) this.network.back.subscribe(() => void this.recheck());
  }

  load(): Promise<Me> {
    if (!this.browser) return Promise.resolve(ANONYMOUS);
    const cached = this.me();
    if (cached) return Promise.resolve(cached);
    this.pending ??= this.api
      .me()
      .then((me) => {
        this.fromPhone = false;
        return me;
      })
      .catch((e: unknown) => {
        // 1.18: no network (or the server restarting): the account last signed in on this phone, if any
        const kept = unreachable(e) ? readKept() : null;
        this.fromPhone = !!kept;
        return kept ?? ANONYMOUS;
      })
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

  /** 1.18: needs the network (the session ends on the server): without it, the error is thrown and nothing changes */
  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } catch (e) {
      if (unreachable(e)) throw e;
    }
    this.clear();
  }

  clear(): void {
    this.me.set(ANONYMOUS);
    this.fromPhone = false;
    writeKept(null);
  }

  /**
   * 1.18: the network is back after a start without it: the server says whether the session is still open (the account
   * as it is now), or sends to the sign-in screen (what was noted offline waits there for the same account)
   */
  private async recheck(): Promise<void> {
    if (!this.fromPhone) return;
    try {
      const me = await this.api.me();
      this.fromPhone = false;
      if (me.authenticated) {
        this.setMe(me);
        return;
      }
      this.me.set(ANONYMOUS);
      writeKept(null);
      await this.injector.get(Router).navigateByUrl('/app/login');
    } catch {
      /* not back for real: asked again at the next return */
    }
  }

  private setMe(me: Me): void {
    this.me.set(me);
    if (this.browser) {
      writeKept(me.authenticated ? me : null);
      this.cache.setOwner(me.account?.id);
    }
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
