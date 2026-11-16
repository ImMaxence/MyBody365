import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { SwPush } from '@angular/service-worker';
import { errorCode } from '../../core/api/api.service';
import { EngageApi, NotificationPrefs } from '../../core/engage/engage-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

/** Notifications: this device on or off, the daily and gym reminders, friends' nudges. */
@Component({
  selector: 'app-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'engage.notifications.title' | t }}</h1>
      </header>

      <section class="card device">
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
      </section>
      @if (push.isEnabled) {
        @if (subscription()) {
          <div class="row">
            <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="test()"><app-icon name="send" [size]="18" /> {{ 'engage.notifications.test' | t }}</button>
            <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="disable()">{{ 'engage.notifications.disable' | t }}</button>
          </div>
        } @else {
          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="enable()"><app-icon name="bell" /> {{ 'engage.notifications.enable' | t }}</button>
        }
      }
      @if (devices() > 0) {
        <p class="tiny muted center">{{ 'engage.notifications.devices' | t: { n: devices() } }}</p>
      }

      @if (prefs(); as p) {
        <form class="stack" (ngSubmit)="save()">
          <section class="card block">
            <label class="check">
              <input type="checkbox" name="daily" [(ngModel)]="p.dailyEnabled" />
              <span><b>{{ 'engage.notifications.daily' | t }}</b><span class="small muted">{{ 'engage.notifications.dailyHint' | t }}</span></span>
            </label>
            @if (p.dailyEnabled) {
              <div class="field">
                <label class="label" for="n-daily">{{ 'engage.notifications.dailyTime' | t }}</label>
                <input class="input" id="n-daily" name="dailyTime" type="time" step="300" [(ngModel)]="p.dailyTime" />
              </div>
            }
          </section>

          <section class="card block">
            <label class="check">
              <input type="checkbox" name="gym" [(ngModel)]="p.gymEnabled" />
              <span><b>{{ 'engage.notifications.gym' | t }}</b><span class="small muted">{{ 'engage.notifications.gymHint' | t }}</span></span>
            </label>
            @if (p.gymEnabled) {
              <span class="label">{{ 'engage.notifications.gymDays' | t }}</span>
              <div class="days" role="group" [attr.aria-label]="'engage.notifications.gymDays' | t">
                @for (d of weekdays(); track $index; let i = $index) {
                  <button type="button" class="day" [class.on]="hasDay(p, i + 1)" [attr.aria-pressed]="hasDay(p, i + 1)" [attr.aria-label]="weekdayNames()[i]" (click)="toggleDay(p, i + 1)">
                    {{ d }}
                  </button>
                }
              </div>
              <div class="field">
                <label class="label" for="n-gym">{{ 'engage.notifications.gymTime' | t }}</label>
                <input class="input" id="n-gym" name="gymTime" type="time" step="300" [(ngModel)]="p.gymTime" />
              </div>
            }
          </section>

          <section class="card block">
            <label class="check">
              <input type="checkbox" name="friends" [(ngModel)]="p.friendsEnabled" />
              <span><b>{{ 'engage.notifications.friends' | t }}</b><span class="small muted">{{ 'engage.notifications.friendsHint' | t }}</span></span>
            </label>
          </section>

          <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()"><app-icon name="check" /> {{ 'engage.notifications.save' | t }}</button>
        </form>
      }
    </main>
  `,
  styles: `
    .device {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4);
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
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-3);
    }
    .center {
      text-align: center;
    }
    .block {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .check > span {
      display: grid;
      gap: 2px;
    }
    .days {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
    }
    .day {
      aspect-ratio: 1;
      border-radius: 12px;
      background: var(--surface-3);
      color: var(--fg-2);
      font-weight: 750;
      transition: background-color var(--dur-2), color var(--dur-2), transform var(--dur-2) var(--ease-out);
    }
    .day:active {
      transform: scale(0.92);
    }
    .day.on {
      background: var(--accent);
      color: var(--accent-ink);
    }
  `,
})
export class NotificationsPage {
  protected readonly push = inject(SwPush);
  private readonly api = inject(EngageApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);

  protected readonly subscription = toSignal(this.push.subscription, { initialValue: null });
  protected readonly prefs = signal<NotificationPrefs | null>(null);
  protected readonly devices = signal(0);
  protected readonly busy = signal(false);
  protected readonly weekdays = () => this.i18n.get<string[]>('engage.notifications.weekdays') ?? [];
  protected readonly weekdayNames = () => this.i18n.get<string[]>('engage.notifications.weekdayNames') ?? [];
  private publicKey = '';

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

  protected hasDay(p: NotificationPrefs, d: number): boolean {
    return p.gymDays.split(',').includes(String(d));
  }

  protected toggleDay(p: NotificationPrefs, d: number): void {
    const days = new Set(p.gymDays.split(',').filter(Boolean).map(Number));
    if (days.has(d)) days.delete(d);
    else days.add(d);
    this.prefs.set({ ...p, gymDays: [...days].sort().join(',') });
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

  protected async save(): Promise<void> {
    const p = this.prefs();
    if (!p) return;
    this.busy.set(true);
    try {
      const s = await this.api.savePrefs(p);
      this.prefs.set({ ...s.prefs });
      this.toast.show(this.i18n.t('engage.notifications.saved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
