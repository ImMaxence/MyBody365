import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { EngageApi } from './engage-api';

/** Notifications on this device: whether they are on, and turning them on in one tap. */
@Injectable({ providedIn: 'root' })
export class PushSetup {
  private readonly push = inject(SwPush);
  private readonly api = inject(EngageApi);
  /** the browser can receive them (the installed app; a phone browser without the app often cannot) */
  readonly supported = this.push.isEnabled;
  readonly subscription = toSignal(this.push.subscription, { initialValue: null });
  readonly enabled = computed(() => !!this.subscription());
  readonly permission = signal<NotificationPermission | 'unsupported'>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  constructor() {
    // 1.12: allowed again in the phone's settings, the app sees it as soon as it comes back
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.refresh());
  }

  /** asks the system, then registers the device; the outcome as a word */
  async enable(): Promise<'on' | 'denied' | 'error'> {
    try {
      const { publicKey } = await this.api.notifications();
      const sub = await this.push.requestSubscription({ serverPublicKey: publicKey });
      await this.api.subscribe(sub.toJSON());
      this.refresh();
      return 'on';
    } catch {
      this.refresh();
      return this.permission() === 'denied' ? 'denied' : 'error';
    }
  }

  refresh(): void {
    if (typeof Notification !== 'undefined') this.permission.set(Notification.permission);
  }
}
