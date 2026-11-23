import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { closeSheet } from '../../core/ui/sheets';
import { HapticDirective } from '../../core/ui/haptics';
import { RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import { ToastService } from '../../core/ui/toast.service';
import { TodoStore } from '../../core/support/support-api';
import { Outbox } from '../../core/offline/outbox';
import { WaitingNoteComponent } from '../../shared/waiting-note.component';
import { HealthTodayComponent } from './health-today.component';
import { AvatarImgComponent } from '../../shared/avatar-img.component';
import { WaterCardComponent, defaultWaterGoal } from './water-card.component';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { CHALLENGE_EMOJI } from '../../core/friends/friends-api';
import { FriendsStore } from '../../core/friends/friends.store';
import { calmReturn } from '../../core/ui/first-show';
import { challengeDay, challengeStanding } from '../../core/friends/challenge-text';
import { MealsStore } from '../../core/meals/meals.store';
import { PhotosStore } from '../../core/photos/photos.store';
import { TrackingStore, localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';
import { WeighSheetComponent } from './weigh-sheet.component';
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
  host: { '[class.calm]': 'calm()' },
  imports: [HapticDirective, NumberStepperComponent, AvatarImgComponent, PushPromptComponent, WaterCardComponent, RouterLink, TranslatePipe, IconComponent, WeighSheetComponent, WaitingNoteComponent, HealthTodayComponent],
  template: `
    <main class="page">
      <header class="head">
        <div>
          <p class="eyebrow">{{ todayLabel() }}</p>
          <h1 class="display hello" [attr.data-title]="'nav.today' | t">{{ greeting() }}</h1>
        </div>
        <div class="head-actions">
          <!-- 1.17: the notification centre, with the number of new ones -->
          <a routerLink="/app/notifications" class="bell" [class.ring]="unseen() > 0"
            [attr.aria-label]="unseen() > 0 ? ('engage.center.openNew' | t: { n: unseen() }) : ('engage.center.open' | t)">
            <app-icon name="bell" [size]="21" />
            @if (unseen() > 0) {
              <span class="bell-badge num" aria-hidden="true">{{ unseen() > 9 ? '9+' : unseen() }}</span>
            }
          </a>
          <a routerLink="/app/account" class="avatar" [attr.aria-label]="'nav.profile' | t">
            <app-avatar-img [src]="account()?.avatarUrl" [name]="account()?.displayName" />
          </a>
        </div>
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

      <dialog class="sheet" #eveningDialog [attr.aria-label]="'today.evening.title' | t">
        <div class="sheet-grip"></div>
        <div class="stack">
          <div>
            <h2 class="h3">{{ 'today.evening.title' | t }}</h2>
            <p class="small muted">{{ 'today.evening.text' | t }}</p>
          </div>
          <app-number-stepper [(value)]="eveningValue" [step]="0.1" [min]="30" [max]="350" [decimals]="1" unit="kg" [label]="'today.evening.label' | t" />
          @if (eveningDiff(); as d) {
            <p class="small evening-diff num">{{ d }}</p>
          }
          <span class="haptic block">
            <button type="button" class="btn btn-primary btn-block" [disabled]="eveningBusy()" (click)="saveEvening(eveningValue())">
              <app-icon name="check" /> {{ 'today.evening.save' | t }}
            </button><input appHaptic="success" />
          </span>
          @if (eveningKg() != null) {
            <button type="button" class="btn btn-ghost btn-block" [disabled]="eveningBusy()" (click)="saveEvening(null)">{{ 'today.evening.remove' | t }}</button>
          }
        </div>
      </dialog>

      <h2 class="section-title">{{ 'today.todo' | t }}</h2>
      <div class="list">
        <!-- 1.17: noted without network: greyed with « Sera envoyé plus tard », back to colour once sent -->
        <!-- 1.18: not done yet today: it stands out (warm, its icon breathing, « À faire ») until it is -->
        <button type="button" class="list-item task" [class.done]="weighedIn() || !!weighWaiting()" [class.is-waiting]="!!weighWaiting()"
          [class.todo-now]="weighToDo()" [class.is-arrived]="arrived() === 'weigh'" (click)="weigh()">
          <span class="list-icon"><app-icon [name]="weighedIn() || weighWaiting() ? 'check' : 'weight'" /></span>
          <span class="list-body">
            <span class="list-title weigh-title">
              <span class="weigh-name">{{ 'today.weighIn' | t }}</span>
              @if (weighToDo()) {
                <span class="todo-chip">{{ 'today.weighTodo' | t }}</span>
              }
            </span>
            <span class="list-sub">
              @if (weighWaiting(); as w) {
                {{ 'today.weighInDone' | t: { kg: i18n.number(w.kg, 1) } }}
              } @else if (weighedIn()) {
                {{ 'today.weighInDone' | t: { kg: i18n.number(summary()?.current?.weightKg ?? 0, 1) } }}
              } @else {
                {{ 'today.weighInHint' | t }}
              }
            </span>
            @if (weighWaiting(); as w) {
              <app-waiting-note [waitId]="w.id" />
            }
          </span>
          @if (weighToDo()) {
            <span class="weigh-go" aria-hidden="true"><app-icon name="plus" [size]="18" [stroke]="2.6" /></span>
          } @else {
            <app-icon [name]="weighedIn() || weighWaiting() ? 'pencil' : 'plus'" />
          }
        </button>
        <!-- 1.9: an optional evening weigh-in, from 5 pm once the morning one is done; 1.10: always there, greyed until then -->
        <button type="button" class="list-item task evening" [class.done]="eveningKg() != null" [class.locked]="eveningLocked()"
          [class.is-waiting]="!!eveningWaiting()" [class.is-arrived]="arrived() === 'evening'" [disabled]="eveningLocked()" (click)="openEvening()">
          <span class="list-icon"><app-icon [name]="eveningKg() != null ? 'check' : 'moon'" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'today.evening.title' | t }}</span>
            <span class="list-sub" [class.wrap]="eveningLocked()">{{ eveningLine() }}</span>
            @if (eveningWaiting(); as w) {
              <app-waiting-note [waitId]="w.id" [kind]="w.kg == null ? 'delete' : 'add'" />
            }
          </span>
          <app-icon [name]="eveningLocked() ? 'lock' : eveningKg() != null ? 'pencil' : 'plus'" />
        </button>
        @if (!account()?.waterGoal && !waterInviteHidden()) {
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
          @if (newPosts() > 0) {
            <span class="count-badge news" aria-hidden="true">{{ newPosts() }}</span>
          }
          <app-icon name="chevronRight" />
        </a>
        @if (challenge(); as c) {
          <a class="list-item task" routerLink="/app/challenges">
            <span class="list-icon trophy-ico"><span aria-hidden="true">{{ challengeEmoji[c.kind] }}</span></span>
            <span class="list-body">
              <span class="list-title">{{ 'friends.challenges.kinds.' + c.kind + '.title' | t }}</span>
              <span class="list-sub">{{ challengeLine() }}</span>
            </span>
            @if (c.myStatus === 'INVITED') {
              <span class="count-badge news" aria-hidden="true">1</span>
            }
            <app-icon name="chevronRight" />
          </a>
        }
        <a class="list-item task" routerLink="/app/timer">
          <span class="list-icon"><app-icon name="timer" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'engage.timer.title' | t }}</span>
            <span class="list-sub">{{ 'engage.timer.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
      </div>

      @if (account()?.waterGoal; as goal) {
        <app-water-card [goal]="goal" />
      }
      <!-- 1.17: the blood pressure and the pill box, when turned on in the profile -->
      <app-health-today />

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
    .evening-diff {
      margin: 0;
      text-align: center;
      color: var(--fg-2);
    }
    .trophy-ico {
      background: color-mix(in srgb, #f5b301 18%, transparent) !important;
      font-size: 1.15rem;
    }
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
    .head-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex: none;
    }
    .bell {
      position: relative;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow: inset 0 0 0 1px var(--line);
      color: var(--fg);
    }
    .bell.ring app-icon {
      animation: ring 1.2s var(--ease-out) 0.4s both;
      transform-origin: 50% 10%;
    }
    @keyframes ring {
      0%,
      100% {
        transform: rotate(0);
      }
      15% {
        transform: rotate(14deg);
      }
      30% {
        transform: rotate(-12deg);
      }
      45% {
        transform: rotate(8deg);
      }
      60% {
        transform: rotate(-5deg);
      }
      75% {
        transform: rotate(2deg);
      }
    }
    .bell-badge {
      position: absolute;
      top: -3px;
      right: -4px;
      display: grid;
      place-items: center;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--flame);
      box-shadow: 0 0 0 2px var(--bg);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
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
    /* 1.16: back on the tab, the days and the goal bar are there already (core/ui/first-show.ts) */
    :host(.calm) .day i,
    :host(.calm) .bar i {
      animation-duration: 0s;
      animation-delay: 0s;
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
    /* 1.18: the weigh-in of the day, not done yet: warm, a bar of the flame on its edge, its icon breathing */
    .task.todo-now {
      position: relative;
      background:
        radial-gradient(130% 160% at 0% 50%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 70%),
        color-mix(in srgb, var(--accent) 5%, var(--surface));
    }
    .task.todo-now::before {
      content: '';
      position: absolute;
      left: 0;
      top: 10px;
      bottom: 10px;
      width: 4px;
      border-radius: 0 4px 4px 0;
      background: var(--flame);
    }
    .task.todo-now .list-icon {
      background: var(--flame);
      color: #fff;
      animation: weigh-breathe 2.4s ease-in-out infinite;
    }
    @keyframes weigh-breathe {
      0%,
      100% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent);
        transform: scale(1);
      }
      50% {
        box-shadow: 0 0 0 7px color-mix(in srgb, var(--accent) 0%, transparent);
        transform: scale(1.06);
      }
    }
    .weigh-title {
      display: flex !important;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .weigh-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .task.todo-now .weigh-name {
      font-weight: 750;
    }
    .todo-chip {
      flex: none;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background: var(--accent);
      color: var(--accent-ink);
      font-size: 11px;
      font-weight: 750;
      line-height: 1.5;
      animation: chip-in 420ms cubic-bezier(0.34, 1.6, 0.5, 1) both;
    }
    @keyframes chip-in {
      from {
        transform: scale(0.6);
        opacity: 0;
      }
    }
    .weigh-go {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      flex: none;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      box-shadow: 0 6px 14px -6px var(--accent-glow);
    }
    .task.todo-now:active .weigh-go {
      transform: scale(0.9);
    }
    @media (prefers-reduced-motion: reduce) {
      .task.todo-now .list-icon,
      .todo-chip {
        animation: none;
      }
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
    /* the evening weigh-in before 5 pm or before the morning one: there, greyed, saying when */
    .task.locked {
      cursor: default;
    }
    .task.locked .list-icon,
    .task.locked .list-title {
      opacity: 0.45;
    }
    /* an icon is display: contents (no opacity of its own): its colour, which its strokes follow */
    .task.locked > app-icon:last-child {
      color: var(--fg-3);
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
  // 1.16: the friends' line, the challenge and the news as last seen, asked again when older than 30 s
  private readonly friendsStore = inject(FriendsStore);
  protected readonly friends = this.friendsStore.friends;
  /** 1.17: the notifications not seen yet (the bell) */
  private readonly todo = inject(TodoStore);
  protected readonly unseen = computed(() => this.todo.todo()?.notifications ?? 0);
  protected readonly calm = calmReturn('today', 1000);
  // ── the evening weigh-in (1.9) ──────────────────────────────────────────
  private readonly eveningDialog = viewChild.required<ElementRef<HTMLDialogElement>>('eveningDialog');
  protected readonly eveningBusy = signal(false);
  protected readonly eveningValue = signal(70);
  /** today's, when the morning weigh-in of today carries one (1.17: or the one waiting for the network) */
  protected readonly eveningKg = computed(() => {
    const w = this.eveningWaiting();
    if (w) return w.kg;
    const c = this.summary()?.current;
    return c?.day === localDay() ? (c.eveningKg ?? null) : null;
  });

  // ── 1.17: what waits for the network ────────────────────────────────────
  private readonly outbox = inject(Outbox);
  /** today's weigh-in noted without network */
  protected readonly weighWaiting = computed(() => {
    const p = this.outbox.of('weigh', localDay()).at(-1);
    const kg = (p?.body as { weightKg?: number | null } | undefined)?.weightKg;
    return p && kg != null ? { id: p.id, kg } : null;
  });
  protected readonly eveningWaiting = computed(() => {
    const p = this.outbox.of('evening', localDay()).at(-1);
    return p ? { id: p.id, kg: (p.body as { weightKg?: number } | null)?.weightKg ?? null } : null;
  });
  /** the row that just reached the server, for a moment (it comes back to colour) */
  protected readonly arrived = signal<'weigh' | 'evening' | null>(null);
  /** the hour, kept up to date while the screen stays open (the evening weigh-in opens at 5 pm) */
  private readonly hour = signal(new Date().getHours());
  /** from 5 pm, once weighed in this morning (or once noted): greyed until then, saying what it waits for */
  protected readonly eveningLocked = computed(() => this.eveningKg() == null && (!this.weighedIn() || this.hour() < 17));
  /** « +0,9 kg depuis ce matin », the evening one against the morning one */
  private diffText(evening: number): string {
    const morning = this.summary()?.current?.weightKg;
    if (morning == null) return '';
    const d = Math.round((evening - morning) * 10) / 10;
    return this.i18n.t('today.evening.diff', { d: `${d > 0 ? '+' : d < 0 ? '−' : ''}${this.i18n.number(Math.abs(d), 1)}` });
  }
  protected readonly eveningLine = computed(() => {
    const kg = this.eveningKg();
    if (this.eveningLocked()) {
      const late = this.hour() >= 17;
      return this.i18n.t(this.weighedIn() ? 'today.evening.lockedHour' : late ? 'today.evening.lockedMorning' : 'today.evening.locked');
    }
    if (kg == null) return this.i18n.t('today.evening.hint');
    const diff = this.diffText(kg);
    return `${this.i18n.number(kg, 1)} kg${diff ? ' · ' + diff : ''}`;
  });
  protected readonly eveningDiff = computed(() => this.diffText(this.eveningValue()));

  protected openEvening(): void {
    const c = this.summary()?.current;
    this.eveningValue.set(this.eveningKg() ?? Math.round(((c?.weightKg ?? 70) + 0.8) * 10) / 10);
    this.eveningDialog().nativeElement.showModal();
  }

  protected async saveEvening(kg: number | null): Promise<void> {
    this.eveningBusy.set(true);
    try {
      await this.tracking.saveEvening(localDay(), kg);
      closeSheet(this.eveningDialog().nativeElement);
      this.toast.show(this.i18n.t(this.tracking.lastQueued() ? 'offline.queued' : kg == null ? 'today.evening.removed' : 'today.evening.saved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.eveningBusy.set(false);
    }
  }

  /** the challenge to show on Today: an invitation first, else one going on */
  protected readonly challenges = this.friendsStore.challenges;
  protected readonly challengeEmoji = CHALLENGE_EMOJI;
  protected readonly challenge = computed(() => {
    const live = this.challenges().filter((c) => !c.ended);
    return live.find((c) => c.myStatus === 'INVITED') ?? live.find((c) => c.myStatus === 'JOINED') ?? null;
  });
  protected readonly challengeLine = computed(() => {
    const c = this.challenge();
    if (!c) return '';
    if (c.myStatus === 'INVITED') return this.i18n.t('friends.challenges.todayInvite', { name: c.ownerName });
    const me = c.members.find((m) => m.me);
    const parts = [challengeDay(c, this.i18n), me ? this.i18n.t('friends.challenges.score', { done: me.done, total: c.length }) : '', challengeStanding(c, this.i18n)];
    return parts.filter(Boolean).join(' · ');
  });
  /** what the friends shared since the friends' screen was last opened on this phone */
  protected readonly newPosts = signal(this.friendsStore.newPosts());
  protected readonly friendsLine = computed(() => {
    const f = this.friends();
    if (f && !f.length) return this.i18n.t('friends.inviteNudge');
    if (!f) return this.i18n.t('friends.sub');
    if (this.newPosts() > 0) return this.i18n.t(this.newPosts() === 1 ? 'friends.posts.newsOne' : 'friends.posts.newsMany', { n: this.newPosts() });
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
  /** 1.18: today's weigh-in still to do (once the summary is known: never a flash before it comes) */
  protected readonly weighToDo = computed(() => !!this.summary() && !this.weighedIn() && !this.weighWaiting());
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
    const destroy = inject(DestroyRef);
    // 1.17: a weigh-in kept offline reached the server: its row comes back to colour, once the summary has it
    let arrivedTimer: ReturnType<typeof setTimeout> | null = null;
    const sent = this.outbox.sent.subscribe((p) => {
      if ((p.kind !== 'weigh' && p.kind !== 'evening') || p.day !== localDay()) return;
      this.arrived.set(p.kind);
      if (arrivedTimer) clearTimeout(arrivedTimer);
      arrivedTimer = setTimeout(() => this.arrived.set(null), 1400);
    });
    destroy.onDestroy(() => {
      sent.unsubscribe();
      if (arrivedTimer) clearTimeout(arrivedTimer);
    });
    afterNextRender(() => {
      const clock = setInterval(() => this.hour.set(new Date().getHours()), 60_000);
      destroy.onDestroy(() => clearInterval(clock));
    });
    this.refresh();
    // back in the app after a while (the phone was locked): what is older than 30 s is asked again
    const doc = inject(DOCUMENT);
    const back = () => doc.visibilityState === 'visible' && this.refresh();
    afterNextRender(() => {
      doc.addEventListener('visibilitychange', back);
      destroy.onDestroy(() => doc.removeEventListener('visibilitychange', back));
    });
    if (this.session.isAdmin()) {
      this.api
        .adminSummary()
        .then((s) => this.pending.set(s.pendingRequests))
        .catch(() => undefined);
    }
  }

  /** 1.16: what Today shows, as last seen, and from the server what is older than 30 s (core/api/kept.ts) */
  private refresh(): void {
    void this.tracking.ensure();
    void this.photos.ensureFresh().catch(() => undefined);
    void this.meals.ensureToday();
    // the friends' news newer than the last visit of their screen
    void this.friendsStore.ensure().then(() => this.newPosts.set(this.friendsStore.newPosts()));
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
