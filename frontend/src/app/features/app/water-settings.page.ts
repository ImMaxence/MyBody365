import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { defaultWaterGoal } from './water-card.component';

/** The glasses of water: on or off, the goal of the day, the reminders. */
@Component({
  selector: 'app-water-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'water.title' | t }}</h1>
      </header>
      <p class="small muted">{{ 'water.pageText' | t }}</p>

      <label class="check card toggle">
        <input type="checkbox" name="water" [checked]="!!account()?.waterGoal" [disabled]="busy()" (change)="toggle($any($event.target).checked)" />
        <span><b>{{ 'water.toggle' | t }}</b><span class="small muted">{{ 'water.toggleHint' | t }}</span></span>
      </label>

      @if (account()?.waterGoal; as g) {
        <div class="goal card">
          <span class="small"><b>{{ 'water.goal' | t }}</b><br /><span class="muted">{{ 'water.goalValue' | t: { n: g, l: i18n.number(g * 0.25, 2) } }}</span></span>
          <div class="mini-stepper">
            <button type="button" class="icon-btn" [disabled]="g <= 1 || busy()" [attr.aria-label]="'water.goalLess' | t" (click)="setGoal(g - 1)"><app-icon name="minus" [size]="18" /></button>
            <span class="num">{{ g }}</span>
            <button type="button" class="icon-btn" [disabled]="g >= 30 || busy()" [attr.aria-label]="'water.goalMore' | t" (click)="setGoal(g + 1)"><app-icon name="plus" [size]="18" /></button>
          </div>
        </div>
        <p class="tiny muted">{{ 'water.goalHint' | t }}</p>

        <div class="list">
          <a routerLink="/app/account/notifications" class="list-item">
            <span class="list-icon"><app-icon name="bell" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'water.reminders' | t }}</span>
              <span class="list-sub">{{ 'water.remindersSub' | t }}</span>
            </span>
            <app-icon name="chevronRight" />
          </a>
        </div>
      }
    </main>
  `,
  styles: `
    .toggle {
      padding: var(--space-3) var(--space-4);
    }
    .goal {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }
    .mini-stepper {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 1.2rem;
      font-weight: 750;
    }
    .mini-stepper .num {
      min-width: 2ch;
      text-align: center;
    }
  `,
})
export class WaterSettingsPage {
  private readonly session = inject(SessionStore);
  private readonly tracking = inject(TrackingStore);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly account = this.session.account;
  protected readonly busy = signal(false);

  constructor() {
    if (!this.tracking.summary()) void this.tracking.load();
  }

  /** on: a goal from the weight (about 33 ml per kg, 6 to 12 glasses); off: no goal */
  protected toggle(on: boolean): Promise<void> {
    const s = this.tracking.summary();
    return this.save(on ? defaultWaterGoal(s?.current?.weightKg ?? s?.profile.startWeightKg) : 0);
  }

  protected setGoal(n: number): Promise<void> {
    return this.save(n);
  }

  private async save(waterGoal: number): Promise<void> {
    this.busy.set(true);
    try {
      this.session.setAccount(await this.api.updateMe({ waterGoal }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
