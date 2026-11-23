import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { errorCode } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { EngageApi, NotificationPrefs } from '../../core/engage/engage-api';
import { PushSetup } from '../../core/engage/push-setup.service';
import { InstallService } from '../../core/pwa/install.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

type Toggle = 'dailyEnabled' | 'waterEnabled' | 'friendsEnabled' | 'updatesEnabled' | 'photoEnabled' | 'challengeEnabled';

/**
 * Notifications: this device on or off (with a test), then what is sent, each line a switch saved at
 * once: the daily reminder and its time, the water reminders, friends' nudges, the new versions.
 */
@Component({
  selector: 'app-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
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
              } @else if (!subscription() && blocked()) {
                {{ 'engage.notifications.blocked' | t }}
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
          } @else if (blocked()) {
            <!-- 1.12: a « no » by mistake. No phone lets an app ask twice: the way back is in the phone's settings, step
                 by step for this phone; coming back to the app is enough, it notices and turns them on -->
            <div class="unblock">
              <p class="small">{{ 'engage.notifications.blockedWhy' | t }}</p>
              <ol class="steps">
                @for (step of steps(); track $index) {
                  <li class="small"><span class="step-n num">{{ $index + 1 }}</span><span>{{ step }}</span></li>
                }
              </ol>
              <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="enable()">
                <app-icon name="repeat" [size]="18" /> {{ 'engage.notifications.retry' | t }}
              </button>
            </div>
          } @else {
            <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="enable()"><app-icon name="bell" /> {{ 'engage.notifications.enable' | t }}</button>
            <p class="tiny muted center">{{ 'engage.notifications.askOnce' | t }}</p>
          }
        }
        @if (devices() > 0) {
          <p class="tiny muted devices">{{ (devices() === 1 ? 'engage.notifications.devicesOne' : 'engage.notifications.devicesMany') | t: { n: devices() } }}</p>
        }
      </section>

      <!-- 1.17: every notification sent, latest first -->
      <a class="card center-link" routerLink="/app/notifications">
        <span class="list-icon"><app-icon name="inbox" /></span>
        <span class="pref-body">
          <span class="pref-title">{{ 'engage.center.title' | t }}</span>
          <span class="small muted">{{ 'engage.center.hint' | t }}</span>
        </span>
        <app-icon name="chevronRight" [size]="18" />
      </a>

      @if (prefs(); as p) {
        <h2 class="section-title">{{ 'engage.notifications.what' | t }}</h2>
        <div class="list prefs">
          <label class="pref">
            <span class="list-icon accent"><app-icon name="flame" /></span>
            <span class="pref-body">
              <span class="pref-title">{{ 'engage.notifications.daily' | t }}</span>
              <span class="small muted">{{ (p.photoEnabled ? 'engage.notifications.dailyHintWeigh' : 'engage.notifications.dailyHint') | t }}</span>
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
          <!-- 1.11: the photo of the day, at its own time, only if it is not taken yet -->
          <label class="pref">
            <span class="list-icon photo"><app-icon name="camera" /></span>
            <span class="pref-body">
              <span class="pref-title">{{ 'engage.notifications.photo' | t }}</span>
              <span class="small muted">{{ 'engage.notifications.photoHint' | t }}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" [checked]="p.photoEnabled" (change)="toggle('photoEnabled', $event)" />
          </label>
          @if (p.photoEnabled) {
            <div class="pref time-row">
              <label class="small time-label" for="n-photo">{{ 'engage.notifications.photoTime' | t }}</label>
              <span class="input-icon time">
                <input class="input" id="n-photo" type="time" step="300" [value]="p.photoTime" (change)="setPhotoTime($event)" />
                <span class="end"><app-icon name="clock" [size]="17" /></span>
              </span>
            </div>
          }
          <!-- 1.19: the weigh-in and photo reminders at the time one usually does them -->
          @if (p.dailyEnabled || p.photoEnabled) {
            <label class="pref">
              <span class="list-icon"><app-icon name="sparkles" /></span>
              <span class="pref-body">
                <span class="pref-title">{{ 'engage.notifications.smart' | t }}</span>
                <span class="small muted">{{ smartHint() }}</span>
              </span>
              <input type="checkbox" role="switch" class="switch" [checked]="!!p.smartTime" (change)="toggleSmart($event)" />
            </label>
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
          <!-- 1.17: the challenges whose day is not done yet, at their own time -->
          <label class="pref">
            <span class="list-icon accent"><app-icon name="trophy" /></span>
            <span class="pref-body">
              <span class="pref-title">{{ 'engage.notifications.challenge' | t }}</span>
              <span class="small muted">{{ 'engage.notifications.challengeHint' | t }}</span>
            </span>
            <input type="checkbox" role="switch" class="switch" [checked]="p.challengeEnabled ?? true" (change)="toggle('challengeEnabled', $event)" />
          </label>
          @if (p.challengeEnabled ?? true) {
            <div class="pref time-row">
              <label class="small time-label" for="n-challenge">{{ 'engage.notifications.challengeTime' | t }}</label>
              <span class="input-icon time">
                <input class="input" id="n-challenge" type="time" step="300" [value]="p.challengeTime ?? '20:00'" (change)="setChallengeTime($event)" />
                <span class="end"><app-icon name="clock" [size]="17" /></span>
              </span>
            </div>
          }
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
    .center-link {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      color: var(--fg);
    }
    .center-link .list-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex: none;
      border-radius: 12px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .center-link .pref-body {
      flex: 1;
      display: grid;
      gap: 1px;
      min-width: 0;
    }
    .center-link > app-icon {
      color: var(--fg-3);
    }
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
    .unblock {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-m);
      background: var(--warning-soft);
    }
    .unblock p {
      margin: 0;
    }
    .steps {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .steps li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .step-n {
      display: grid;
      place-items: center;
      flex: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--surface);
      color: var(--fg);
      font-size: 12px;
      font-weight: 750;
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
    .list-icon.photo {
      background: var(--success-soft);
      color: var(--success);
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
  private readonly setup = inject(PushSetup);
  private readonly platform = inject(InstallService).platform;
  /** refused in the system: only its settings can turn them back on */
  protected readonly blocked = computed(() => this.setup.permission() === 'denied');
  /** the way to the switch, on this kind of phone */
  protected readonly steps = computed(() => {
    const p = this.platform();
    const key = p === 'ios' ? 'ios' : p === 'android' ? 'android' : 'desktop';
    return [1, 2, 3].map((n) => this.i18n.t(`engage.notifications.unblock.${key}${n}`));
  });
  protected readonly prefs = signal<NotificationPrefs | null>(null);
  protected readonly devices = signal(0);
  protected readonly busy = signal(false);
  /** water reminders need the glasses of water on */
  protected readonly waterOn = computed(() => !!this.session.account()?.waterGoal);
  private publicKey = '';
  private saving: Promise<unknown> = Promise.resolve();

  constructor() {
    // back from the phone's settings: allowed there, they turn on here with no more taps (no prompt any more once allowed)
    const doc = inject(DOCUMENT);
    const back = () => {
      if (doc.visibilityState !== 'visible') return;
      const was = this.setup.permission();
      this.setup.refresh();
      if (was === 'denied' && this.setup.permission() === 'granted' && !this.subscription() && this.publicKey) void this.enable();
    };
    doc.addEventListener('visibilitychange', back);
    inject(DestroyRef).onDestroy(() => doc.removeEventListener('visibilitychange', back));
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
      this.setup.refresh();
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

  protected setPhotoTime(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    if (/^\d{2}:\d{2}$/.test(value)) this.save({ photoTime: value });
  }

  protected setChallengeTime(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    if (/^\d{2}:\d{2}$/.test(value)) this.save({ challengeTime: value });
  }

  /** 1.19: what the usual times say: off, on with the times worked out, or on with not enough days yet */
  protected readonly smartHint = computed(() => {
    const p = this.prefs();
    if (!p?.smartTime) return this.i18n.t('engage.notifications.smartHint');
    const parts: string[] = [];
    if (p.dailyEnabled && p.smartDailyTime) parts.push(this.i18n.t('engage.notifications.smartWeigh', { time: p.smartDailyTime }));
    if (p.photoEnabled && p.smartPhotoTime) parts.push(this.i18n.t('engage.notifications.smartPhoto', { time: p.smartPhotoTime }));
    return parts.length ? parts.join(' · ') : this.i18n.t('engage.notifications.smartWaiting');
  });

  protected toggleSmart(e: Event): void {
    this.save({ smartTime: (e.target as HTMLInputElement).checked });
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
        // 1.19: the usual times the server just worked out
        this.prefs.update((p) => (p ? { ...p, smartDailyTime: s.prefs.smartDailyTime, smartPhotoTime: s.prefs.smartPhotoTime } : p));
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
