import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarImgComponent } from '../../shared/avatar-img.component';
import { defaultWaterGoal } from './water-row.component';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Friend, FriendsApi } from '../../core/friends/friends-api';
import { MealsStore } from '../../core/meals/meals.store';
import { PhotosStore } from '../../core/photos/photos.store';
import { TrackingStore, localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';
import { WeighSheetComponent } from './weigh-sheet.component';
import { WaterRowComponent } from './water-row.component';
import { PushPromptComponent } from '../../shared/push-prompt.component';
import { STREAK_COLORS, STREAK_ICONS, streakEmoji, streakTint } from '../../core/engage/streak-style';

/** the water invitation, once hidden on this device */
const WATER_INVITE_KEY = 'mb.waterInviteHidden';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* storage blocked: hidden for this visit only */
  }
}

/** "Today": the streak, the day's to-do (the weigh-in validates the day) and the goal. */
@Component({
  selector: 'app-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarImgComponent, PushPromptComponent, WaterRowComponent, RouterLink, TranslatePipe, IconComponent, WeighSheetComponent],
  template: `
    <main class="page">
      <header class="head">
        <div>
          <p class="eyebrow">{{ todayLabel() }}</p>
          <h1 class="display hello">{{ greeting() }}</h1>
        </div>
        <a routerLink="/app/account" class="avatar" [attr.aria-label]="'nav.profile' | t">
          <app-avatar-img [src]="account()?.avatarUrl" [name]="account()?.displayName" />
        </a>
      </header>

      @if (session.isAdmin() && pending() > 0) {
        <a routerLink="/app/admin/requests" class="admin-cta">
          <app-icon name="shield" [size]="18" />
          <span>{{ 'today.adminCta' | t }}</span>
          <span class="count-badge">{{ pending() }}</span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      }

      <!-- the whole card opens the calendar of the flame (the button is there for the keyboard and screen readers) -->
      <section class="streak" [class.lit]="streakDays() > 0" [attr.aria-label]="'today.streak' | t" (click)="flameDialog.open || flameDialog.showModal()"
        [style.--st-from]="tint()['--st-from']" [style.--st-to]="tint()['--st-to']" [style.--st-glow]="tint()['--st-glow']">
        <div class="flame"><span class="flame-emoji" aria-hidden="true">{{ emoji() }}</span></div>
        <div class="streak-copy">
          <span class="label">{{ 'today.streak' | t }}</span>
          <span class="big num">{{ streakDays() }} <small>{{ 'today.streakDays' | t }}</small></span>
        </div>
        <button type="button" class="icon-btn flame-more" [attr.aria-label]="'engage.flame.open' | t">
          @if (freezes() > 0) {
            <span class="freeze-chip num"><app-icon name="snowflake" [size]="14" [stroke]="2.4" /> {{ freezes() }}</span>
          }
          <app-icon name="chevronRight" />
        </button>
        <div class="week" aria-hidden="true">
          @for (d of week(); track d.day; let i = $index) {
            <span class="day" [class.done]="d.done" [class.frozen]="d.frozen" [class.now]="d.today" [style.--i]="i">
              <i>
                @if (d.done) {
                  <app-icon name="check" [size]="12" [stroke]="3" />
                } @else if (d.frozen) {
                  <app-icon name="snowflake" [size]="13" [stroke]="2.2" />
                }
              </i>
              {{ d.label }}
            </span>
          }
        </div>
        <p class="small hint">{{ streakMessage() | t }}</p>
      </section>

      <!-- the streak's look: an icon and a colour, saved at once -->
      <dialog class="sheet" #styleDialog [attr.aria-label]="'engage.streakStyle.title' | t">
        <div class="sheet-grip"></div>
        <div class="stack style-sheet" [style.--st-from]="tint()['--st-from']" [style.--st-to]="tint()['--st-to']" [style.--st-glow]="tint()['--st-glow']">
          <div class="flame-head">
            <span class="flame-big"><span class="flame-emoji small" aria-hidden="true">{{ emoji() }}</span></span>
            <div>
              <h2 class="h3">{{ 'engage.streakStyle.title' | t }}</h2>
              <p class="small muted">{{ 'engage.streakStyle.sub' | t }}</p>
            </div>
          </div>
          <span class="label" id="st-icons">{{ 'engage.streakStyle.icon' | t }}</span>
          <div class="icon-grid" role="group" aria-labelledby="st-icons">
            @for (i of icons; track i.key) {
              <button type="button" class="icon-choice" [attr.aria-pressed]="iconKey() === i.key" [attr.aria-label]="'engage.streakStyle.icons.' + i.key | t"
                (click)="setStyle({ streakIcon: i.key })">
                <span aria-hidden="true">{{ i.emoji }}</span>
              </button>
            }
          </div>
          <span class="label" id="st-colors">{{ 'engage.streakStyle.color' | t }}</span>
          <div class="color-grid" role="group" aria-labelledby="st-colors">
            @for (c of colors; track c.key) {
              <button type="button" class="color-choice" [attr.aria-pressed]="colorKey() === c.key" [attr.aria-label]="'engage.streakStyle.colors.' + c.key | t"
                [style.background]="'linear-gradient(135deg, ' + c.from + ', ' + c.to + ')'" (click)="setStyle({ streakColor: c.key })">
                @if (colorKey() === c.key) {
                  <app-icon name="check" [size]="18" [stroke]="2.6" />
                }
              </button>
            }
          </div>
          <button type="button" class="btn btn-ghost btn-block" (click)="styleDialog.close()">{{ 'common.close' | t }}</button>
        </div>
      </dialog>

      <dialog class="sheet" #flameDialog>
        <div class="sheet-grip"></div>
        <div class="stack flame-sheet" [style.--st-from]="tint()['--st-from']" [style.--st-to]="tint()['--st-to']" [style.--st-glow]="tint()['--st-glow']">
          <div class="flame-head">
            <span class="flame-big"><span class="flame-emoji small" aria-hidden="true">{{ emoji() }}</span></span>
            <div>
              <h2 class="h3">{{ 'engage.flame.title' | t }} · {{ 'engage.flame.days' | t: { n: streakDays() } }}</h2>
              <p class="small muted">{{ 'engage.flame.best' | t: { n: summary()?.streak?.best ?? 0 } }}</p>
            </div>
          </div>
          <div class="freezes">
            <span class="small"><b>{{ 'engage.flame.freezes' | t }}</b></span>
            <span class="ice" role="img" [attr.aria-label]="'engage.flame.freezesValue' | t: { n: freezes() }">
              @for (k of [0, 1]; track k) {
                <i [class.on]="k < freezes()"><app-icon name="snowflake" [size]="16" [stroke]="2.2" /></i>
              }
            </span>
          </div>
          <p class="small muted">{{ 'engage.flame.rules' | t }}</p>
          <h3 class="section-title">{{ 'engage.flame.calendar' | t }}</h3>
          <div class="cal" role="img" [attr.aria-label]="'engage.flame.calendar' | t">
            @for (c of calendar(); track c.day; let i = $index) {
              <span class="cell" [class]="'cell ' + c.state" [style.--i]="i">
                @switch (c.state) {
                  @case ('done') {
                    <app-icon name="check" [size]="13" [stroke]="3" />
                  }
                  @case ('frozen') {
                    <app-icon name="snowflake" [size]="14" [stroke]="2.2" />
                  }
                  @case ('today') {
                    <app-icon name="flame" [size]="15" [stroke]="2.3" />
                  }
                }
              </span>
            }
          </div>
          <div class="legend tiny">
            <span><i class="k done"></i>{{ 'engage.flame.legendDone' | t }}</span>
            <span><i class="k frozen"></i>{{ 'engage.flame.legendFrozen' | t }}</span>
            <span><i class="k missed"></i>{{ 'engage.flame.legendMissed' | t }}</span>
            <span><i class="k today"></i>{{ 'engage.flame.legendToday' | t }}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-block" (click)="styleDialog.showModal()"><app-icon name="sparkles" [size]="18" /> {{ 'engage.streakStyle.open' | t }}</button>
          <button type="button" class="btn btn-ghost btn-block" (click)="flameDialog.close()">{{ 'common.close' | t }}</button>
        </div>
      </dialog>

      <app-push-prompt [dismissable]="true" />

      <h2 class="section-title">{{ 'today.todo' | t }}</h2>
      <div class="list">
        <button type="button" class="list-item task" [class.done]="weighedIn()" (click)="weigh()">
          <span class="list-icon"><app-icon [name]="weighedIn() ? 'check' : 'weight'" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'today.weighIn' | t }}</span>
            <span class="list-sub">
              @if (weighedIn()) {
                {{ 'today.weighInDone' | t: { kg: i18n.number(summary()?.current?.weightKg ?? 0, 1) } }}
              } @else {
                {{ 'today.weighInHint' | t }}
              }
            </span>
          </span>
          <app-icon [name]="weighedIn() ? 'pencil' : 'plus'" />
        </button>
        @if (account()?.waterGoal; as goal) {
          <app-water-row [goal]="goal" />
        } @else if (!waterInviteHidden()) {
          <div class="list-item water-invite">
            <span class="list-icon water-ico"><app-icon name="droplet" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'water.title' | t }}</span>
              <span class="list-sub wrap">{{ 'water.invite' | t }}</span>
            </span>
            <button type="button" class="btn btn-s invite-on" [disabled]="waterBusy()" (click)="enableWater()">{{ 'water.enable' | t }}</button>
            <button type="button" class="icon-btn mini" [attr.aria-label]="'water.inviteHide' | t" (click)="hideWaterInvite()">
              <app-icon name="x" [size]="16" />
            </button>
          </div>
        }
        <a class="list-item task" routerLink="/app/friends">
          <span class="list-icon"><app-icon name="users" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'friends.title' | t }}</span>
            <span class="list-sub">{{ friendsLine() }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a class="list-item task" routerLink="/app/timer">
          <span class="list-icon"><app-icon name="timer" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'engage.timer.title' | t }}</span>
            <span class="list-sub">{{ 'engage.timer.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
      </div>

      @if (summary(); as s) {
        <a routerLink="/app/progress" class="goal card">
          <div class="goal-top">
            <span class="goal-ico"><app-icon name="target" /></span>
            <div class="grow">
              <h2 class="h3 goal-title"><span>{{ 'today.goal' | t }}</span> <span class="goal-kg num">{{ i18n.number(s.goal.goalKg, 1) }} kg</span></h2>
              <p class="small muted">
                @if (s.goal.reached) {
                  {{ 'today.goalReached' | t }}
                } @else {
                  {{ (s.goal.remainingKg < 0 ? 'today.goalLose' : 'today.goalGain') | t: { kg: i18n.number(Math.abs(s.goal.remainingKg), 1) } }}
                  @if (eta(); as date) {
                    · {{ 'today.goalEta' | t: { date: date } }}
                  }
                }
              </p>
            </div>
            <app-icon name="chevronRight" [size]="18" />
          </div>
          <div class="bar" role="progressbar" [attr.aria-label]="'today.goal' | t" [attr.aria-valuenow]="s.goal.progressPct" aria-valuemin="0" aria-valuemax="100">
            <i [style.width.%]="s.goal.progressPct"></i>
          </div>
          <div class="goal-foot small">
            <span class="num">{{ i18n.number(s.profile.startWeightKg, 1) }} kg</span>
            <span class="chip chip-accent"><app-icon name="flame" /> {{ 'today.kcal' | t: { kcal: i18n.number(s.energy.targetKcal) } }}</span>
            <span class="num">{{ i18n.number(s.goal.goalKg, 1) }} kg</span>
          </div>
        </a>
      } @else {
        <div class="skeleton" style="height: 150px; border-radius: 24px"></div>
      }
    </main>
    <app-weigh-sheet />
  `,
  styles: `
    .head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
      padding-top: var(--space-3);
    }
    .hello {
      font-size: 2.1rem;
      margin-top: 4px;
    }
    .admin-cta {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--cool-soft);
      color: var(--cool);
      font-weight: 650;
      font-size: var(--fs-s);
    }
    .admin-cta span:first-of-type {
      flex: 1;
    }
    .streak {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-3) var(--space-4);
      align-items: center;
      padding: var(--space-5);
      border-radius: var(--radius-xl);
      overflow: hidden;
      background:
        radial-gradient(120% 120% at 0% 0%, color-mix(in srgb, var(--st-from, #ff3d1f) 20%, transparent), transparent 55%),
        radial-gradient(100% 100% at 100% 100%, color-mix(in srgb, var(--st-to, #ffc23d) 14%, transparent), transparent 60%),
        var(--surface);
      border: 1px solid color-mix(in srgb, var(--st-from, var(--accent)) 28%, transparent);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .streak:active {
      transform: scale(0.99);
    }
    .flame {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 22px;
      background: var(--surface-3);
      color: var(--fg-3);
      transition: background-color var(--dur-3);
    }
    .lit .flame {
      background: linear-gradient(135deg, var(--st-from), var(--st-to));
      color: var(--accent-ink);
      box-shadow: 0 14px 30px -10px var(--st-glow);
      animation: flicker 2.4s ease-in-out infinite;
    }
    /* the chosen icon, drawn by the phone (a real flame); greyed until the day is weighed */
    .flame-emoji {
      font-size: 36px;
      line-height: 1;
      filter: grayscale(1);
      opacity: 0.55;
    }
    .flame-emoji.small {
      font-size: 30px;
    }
    .lit .flame-emoji,
    .flame-big .flame-emoji {
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.18));
      opacity: 1;
    }
    .icon-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 8px;
    }
    .icon-choice {
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      border: 0;
      border-radius: 14px;
      background: var(--surface-2);
      font-size: 1.5rem;
      cursor: pointer;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .icon-choice[aria-pressed='true'] {
      background: linear-gradient(135deg, var(--st-from), var(--st-to));
      box-shadow: 0 8px 18px -8px var(--st-glow);
    }
    .icon-choice:active,
    .color-choice:active {
      transform: scale(0.92);
    }
    .color-grid {
      display: grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 8px;
    }
    .color-choice {
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      border: 0;
      border-radius: 50%;
      color: #fff;
      cursor: pointer;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .color-choice[aria-pressed='true'] {
      box-shadow:
        0 0 0 3px var(--surface),
        0 0 0 5px var(--fg-2);
    }
    @keyframes flicker {
      0%,
      100% {
        transform: scale(1) rotate(0);
      }
      30% {
        transform: scale(1.04) rotate(-2deg);
      }
      60% {
        transform: scale(0.98) rotate(1.5deg);
      }
    }
    .streak-copy {
      display: grid;
    }
    .label {
      font-size: var(--fs-s);
      font-weight: 600;
      color: var(--fg-2);
    }
    .big {
      font-family: var(--font-display);
      font-stretch: 122%;
      font-weight: 800;
      font-size: 2.6rem;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .big small {
      font-size: var(--fs-s);
      font-weight: 600;
      color: var(--fg-2);
      letter-spacing: 0;
    }
    .week {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
    }
    .day {
      display: grid;
      justify-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--fg-3);
      text-transform: uppercase;
    }
    .day i {
      display: grid;
      place-items: center;
      width: 100%;
      max-width: 36px;
      aspect-ratio: 1;
      border-radius: 12px;
      background: var(--surface-3);
      color: #fff;
      animation: cell-in 420ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 45ms);
    }
    .day.done i {
      background: var(--cal-done);
      color: var(--cal-done-ink);
    }
    .day.frozen i {
      background: var(--cal-freeze);
      color: var(--cal-freeze-ink);
    }
    .flame-more {
      position: absolute;
      top: var(--space-3);
      right: var(--space-3);
      width: auto;
      min-width: 44px;
      padding-inline: 8px;
      gap: 4px;
      display: inline-flex;
      align-items: center;
    }
    .freeze-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      background: var(--cal-freeze);
      color: var(--cal-freeze-ink);
      font-size: 12px;
      font-weight: 750;
    }
    .flame-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .flame-big {
      display: grid;
      place-items: center;
      width: 54px;
      height: 54px;
      border-radius: 18px;
      background: linear-gradient(135deg, var(--st-from, #ff6a2b), var(--st-to, #ffb03b));
      color: var(--accent-ink);
      flex: none;
    }
    .freezes {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .ice {
      display: flex;
      gap: 6px;
    }
    .ice i {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: var(--surface-3);
      color: var(--fg-3);
    }
    .ice i.on {
      background: var(--cal-freeze);
      color: var(--cal-freeze-ink);
    }
    .cal {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 6px;
    }
    .cell {
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      border-radius: 10px;
      background: transparent;
      border: 1.5px dashed var(--line-strong);
      animation: cell-in 380ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 18ms);
    }
    .cell.done {
      border: 0;
      background: var(--cal-done);
      color: var(--cal-done-ink);
    }
    .cell.frozen {
      border: 0;
      background: var(--cal-freeze);
      color: var(--cal-freeze-ink);
    }
    .cell.missed {
      border: 0;
      background: var(--surface-3);
    }
    .cell.today {
      border: 2px solid var(--cal-today-ink);
      background: var(--cal-today);
      color: var(--cal-today-ink);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      color: var(--fg-2);
      font-weight: 600;
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .k {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .k.done {
      background: var(--cal-done-ink);
    }
    .k.frozen {
      background: var(--cal-freeze-ink);
    }
    .k.missed {
      background: var(--fg-3);
    }
    .k.today {
      background: var(--cal-today-ink);
    }
    .day.now {
      color: var(--accent-text);
    }
    .day.now:not(.done) i {
      outline: 2px dashed color-mix(in srgb, var(--accent) 60%, transparent);
      outline-offset: 2px;
    }
    @keyframes cell-in {
      from {
        transform: scale(0.4);
        opacity: 0;
      }
    }
    .hint {
      grid-column: 1 / -1;
      color: var(--fg-2);
    }
    .task.done .list-icon {
      background: #16a34a;
      color: #fff;
    }
    .water-ico {
      background: var(--cool-soft) !important;
      color: var(--cool) !important;
    }
    .water-invite {
      gap: 10px;
      padding-right: 8px;
    }
    .list-sub.wrap {
      white-space: normal;
    }
    .invite-on {
      --btn-h: 36px;
      flex: none;
      padding: 0 14px;
      background: var(--cool-soft);
      color: var(--cool);
    }
    .icon-btn.mini {
      flex: none;
      width: 32px;
      height: 32px;
      color: var(--fg-3);
    }
    /* the goal weight never splits from its unit */
    .goal-title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 10px;
    }
    .goal-kg {
      white-space: nowrap;
      color: var(--accent-text);
    }
    .soon .list-icon {
      color: var(--fg-3);
    }
    .goal {
      display: grid;
      gap: var(--space-4);
      transition: transform var(--dur-1) var(--ease-out);
    }
    .goal:active {
      transform: scale(0.99);
    }
    .goal-top {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .goal-ico {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      flex: none;
      border-radius: 16px;
      background: var(--cool-soft);
      color: var(--cool);
    }
    .bar {
      height: 10px;
      border-radius: 5px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 5px;
      background: var(--flame);
      animation: grow 900ms var(--ease-out) both;
      transform-origin: 0 50%;
    }
    @keyframes grow {
      from {
        transform: scaleX(0);
      }
    }
    .goal-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      color: var(--fg-2);
      font-weight: 600;
    }
  `,
})
export class TodayPage {
  protected readonly session = inject(SessionStore);
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(ApiService);
  private readonly tracking = inject(TrackingStore);
  // loaded here so that the Photos and Meals tabs open on their content, not on a skeleton
  private readonly photos = inject(PhotosStore);
  private readonly meals = inject(MealsStore);
  private readonly friendsApi = inject(FriendsApi);
  protected readonly friends = signal<Friend[] | null>(null);
  protected readonly friendsLine = computed(() => {
    const f = this.friends();
    if (!f || !f.length) return this.i18n.t('friends.sub');
    const done = f.filter((x) => x.todayDone).length;
    return (
      this.i18n.t(f.length === 1 ? 'today.friendsOne' : 'today.friendsMany', { n: f.length }) +
      ' · ' +
      this.i18n.t(done === 0 ? 'today.friendsDoneNone' : done === 1 ? 'today.friendsDoneOne' : 'today.friendsDoneMany', { n: done })
    );
  });
  private readonly toast = inject(ToastService);
  protected readonly waterBusy = signal(false);
  protected readonly waterInviteHidden = signal(readFlag(WATER_INVITE_KEY));
  private readonly sheet = viewChild.required(WeighSheetComponent);
  protected readonly Math = Math;

  protected readonly account = this.session.account;
  protected readonly summary = this.tracking.summary;
  protected readonly pending = signal(0);

  protected readonly weighedIn = computed(() => this.summary()?.streak.todayDone === true);
  protected readonly streakDays = computed(() => this.summary()?.streak.days ?? 0);
  /** the streak's look, chosen by the member (the flame in orange by default) */
  protected readonly icons = STREAK_ICONS;
  protected readonly colors = STREAK_COLORS;
  protected readonly iconKey = computed(() => this.session.account()?.streakIcon ?? 'flame');
  protected readonly colorKey = computed(() => this.session.account()?.streakColor ?? 'orange');
  protected readonly emoji = computed(() => streakEmoji(this.iconKey()));
  protected readonly tint = computed(() => streakTint(this.colorKey()));

  /** shown at once, saved behind (and put back if it could not be) */
  protected async setStyle(patch: { streakIcon?: string; streakColor?: string }): Promise<void> {
    const before = this.session.account();
    if (!before) return;
    this.session.setAccount({ ...before, ...patch });
    try {
      this.session.setAccount(await this.api.updateMe(patch));
    } catch (e) {
      this.session.setAccount(before);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
  protected readonly streakMessage = computed(() =>
    this.weighedIn() ? 'today.streakSafe' : this.streakDays() > 0 ? 'today.streakKeep' : 'today.streakStart',
  );
  protected readonly todayLabel = computed(() =>
    this.i18n.date(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' }),
  );
  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    const key = h < 12 ? 'today.greetingMorning' : h < 18 ? 'today.greetingDay' : 'today.greetingEvening';
    return this.i18n.t(key, { name: this.account()?.displayName ?? '' });
  });
  protected readonly week = computed(() => {
    const fmt = new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'narrow' });
    const today = new Date().toDateString();
    const days = this.summary()?.streak.week;
    if (days) {
      return days.map((d) => {
        const date = new Date(d.day + 'T12:00:00');
        return { day: d.day, label: fmt.format(date), done: d.done, frozen: d.frozen, today: date.toDateString() === today };
      });
    }
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return { day: String(i), label: fmt.format(date), done: false, frozen: false, today: date.toDateString() === today };
    });
  });
  protected readonly freezes = computed(() => this.summary()?.streak.freezes ?? 0);
  /** the last 28 days: weighed, frozen, missed, today, or before the start */
  protected readonly calendar = computed(() => {
    const s = this.summary();
    const today = localDay();
    const start = s?.profile.startDate ?? today;
    return (s?.streak.calendar ?? []).map((d) => ({
      day: d.day,
      state: d.done ? 'done' : d.frozen ? 'frozen' : d.day === today ? 'today' : d.day < start ? 'none' : 'missed',
    }));
  });
  protected readonly eta = computed(() => {
    const g = this.summary()?.goal;
    const date = g?.trendDate ?? g?.planDate;
    return date ? this.i18n.date(date, { day: 'numeric', month: 'long' }) : null;
  });

  constructor() {
    void this.tracking.load();
    void this.photos.load().catch(() => undefined);
    void this.meals.loadToday();
    void this.friendsApi
      .list()
      .then((v) => this.friends.set(v.friends))
      .catch(() => undefined);
    if (this.session.isAdmin()) {
      this.api
        .adminSummary()
        .then((s) => this.pending.set(s.pendingRequests))
        .catch(() => undefined);
    }
  }

  /** the glasses of water, turned on from here: a goal from the weight, changeable in the profile */
  protected async enableWater(): Promise<void> {
    this.waterBusy.set(true);
    try {
      const goal = defaultWaterGoal(this.summary()?.current?.weightKg ?? this.summary()?.profile.startWeightKg ?? null);
      this.session.setAccount(await this.api.updateMe({ waterGoal: goal }));
      this.toast.show(this.i18n.t('water.enabled', { n: goal }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.waterBusy.set(false);
    }
  }

  /** not interested: the invitation goes (on this device), the switch stays in the profile */
  protected hideWaterInvite(): void {
    this.waterInviteHidden.set(true);
    writeFlag(WATER_INVITE_KEY);
    this.toast.show(this.i18n.t('water.inviteHidden'));
  }

  /** today's weigh-in: a new one, or the existing one with its measurements (a save replaces the day) */
  protected async weigh(): Promise<void> {
    let entry = null;
    if (this.weighedIn()) {
      const logs = this.tracking.logs() ?? (await this.tracking.loadLogs());
      entry = logs.find((l) => l.day === localDay()) ?? null;
    }
    this.sheet().open(localDay(), entry);
  }
}
