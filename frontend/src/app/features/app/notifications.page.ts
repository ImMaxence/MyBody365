import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { errorCode } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { EngageApi, NotificationPrefs } from '../../core/engage/engage-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

type Toggle = 'dailyEnabled' | 'waterEnabled' | 'friendsEnabled' | 'updatesEnabled' | 'weeklyEnabled';

/**
 * Notifications: this device on or off (with a test), then what is sent, each line a switch saved at
 * once: the daily reminder and its time, the water reminders, friends' nudges, the new versions.
 */
@Component({
  selector: 'app-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'engage.notifications.title' | t }}</h1>
      </header>

      <section class="card device">
        <div class="device-top">
          <span class="ico" [class.on]="subscription()"><app-icon name="bell" /></span>
          <div class="device-copy">
            <h2 class="h3">{{ 'engage.notifications.device' | t }}</h2>
            <p class="small muted">
              @if (!push.isEnabled) {
                {{ 'engage.notifications.unsupported' | t }}
              } @else {
                {{ (subscription() ? 'engage.notifications.on' : 'engage.notifications.off') | t }}
              }
            </p>
          </div>
        </div>
        @if (push.isEnabled) {
          @if (subscription()) {
            <div class="device-actions">
              <button type="button" class="btn btn-secondary btn-block" [disabled]="busy()" (click)="test()">
                <app-icon name="send" [size]="18" /> {{ 'engage.notifications.test' | t }}
              </button>
              <button type="button" class="btn btn-ghost btn-s btn-block off" [disabled]="busy()" (click)="disable()">
                {{ 'engage.notifications.disable' | t }}
              </button>
            </div>
          } @else {
            <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="enable()"><app-icon name="bell" /> {{ 'engage.notifications.enable' | t }}</button>
          }
        }
        @if (devices() > 0) {
          <p class="tiny muted devices">{{ (devices() === 1 ? 'engage.notifications.devicesOne' : 'engage.notifications.devicesMany') | t: { n: devices() } }}</p>
        }
      </section>

      @if (prefs(); as p) {
        <h2 class="section-title">{{ 'engage.notifications.what' | t }}</h2>
        <div class="list prefs">
          <label class="pref">
            <span class="list-icon accent"><app-icon name="flame" /></span>
            <span class="pref-body">
              <span class="pref-title">{{ 'engage.notifications.daily' | t }}</span>
              <span class="small muted">{{ 'engage.notifications.dailyHint' | t }}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" [checked]="p.dailyEnabled" (change)="toggle('dailyEnabled', $event)" />
          </label>
          @if (p.dailyEnabled) {
            <div class="pref time-row">
              <label class="small time-label" for="n-daily">{{ 'engage.notifications.dailyTime' | t }}</label>
              <span class="input-icon time">
                <input class="input" id="n-daily" type="time" step="300" [value]="p.dailyTime" (change)="setTime($event)" />
                <span class="end"><app-icon name="clock" [size]="17" /></span>
              </span>
            </div>
          }
          <label class="pref" [class.off]="!waterOn()">
            <span class="list-icon cool"><app-icon name="droplet" /></span>
            <span class="pref-body">
              <span class="pref-title">{{ 'engage.notifications.water' | t }}</span>
              <span class="small muted">{{ (waterOn() ? 'engage.notifications.waterHint' : 'engage.notifications.waterOff') | t }}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" [disabled]="!waterOn()" [checked]="waterOn() && p.waterEnabled" (change)="toggle('waterEnabled', $event)" />
          </label>
          <label class="pref">
            <span class="list-icon"><app-icon name="users" /></span>
            <span class="pref-body">
              <span class="pref-title">{{ 'engage.notifications.friends' | t }}</span>
              <span class="small muted">{{ 'engage.notifications.friendsHint' | t }}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" [checked]="p.friendsEnabled" (change)="toggle('friendsEnabled', $event)" />
          </label>
          <label class="pref">
            <span class="list-icon"><app-icon name="calendar" /></span>
            <span class="pref-body">
              <span class="pref-title">{{ 'engage.notifications.weekly' | t }}</span>
              <span class="small muted">{{ 'engage.notifications.weeklyHint' | t }}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" [checked]="p.weeklyEnabled" (change)="toggle('weeklyEnabled', $event)" />
          </label>
          <label class="pref">
            <span class="list-icon"><app-icon name="sparkles" /></span>
            <span class="pref-body">
              <span class="pref-title">{{ 'engage.notifications.updates' | t }}</span>
              <span class="small muted">{{ 'engage.notifications.updatesHint' | t }}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" [checked]="p.updatesEnabled" (change)="toggle('updatesEnabled', $event)" />
          </label>
        </div>
        <p class="tiny muted center">{{ 'engage.notifications.auto' | t }}</p>
      } @else {
        <div class="skeleton" style="height: 280px; border-radius: 24px"></div>
      }
    </main>
  `,
  styles: `
    .device {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4);
    }
    .device-top {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .ico {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      flex: none;
      border-radius: 16px;
      background: var(--surface-3);
      color: var(--fg-2);
      transition: background-color var(--dur-3), color var(--dur-3);
    }
    .ico.on {
      background: var(--accent-soft);
      color: var(--accent-text);
      animation: ring 900ms var(--ease-out);
    }
    @keyframes ring {
      20%,
      60% {
        transform: rotate(-12deg);
      }
      40%,
      80% {
        transform: rotate(12deg);
      }
    }
    .device-copy {
      min-width: 0;
    }
    .device-actions {
      display: grid;
      gap: var(--space-1);
    }
    /* long labels wrap instead of pushing the page sideways */
    .device .btn {
      white-space: normal;
      text-align: center;
    }
    .btn.off {
      color: var(--danger);
    }
    .devices {
      text-align: center;
    }
    .center {
      text-align: center;
    }
    .pref {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 64px;
      padding: 12px 16px;
      cursor: pointer;
    }
    /* the time of the reminder belongs to the reminder above it: no line between them */
    .pref + .pref:not(.time-row) {
      border-top: 1px solid var(--line);
    }
    .pref.off {
      cursor: default;
    }
    .pref-body {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    .pref-title {
      font-weight: 600;
    }
    .list-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex: none;
      border-radius: 12px;
      background: var(--surface-3);
      color: var(--fg);
    }
    .list-icon.accent {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .list-icon.cool {
      background: var(--cool-soft);
      color: var(--cool);
    }
    /* the time of the reminder, right under its switch */
    .pref.time-row {
      min-height: 0;
      padding-top: 2px;
      padding-bottom: 16px;
      padding-left: 68px;
      cursor: default;
      animation: open 280ms var(--ease-out) both;
    }
    .time-label {
      flex: 1;
      min-width: 0;
      color: var(--fg-2);
      font-weight: 600;
    }
    .input-icon.time {
      flex: none;
      width: 148px;
    }
    .time .input {
      min-height: 44px;
      padding: 10px 40px 10px 14px;
      font-variant-numeric: tabular-nums;
    }
    .time .end {
      right: 13px;
    }
    /* an on / off switch (settings): a checkbox drawn as a track and a knob */
    .switch {
      -webkit-appearance: none;
      appearance: none;
      position: relative;
      flex: none;
      width: 51px;
      height: 31px;
      margin: 0;
      border-radius: var(--radius-pill);
      background: var(--surface-3);
      box-shadow: inset 0 0 0 1px var(--line-strong);
      cursor: pointer;
      transition:
        background-color 220ms var(--ease-out),
        box-shadow 220ms var(--ease-out);
    }
    .switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 27px;
      height: 27px;
      border-radius: 50%;
      background: #fff;
      box-shadow:
        0 3px 8px rgba(0, 0, 0, 0.18),
        0 1px 1px rgba(0, 0, 0, 0.12);
      transition: transform 320ms cubic-bezier(0.34, 1.4, 0.5, 1);
    }
    .switch:checked {
      background: var(--flame-deep) border-box;
      box-shadow: none;
    }
    .switch:checked::after {
      transform: translateX(20px);
    }
    .switch:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .switch:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
    @media (prefers-reduced-motion: reduce) {
      .switch::after {
        transition: none;
      }
    }
    @keyframes open {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }
  `,
})
export class NotificationsPage {
  protected readonly push = inject(SwPush);
  private readonly api = inject(EngageApi);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);

  protected readonly subscription = toSignal(this.push.subscription, { initialValue: null });
  protected readonly prefs = signal<NotificationPrefs | null>(null);
  protected readonly devices = signal(0);
  protected readonly busy = signal(false);
  /** water reminders need the glasses of water on */
  protected readonly waterOn = computed(() => !!this.session.account()?.waterGoal);
  private publicKey = '';
  private saving: Promise<unknown> = Promise.resolve();

  constructor() {
    void this.api
      .notifications()
      .then((s) => {
        this.publicKey = s.publicKey;
        this.devices.set(s.devices);
        this.prefs.set({ ...s.prefs });
      })
      .catch(() => undefined);
  }

  protected async enable(): Promise<void> {
    this.busy.set(true);
    try {
      const sub = await this.push.requestSubscription({ serverPublicKey: this.publicKey });
      const s = await this.api.subscribe(sub.toJSON());
      this.devices.set(s.devices);
      this.toast.show(this.i18n.t('engage.notifications.enabled'));
    } catch (e) {
      const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
      this.toast.error(this.i18n.error(denied ? 'push_denied' : errorCode(e) === 'generic' ? 'push_unsupported' : errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async disable(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    this.busy.set(true);
    try {
      const s = await this.api.unsubscribe(sub.endpoint);
      await this.push.unsubscribe().catch(() => undefined);
      this.devices.set(s.devices);
      this.toast.show(this.i18n.t('engage.notifications.disabled'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async test(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.api.test();
      this.toast.show(this.i18n.t(r.sent > 0 ? 'engage.notifications.testSent' : 'engage.notifications.testNone'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected toggle(key: Toggle, e: Event): void {
    this.save({ [key]: (e.target as HTMLInputElement).checked });
  }

  protected setTime(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    if (/^\d{2}:\d{2}$/.test(value)) this.save({ dailyTime: value });
  }

  /** shown at once, saved in order; a failure puts the screen back as the server has it */
  private save(change: Partial<NotificationPrefs>): void {
    const current = this.prefs();
    if (!current) return;
    const next = { ...current, ...change };
    this.prefs.set(next);
    this.saving = this.saving.then(async () => {
      try {
        const s = await this.api.savePrefs(next);
        this.toast.show(this.i18n.t('engage.notifications.saved'));
        return s;
      } catch (e) {
        this.toast.error(this.i18n.error(errorCode(e)));
        const s = await this.api.notifications().catch(() => null);
        if (s) this.prefs.set({ ...s.prefs });
        return null;
      }
    });
  }
}
