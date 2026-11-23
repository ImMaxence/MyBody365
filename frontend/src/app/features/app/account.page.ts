import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeService } from '../../core/theme/theme.service';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { UserDataService } from '../../core/user-data.service';
import { prepareImage } from '../../core/photos/image-tools';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { AppUpdate } from '../../core/pwa/app-update';
import { IconComponent } from '../../shared/icon.component';
import { CURRENT_VERSION } from '../changelog/changelog.version';
import { SegDirective } from '../../shared/seg.directive';
import { normalizeUsername } from '../../core/friends/friends-api';
import { PushPromptComponent } from '../../shared/push-prompt.component';
import { FeedbackKind, SupportApi, TodoStore } from '../../core/support/support-api';
import { SITE } from '../../core/site';
import { AvatarImgComponent } from '../../shared/avatar-img.component';
import { AvatarZoom } from '../../shared/avatar-zoom';

@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarImgComponent, PushPromptComponent, SegDirective, FormsModule, RouterLink, TranslatePipe, IconComponent],
  template: `
    <main class="page">
      <header class="page-head"><h1 class="title">{{ 'account.title' | t }}</h1></header>

      <section class="who card">
        <button type="button" class="avatar big avatar-btn" [class.busy]="photoBusy()" [attr.aria-label]="(account()?.avatarUrl ? 'account.photoZoom' : 'account.photoChange') | t" (click)="avatarTap($any($event.currentTarget))">
          @for (s of [account()?.avatarUrl]; track s) {
            <app-avatar-img [src]="s" [name]="account()?.displayName" [size]="64" />
          }
          <span class="cam" aria-hidden="true"><app-icon name="camera" [size]="13" [stroke]="2.4" /></span>
        </button>
        <div class="who-text">
          <form class="name-form" (ngSubmit)="saveName()">
            <label class="sr-only" for="acc-name">{{ 'account.displayName' | t }}</label>
            <input id="acc-name" class="name-input" name="displayName" maxlength="40" [(ngModel)]="name" (blur)="saveName()" />
          </form>
          <span class="handle-row">
            <button type="button" class="handle" (click)="openUsername()" [attr.aria-label]="'account.usernameEdit' | t">
              <app-icon name="at" [size]="14" /><span class="ellipsis">{{ account()?.username }}</span><app-icon name="pencil" [size]="13" />
            </button>
            <button type="button" class="icon-btn mini" [attr.aria-label]="'account.copyUsername' | t" (click)="copyUsername()"><app-icon name="copy" [size]="15" /></button>
          </span>
          <span class="small muted ellipsis">{{ account()?.email }}</span>
          @if (session.isAdmin()) {
            <span class="chip chip-cool"><app-icon name="shield" /> {{ 'account.roleAdmin' | t }}</span>
          }
        </div>
      </section>

      <app-push-prompt />

      <div class="list">
        <a routerLink="/app/account/goal" class="list-item">
          <span class="list-icon goal-ico"><app-icon name="target" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'goal.title' | t }}</span>
            @if (tracking.summary(); as s) {
              <span class="list-sub">{{ 'goal.sub' | t: { goal: i18n.number(s.profile.goalWeightKg, 1), pace: i18n.number(s.profile.weeklyRateKg, 2) } }}</span>
            }
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/account/water" class="list-item">
          <span class="list-icon water-ico"><app-icon name="droplet" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'water.title' | t }}</span>
            <span class="list-sub">{{ waterSub() }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <!-- 1.17: the optional modules (blood pressure, pill box), off until turned on -->
        <a routerLink="/app/account/health" class="list-item">
          <span class="list-icon health-ico"><app-icon name="heartPulse" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'health.title' | t }}</span>
            <span class="list-sub">{{ healthSub() }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <!-- 1.19: a read-only link for a coach or a dietitian -->
        <a routerLink="/app/account/share" class="list-item">
          <span class="list-icon"><app-icon name="link" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'shareLinks.title' | t }}</span>
            <span class="list-sub">{{ 'shareLinks.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/account/notifications" class="list-item">
          <span class="list-icon"><app-icon name="bell" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'engage.notifications.title' | t }}</span>
            <span class="list-sub">{{ 'engage.notifications.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/account/settings" class="list-item">
          <span class="list-icon"><app-icon name="contrast" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'account.settings' | t }}</span>
            <span class="list-sub">{{ settingsSub() }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/account/backup" class="list-item">
          <span class="list-icon"><app-icon name="archive" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'backup.title' | t }}</span>
            <span class="list-sub">{{ (todo.todo()?.drive ? 'todo.drive' : 'backup.sub') | t }}</span>
          </span>
          @if (todo.todo()?.drive) {
            <span class="row-dot" aria-hidden="true"></span>
          }
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/account/security" class="list-item">
          <span class="list-icon"><app-icon name="key" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'account.security' | t }}</span>
            <span class="list-sub">{{ (todo.todo()?.passkey ? 'todo.passkey' : 'account.securitySub') | t }}</span>
          </span>
          @if (todo.todo()?.passkey) {
            <span class="row-dot" aria-hidden="true"></span>
          }
          <app-icon name="chevronRight" />
        </a>
        @if (session.isAdmin()) {
          <a routerLink="/app/admin" class="list-item">
            <span class="list-icon admin"><app-icon name="shield" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'account.admin' | t }}</span>
              <span class="list-sub">{{ 'account.adminSub' | t }}</span>
            </span>
            @if (todo.admin() > 0) {
              <span class="count-badge" [attr.aria-label]="'todo.adminCount' | t: { n: todo.admin() }">{{ todo.admin() }}</span>
            }
            <app-icon name="chevronRight" />
          </a>
        }
        <button type="button" class="list-item" (click)="openFeedback()">
          <span class="list-icon contact-ico"><app-icon name="mail" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'feedback.title' | t }}</span>
            <span class="list-sub">{{ 'feedback.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </button>
        <!-- 1.20.2: a new version came while the app stayed open: switched to now in one tap (else it comes by itself the
             next time the app goes to the background) -->
        @if (update.ready()) {
          <button type="button" class="list-item update-row" [class.reloading]="reloading()" [disabled]="reloading()" (click)="reloadApp()">
            <span class="list-icon update-ico" [class.turning]="reloading()">
              <app-icon name="refresh" />
              <span class="ico-dot" aria-hidden="true"></span>
            </span>
            <span class="list-body">
              <span class="list-title">{{ 'account.update.title' | t }}</span>
              <span class="list-sub">{{ 'account.update.sub' | t: { v: version } }}</span>
              <span class="reload-pill"><app-icon name="refresh" [size]="16" [stroke]="2.4" /> {{ 'account.update.reload' | t }}</span>
            </span>
          </button>
        }
        <a routerLink="/app/account/changelog" class="list-item">
          <span class="list-icon"><app-icon name="sparkles" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'account.changelog' | t }}</span>
            <span class="list-sub">{{ 'account.changelogSub' | t: { v: version } }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a [routerLink]="prefix() + '/legal/mentions'" class="list-item">
          <span class="list-icon"><app-icon name="scroll" /></span>
          <span class="list-body"><span class="list-title">{{ 'account.legal' | t }}</span></span>
          <app-icon name="chevronRight" />
        </a>
      </div>

      <button type="button" class="btn btn-secondary btn-block" (click)="logout()"><app-icon name="logout" /> {{ 'account.logout' | t }}</button>
      <button type="button" class="btn btn-ghost btn-block danger-text" (click)="openDelete()">
        <app-icon name="trash" /> {{ 'account.deleteTitle' | t }}
      </button>
    </main>

    <dialog class="sheet" #photoDialog [attr.aria-label]="'account.photo' | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div class="photo-head">
          <span class="avatar huge">
            <app-avatar-img [src]="account()?.avatarUrl" [name]="account()?.displayName" [size]="96" />
          </span>
          <h2 class="h3">{{ 'account.photo' | t }}</h2>
        </div>
        <label class="btn btn-primary btn-block file-btn" [class.disabled]="photoBusy()">
          <app-icon name="image" /> {{ 'account.photoChoose' | t }}
          <input type="file" accept="image/*" class="sr-only" [disabled]="photoBusy()" (change)="pickPhoto($event)" />
        </label>
        @if (account()?.ownAvatar) {
          <button type="button" class="btn btn-ghost btn-block danger-text" [disabled]="photoBusy()" (click)="removePhoto()">
            <app-icon name="trash" /> {{ 'account.photoRemove' | t }}
          </button>
        }
        <p class="tiny muted note"><app-icon name="lock" [size]="14" /> {{ 'account.photoNote' | t }}</p>
      </div>
    </dialog>

    <dialog class="sheet" #usernameDialog [attr.aria-label]="'account.username' | t">
      <div class="sheet-grip"></div>
      <form class="stack" (ngSubmit)="saveUsername()">
        <h2 class="h3">{{ 'account.username' | t }}</h2>
        <label class="handle-input" [class.invalid]="usernameDraft && !draftValid()">
          <span aria-hidden="true">@</span>
          <input name="username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="21" [attr.aria-label]="'account.username' | t"
            [(ngModel)]="usernameDraft" (ngModelChange)="usernameError.set(null)" />
        </label>
        <p class="tiny" [class.muted]="!usernameError()" [class.danger-text]="usernameError()">{{ usernameError() ?? ('account.usernameHint' | t) }}</p>
        <label class="check">
          <input type="checkbox" name="discoverable" [checked]="account()?.discoverable ?? true" (change)="setDiscoverable($any($event.target).checked)" />
          <span><b>{{ 'account.discoverable' | t }}</b><span class="small muted">{{ 'account.discoverableHint' | t }}</span></span>
        </label>
        <button type="submit" class="btn btn-primary btn-block" [disabled]="!draftValid() || busy()"><app-icon name="check" /> {{ 'common.save' | t }}</button>
      </form>
    </dialog>

    <dialog class="sheet" #feedbackDialog [attr.aria-label]="'feedback.sheetTitle' | t">
      <div class="sheet-grip"></div>
      <form class="stack" (ngSubmit)="sendFeedback()">
        <div>
          <h2 class="h3">{{ 'feedback.sheetTitle' | t }}</h2>
          <p class="small muted">{{ 'feedback.sheetText' | t }}</p>
        </div>
        <div class="seg" appSeg role="radiogroup" [attr.aria-label]="'feedback.kindLabel' | t">
          @for (k of feedbackKinds; track k.kind) {
            <button type="button" role="radio" [attr.aria-checked]="feedbackKind() === k.kind" (click)="feedbackKind.set(k.kind)">
              <app-icon [name]="k.icon" /> {{ 'feedback.kinds.' + k.kind | t }}
            </button>
          }
        </div>
        <label class="sr-only" for="fb-text">{{ 'feedback.messageLabel' | t }}</label>
        <textarea id="fb-text" class="textarea" name="message" maxlength="2000" rows="5" [placeholder]="'feedback.placeholders.' + feedbackKind() | t"
          [(ngModel)]="feedbackText"></textarea>
        <p class="tiny muted">{{ 'feedback.joined' | t: { v: version } }}</p>
        <button type="submit" class="btn btn-primary btn-block" [disabled]="feedbackText.trim().length < 3 || busy()"><app-icon name="send" /> {{ 'feedback.send' | t }}</button>
        <a class="btn btn-ghost btn-block" [href]="'mailto:' + site.email + '?subject=MyBody365'"><app-icon name="mail" [size]="18" /> {{ 'feedback.byEmail' | t }}</a>
      </form>
    </dialog>

    <dialog class="sheet" #deleteDialog (close)="confirmEmail = ''">
      <div class="sheet-grip"></div>
      <form class="stack" (ngSubmit)="deleteAccount()">
        <h2 class="h3">{{ 'account.deleteTitle' | t }}</h2>
        <p class="muted small">{{ 'account.deleteText' | t }}</p>
        <input class="input" name="confirm" type="email" autocomplete="off" [placeholder]="account()?.email" [(ngModel)]="confirmEmail" />
        <button type="submit" class="btn btn-danger btn-block" [disabled]="confirmEmail.trim().toLowerCase() !== account()?.email || busy()">
          {{ 'account.deleteCta' | t }}
        </button>
        <button type="button" class="btn btn-ghost btn-block" (click)="deleteDialog.close()">{{ 'common.cancel' | t }}</button>
      </form>
    </dialog>
  `,
  styles: `
    .who {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .avatar.big {
      width: 64px;
      height: 64px;
      font-size: 24px;
    }
    .avatar-btn {
      position: relative;
      flex: none;
      overflow: visible;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .avatar-btn.is-pressed {
      transform: scale(0.94);
    }
    .avatar-btn.busy {
      opacity: 0.6;
    }
    .cam {
      position: absolute;
      right: -2px;
      bottom: -2px;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--surface);
      color: var(--fg);
      box-shadow: var(--shadow-1), 0 0 0 2px var(--surface);
    }
    .avatar.huge {
      width: 96px;
      height: 96px;
      font-size: 36px;
    }
    .photo-head {
      display: grid;
      justify-items: center;
      gap: var(--space-3);
      text-align: center;
    }
    .file-btn {
      cursor: pointer;
    }
    .file-btn.disabled {
      opacity: 0.6;
      pointer-events: none;
    }
    .file-btn:focus-within {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
    .note {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .handle-row {
      display: flex;
      align-items: center;
      gap: 2px;
      max-width: 100%;
      margin-left: -8px;
    }
    .handle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      min-height: 32px;
      padding: 0 8px;
      border-radius: var(--radius-pill);
      color: var(--accent-text);
      font-weight: 700;
      transition: background-color var(--dur-2);
    }
    .icon-btn.mini {
      width: 32px;
      height: 32px;
    }
    .handle-input {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 52px;
      padding: 0 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      border: 1px solid var(--line-strong);
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--fg-2);
      transition: border-color var(--dur-2);
    }
    .handle-input:focus-within {
      border-color: var(--accent);
    }
    .handle-input.invalid {
      border-color: var(--danger);
    }
    .handle-input input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      font: inherit;
      color: var(--fg);
      outline: none;
    }
    .who-text {
      display: grid;
      gap: 4px;
      min-width: 0;
      justify-items: start;
    }
    .name-input {
      width: 100%;
      padding: 2px 6px;
      margin-left: -6px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      font-family: var(--font-display);
      font-stretch: 112%;
      font-weight: 800;
      font-size: 1.35rem;
      letter-spacing: -0.02em;
    }
    .name-input:focus {
      outline: none;
      border-color: var(--line-strong);
      background: var(--surface-2);
    }
    .ellipsis {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .goal-ico {
      background: var(--accent-soft) !important;
      color: var(--accent-text) !important;
    }
    .list-icon.contact-ico {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    /* 1.20.2: a new version to reload */
    .update-row {
      align-items: flex-start;
    }
    .update-ico {
      position: relative;
      background: var(--accent-soft) !important;
      color: var(--accent-text) !important;
    }
    .update-ico.turning > app-icon,
    .update-row.reloading .reload-pill app-icon {
      animation: turn 900ms linear infinite;
    }
    /* the small red dot, on the refresh icon */
    .ico-dot {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #e5341c;
      box-shadow: 0 0 0 2px var(--surface);
      animation: dot-in 420ms cubic-bezier(0.34, 1.6, 0.5, 1) both;
    }
    /* the whole text, on as many lines as it needs */
    .update-row .list-title,
    .update-row .list-sub {
      white-space: normal;
    }
    @keyframes turn {
      to {
        transform: rotate(360deg);
      }
    }
    .reload-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      justify-self: start;
      margin-top: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      background: var(--flame-deep);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
    }
    .update-row:disabled {
      opacity: 1;
    }
    /* something to do there (a passkey, the Drive backup) */
    .row-dot {
      width: 10px;
      height: 10px;
      flex: none;
      border-radius: 50%;
      background: #e5341c;
      animation: dot-in 420ms cubic-bezier(0.34, 1.6, 0.5, 1) both;
    }
    @keyframes dot-in {
      from {
        transform: scale(0);
      }
    }
    .list-icon.admin {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .danger-text {
      color: var(--danger);
    }
    .list-icon.water-ico {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .list-icon.health-ico {
      background: color-mix(in srgb, #e5484d 13%, var(--surface));
      color: color-mix(in srgb, #e5484d 75%, var(--fg));
    }
  `,
})
export class AccountPage {
  protected readonly session = inject(SessionStore);
  protected readonly tracking = inject(TrackingStore);
  private readonly userData = inject(UserDataService);
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');
  private readonly photoSheet = viewChild.required<ElementRef<HTMLDialogElement>>('photoDialog');
  private readonly zoom = inject(AvatarZoom);

  /** one's own picture opens big (with its « Changer » under it); without one, the choice of a picture */
  protected avatarTap(button: HTMLElement): void {
    const a = this.account();
    const img = button.querySelector('img');
    if (!a?.avatarUrl || !img) {
      this.photoSheet().nativeElement.showModal();
      return;
    }
    this.zoom.open(button, a.avatarUrl, a.displayName, { label: this.i18n.t('account.photoChange'), run: () => this.photoSheet().nativeElement.showModal() });
  }
  private readonly usernameSheet = viewChild.required<ElementRef<HTMLDialogElement>>('usernameDialog');
  private readonly feedbackSheet = viewChild.required<ElementRef<HTMLDialogElement>>('feedbackDialog');
  protected readonly todo = inject(TodoStore);
  private readonly support = inject(SupportApi);
  protected readonly site = SITE;
  protected readonly feedbackKinds: { kind: FeedbackKind; icon: string }[] = [
    { kind: 'IDEA', icon: 'bulb' },
    { kind: 'BUG', icon: 'alert' },
    { kind: 'OTHER', icon: 'mail' },
  ];
  protected readonly feedbackKind = signal<FeedbackKind>('IDEA');
  protected feedbackText = '';
  protected readonly photoBusy = signal(false);
  protected usernameDraft = '';
  protected readonly usernameError = signal<string | null>(null);

  protected readonly account = this.session.account;
  protected readonly prefix = computed(() => (this.i18n.lang() === 'en' ? '/en' : ''));
  /** « 8 verres, soit 2 L » or « Désactivé » */
  protected readonly waterSub = computed(() => {
    const g = this.account()?.waterGoal;
    return g ? this.i18n.t('water.goalValue', { n: g, l: this.i18n.number(g * 0.25, 2) }) : this.i18n.t('water.off');
  });
  /** 1.17: « Tension, pilulier » turned on, or « Facultatif : tension, pilulier » */
  protected readonly healthSub = computed(() => {
    const a = this.account();
    const on = [a?.bpEnabled ? this.i18n.t('health.bp.title') : null, a?.pillsEnabled ? this.i18n.t('health.pills.title') : null].filter(Boolean);
    return on.length ? on.join(' · ') : this.i18n.t('health.sub');
  });
  /** « Auto · Français » */
  protected readonly settingsSub = computed(() => `${this.i18n.t('theme.' + this.theme.mode())} · ${this.i18n.lang() === 'en' ? 'English' : 'Français'}`);
  protected readonly version = CURRENT_VERSION;
  /** 1.20.2: a new version ready while the app stayed open */
  protected readonly update = inject(AppUpdate);
  protected readonly reloading = signal(false);

  constructor() {
    if (!this.tracking.summary()) void this.tracking.load();
    void this.todo.ensure();
    // here to look at the version: a new one is looked for (at most every 2 minutes)
    this.update.checkSoon();
  }

  protected reloadApp(): void {
    this.reloading.set(true);
    void this.update.reload();
  }

  protected openFeedback(): void {
    this.feedbackSheet().nativeElement.showModal();
  }

  protected async sendFeedback(): Promise<void> {
    const text = this.feedbackText.trim();
    if (text.length < 3) return;
    this.busy.set(true);
    try {
      await this.support.sendFeedback(this.feedbackKind(), text, this.version);
      this.feedbackText = '';
      closeSheet(this.feedbackSheet().nativeElement);
      this.toast.show(this.i18n.t('feedback.sent'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
  protected name = this.account()?.displayName ?? '';
  protected confirmEmail = '';
  protected readonly busy = signal(false);

  protected async saveName(): Promise<void> {
    const name = this.name.trim();
    if (!name || name === this.account()?.displayName) {
      this.name = this.account()?.displayName ?? '';
      return;
    }
    try {
      this.session.setAccount(await this.api.updateMe({ displayName: name }));
      this.toast.show(this.i18n.t('common.saved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  /** resized and converted here (HEIC included), cropped square and re-encoded by the server */
  protected async pickPhoto(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoBusy.set(true);
    try {
      const blob = await prepareImage(file, 900);
      this.session.setAccount(await this.api.setAvatar(blob));
      closeSheet(this.photoSheet().nativeElement);
      this.toast.show(this.i18n.t('account.photoSaved'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected async removePhoto(): Promise<void> {
    this.photoBusy.set(true);
    try {
      this.session.setAccount(await this.api.removeAvatar());
      closeSheet(this.photoSheet().nativeElement);
      this.toast.show(this.i18n.t('account.photoRemoved'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected openUsername(): void {
    this.usernameDraft = this.account()?.username ?? '';
    this.usernameError.set(null);
    this.usernameSheet().nativeElement.showModal();
  }

  protected draftValid(): boolean {
    const u = normalizeUsername(this.usernameDraft);
    return !!u && !u.startsWith('.') && !u.endsWith('.') && !u.includes('..');
  }

  protected async saveUsername(): Promise<void> {
    const u = normalizeUsername(this.usernameDraft);
    if (!u || !this.draftValid()) return;
    if (u === this.account()?.username) {
      closeSheet(this.usernameSheet().nativeElement);
      return;
    }
    this.busy.set(true);
    try {
      this.session.setAccount(await this.api.setUsername(u));
      closeSheet(this.usernameSheet().nativeElement);
      this.toast.show(this.i18n.t('account.usernameSaved'));
    } catch (err) {
      this.usernameError.set(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }

  protected setDiscoverable(on: boolean): Promise<void> {
    return this.patch({ discoverable: on });
  }

  private async patch(p: { discoverable?: boolean }): Promise<void> {
    this.busy.set(true);
    try {
      this.session.setAccount(await this.api.updateMe(p));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copyUsername(): Promise<void> {
    const u = this.account()?.username;
    if (!u) return;
    try {
      await navigator.clipboard.writeText('@' + u);
      this.toast.show(this.i18n.t('account.usernameCopied'));
    } catch {
      /* no clipboard: the username stays on screen */
    }
  }

  protected async logout(): Promise<void> {
    try {
      await this.session.logout();
    } catch {
      // 1.18: the session ends on the server: not without network
      this.toast.error(this.i18n.t('offline.signOut'));
      return;
    }
    this.userData.clear();
    await this.router.navigateByUrl('/app/login');
  }

  protected openDelete(): void {
    this.dialog().nativeElement.showModal();
  }

  protected async deleteAccount(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.deleteAccount(this.confirmEmail.trim());
      this.dialog().nativeElement.close();
      this.session.clear();
      this.userData.clear();
      this.toast.show(this.i18n.t('account.deleted'));
      await this.router.navigateByUrl('/app/login');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
