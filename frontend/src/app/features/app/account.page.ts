import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService, Lang } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { UserDataService } from '../../core/user-data.service';
import { prepareImage } from '../../core/photos/image-tools';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { CURRENT_VERSION } from '../changelog/changelog.data';
import { SegDirective } from '../../shared/seg.directive';
import { FlagComponent } from '../../shared/flag.component';
import { normalizeUsername } from '../../core/friends/friends-api';
import { PushPromptComponent } from '../../shared/push-prompt.component';

@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PushPromptComponent, SegDirective, FlagComponent, FormsModule, RouterLink, TranslatePipe, IconComponent],
  template: `
    <main class="page">
      <header class="page-head"><h1 class="title">{{ 'account.title' | t }}</h1></header>

      <section class="who card">
        <button type="button" class="avatar big avatar-btn" [class.busy]="photoBusy()" [attr.aria-label]="'account.photoChange' | t" (click)="photoDialog.showModal()">
          @if (account()?.avatarUrl; as src) {
            @for (s of [src]; track s) {
              <img [src]="s" alt="" referrerpolicy="no-referrer" width="64" height="64" />
            }
          } @else {
            {{ initial() }}
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

      <h2 class="section-title">{{ 'account.appearance' | t }}</h2>
      <div class="seg" role="group" [attr.aria-label]="'theme.label' | t">
        @for (m of modes; track m.mode) {
          <button type="button" [attr.aria-pressed]="theme.mode() === m.mode" (click)="theme.set(m.mode, $any($event.currentTarget))">
            <app-icon [name]="m.icon" /> {{ 'theme.' + m.mode | t }}
          </button>
        }
      </div>

      <h2 class="section-title">{{ 'account.language' | t }}</h2>
      <div class="seg" role="group" [attr.aria-label]="'account.language' | t">
        <button type="button" lang="fr" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="setLang('fr')"><app-flag lang="fr" /> Français</button>
        <button type="button" lang="en" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="setLang('en')"><app-flag lang="en" /> English</button>
      </div>

      <h2 class="section-title">{{ 'water.settings' | t }}</h2>
      <div class="water-set">
        <label class="check">
          <input type="checkbox" name="water" [checked]="!!account()?.waterGoal" [disabled]="busy()" (change)="toggleWater($any($event.target).checked)" />
          <span><b>{{ 'water.toggle' | t }}</b><span class="small muted">{{ 'water.toggleHint' | t }}</span></span>
        </label>
        @if (account()?.waterGoal; as g) {
          <div class="water-goal card">
            <span class="small"><b>{{ 'water.goal' | t }}</b><br /><span class="muted">{{ 'water.goalValue' | t: { n: g, l: i18n.number(g * 0.25, 2) } }}</span></span>
            <div class="mini-stepper">
              <button type="button" class="icon-btn" [disabled]="g <= 1 || busy()" [attr.aria-label]="'water.goalLess' | t" (click)="setWaterGoal(g - 1)"><app-icon name="minus" [size]="18" /></button>
              <span class="num">{{ g }}</span>
              <button type="button" class="icon-btn" [disabled]="g >= 30 || busy()" [attr.aria-label]="'water.goalMore' | t" (click)="setWaterGoal(g + 1)"><app-icon name="plus" [size]="18" /></button>
            </div>
          </div>
        }
      </div>

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
        <a routerLink="/app/account/notifications" class="list-item">
          <span class="list-icon"><app-icon name="bell" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'engage.notifications.title' | t }}</span>
            <span class="list-sub">{{ 'engage.notifications.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/friends" class="list-item">
          <span class="list-icon"><app-icon name="users" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'friends.title' | t }}</span>
            <span class="list-sub">{{ 'friends.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/timer" class="list-item">
          <span class="list-icon"><app-icon name="dumbbell" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'engage.timer.title' | t }}</span>
            <span class="list-sub">{{ 'engage.timer.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/account/backup" class="list-item">
          <span class="list-icon"><app-icon name="archive" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'backup.title' | t }}</span>
            <span class="list-sub">{{ 'backup.sub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/account/security" class="list-item">
          <span class="list-icon"><app-icon name="key" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'account.security' | t }}</span>
            <span class="list-sub">{{ 'account.securitySub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        @if (session.isAdmin()) {
          <a routerLink="/app/admin" class="list-item">
            <span class="list-icon admin"><app-icon name="shield" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'account.admin' | t }}</span>
              <span class="list-sub">{{ 'account.adminSub' | t }}</span>
            </span>
            <app-icon name="chevronRight" />
          </a>
        }
        <a routerLink="/changelog" class="list-item">
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
            @if (account()?.avatarUrl; as src) {
              <img [src]="src" alt="" referrerpolicy="no-referrer" width="96" height="96" />
            } @else {
              {{ initial() }}
            }
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
    .avatar-btn:active {
      transform: scale(0.94);
    }
    .avatar-btn img {
      border-radius: 50%;
      animation: photo-in 420ms var(--ease-out) both;
    }
    .avatar-btn.busy img {
      opacity: 0.5;
    }
    @keyframes photo-in {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
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
    .avatar.huge img {
      border-radius: 50%;
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
    .handle:hover {
      background: var(--accent-soft);
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
    .list-icon.admin {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .danger-text {
      color: var(--danger);
    }
    .water-set {
      display: grid;
      gap: var(--space-2);
    }
    .water-goal {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      animation: hint-in 300ms var(--ease-out) both;
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
    @keyframes hint-in {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
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
  private readonly usernameSheet = viewChild.required<ElementRef<HTMLDialogElement>>('usernameDialog');
  protected readonly photoBusy = signal(false);
  protected usernameDraft = '';
  protected readonly usernameError = signal<string | null>(null);

  protected readonly account = this.session.account;
  protected readonly initial = computed(() => (this.account()?.displayName ?? '?').charAt(0).toUpperCase());
  protected readonly prefix = computed(() => (this.i18n.lang() === 'en' ? '/en' : ''));
  protected readonly modes: { mode: ThemeMode; icon: string }[] = [
    { mode: 'system', icon: 'contrast' },
    { mode: 'light', icon: 'sun' },
    { mode: 'dark', icon: 'moon' },
  ];
  protected readonly version = CURRENT_VERSION;

  constructor() {
    if (!this.tracking.summary()) void this.tracking.load();
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

  /** on: a goal from the weight (about 33 ml per kg, 6 to 12 glasses); off: no goal */
  protected async toggleWater(on: boolean): Promise<void> {
    const kg = this.tracking.summary()?.current?.weightKg ?? 70;
    const goal = on ? Math.min(12, Math.max(6, Math.round((kg * 0.033) / 0.25))) : 0;
    await this.patch({ waterGoal: goal });
  }

  protected setWaterGoal(n: number): Promise<void> {
    return this.patch({ waterGoal: n });
  }

  protected setDiscoverable(on: boolean): Promise<void> {
    return this.patch({ discoverable: on });
  }

  private async patch(p: { waterGoal?: number; discoverable?: boolean }): Promise<void> {
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

  protected async setLang(lang: Lang): Promise<void> {
    this.i18n.set(lang, true);
    try {
      this.session.setAccount(await this.api.updateMe({ locale: lang }));
    } catch {
      /* kept on this device anyway */
    }
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
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
