import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PushSetup } from '../core/engage/push-setup.service';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { ToastService } from '../core/ui/toast.service';
import { IconComponent } from './icon.component';

const LATER = 'mb-push-later';

/**
 * The big "turn the notifications on" card, as long as they are off on this device: on the Profile
 * always, on Today until "later" (back three days after). Blocked in the system settings: how to unblock.
 */
@Component({
  selector: 'app-push-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent],
  template: `
    @if (visible()) {
      <section class="push" [class.blocked]="push.permission() === 'denied'" aria-labelledby="push-title">
        <span class="bell" aria-hidden="true"><app-icon name="bell" [size]="26" [stroke]="2.2" /></span>
        <div class="copy">
          <h2 id="push-title">{{ 'engage.push.title' | t }}</h2>
          <p>{{ (push.permission() === 'denied' ? 'engage.push.blocked' : 'engage.push.text') | t }}</p>
        </div>
        @if (push.permission() === 'denied') {
          <a routerLink="/app/account/notifications" class="btn btn-light btn-block">{{ 'engage.push.help' | t }}</a>
        } @else {
          <button type="button" class="btn btn-light btn-block" [disabled]="busy()" (click)="enable()">
            <app-icon name="bell" [size]="18" /> {{ 'engage.push.cta' | t }}
          </button>
        }
        @if (dismissable()) {
          <button type="button" class="later" (click)="later()">{{ 'engage.push.later' | t }}</button>
        }
      </section>
    }
  `,
  styles: `
    .push {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-3) var(--space-4);
      align-items: center;
      padding: var(--space-5);
      border-radius: var(--radius-l);
      background: var(--flame);
      color: var(--accent-ink);
      box-shadow: 0 22px 44px -22px var(--accent-glow);
      overflow: hidden;
      animation: push-in 520ms var(--ease-out) both;
    }
    .push.blocked {
      background: var(--surface);
      color: var(--fg);
      border: 1.5px solid var(--warning);
      box-shadow: none;
    }
    .push::after {
      content: '';
      position: absolute;
      right: -40px;
      top: -40px;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.18);
      pointer-events: none;
    }
    .bell {
      display: grid;
      place-items: center;
      width: 54px;
      height: 54px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.3);
      animation: ring 2.6s var(--ease-out) infinite;
      transform-origin: 50% 20%;
    }
    .blocked .bell {
      background: var(--warning-soft);
      color: var(--warning);
      animation: none;
    }
    @keyframes ring {
      0%, 70%, 100% {
        transform: rotate(0);
      }
      75% {
        transform: rotate(14deg);
      }
      80% {
        transform: rotate(-12deg);
      }
      85% {
        transform: rotate(8deg);
      }
      90% {
        transform: rotate(-4deg);
      }
    }
    @keyframes push-in {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.98);
      }
    }
    h2 {
      font-size: 1.15rem;
      font-weight: 800;
      line-height: 1.2;
    }
    .copy p {
      margin-top: 4px;
      font-size: var(--fs-s);
      line-height: 1.45;
      opacity: 0.92;
    }
    .btn {
      grid-column: 1 / -1;
      position: relative;
      z-index: 1;
    }
    .btn-light {
      background: #fff;
      color: #1c0b03;
      font-weight: 750;
      min-height: 50px;
    }
    .blocked .btn-light {
      background: var(--surface-3);
      color: var(--fg);
    }
    .later {
      grid-column: 1 / -1;
      justify-self: center;
      min-height: 36px;
      padding: 0 12px;
      font-size: var(--fs-s);
      font-weight: 650;
      opacity: 0.85;
    }
    @media (prefers-reduced-motion: reduce) {
      .push,
      .bell {
        animation: none;
      }
    }
  `,
})
export class PushPromptComponent {
  /** Today offers "later"; the Profile does not */
  readonly dismissable = input(false);
  protected readonly push = inject(PushSetup);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly busy = signal(false);
  private readonly postponed = signal(this.readLater());
  protected readonly visible = computed(
    () => this.push.supported && !this.push.enabled() && !(this.dismissable() && this.postponed()),
  );

  protected async enable(): Promise<void> {
    this.busy.set(true);
    const r = await this.push.enable();
    this.busy.set(false);
    if (r === 'on') this.toast.show(this.i18n.t('engage.notifications.enabled'));
    else this.toast.error(this.i18n.error(r === 'denied' ? 'push_denied' : 'push_unsupported'));
  }

  protected later(): void {
    try {
      localStorage.setItem(LATER, String(Date.now() + 3 * 86_400_000));
    } catch {
      /* not kept: shown again next time */
    }
    this.postponed.set(true);
  }

  private readLater(): boolean {
    try {
      return Number(localStorage.getItem(LATER) ?? 0) > Date.now();
    } catch {
      return false;
    }
  }
}
