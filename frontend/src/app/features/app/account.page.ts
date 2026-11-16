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
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { CURRENT_VERSION } from '../changelog/changelog.data';

@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslatePipe, IconComponent],
  template: `
    <main class="page">
      <header class="page-head"><h1 class="title">{{ 'account.title' | t }}</h1></header>

      <section class="who card">
        <span class="avatar big">
          @if (account()?.avatarUrl; as src) {
            <img [src]="src" alt="" referrerpolicy="no-referrer" width="64" height="64" />
          } @else {
            {{ initial() }}
          }
        </span>
        <div class="who-text">
          <form class="name-form" (ngSubmit)="saveName()">
            <label class="sr-only" for="acc-name">{{ 'account.displayName' | t }}</label>
            <input id="acc-name" class="name-input" name="displayName" maxlength="40" [(ngModel)]="name" (blur)="saveName()" />
          </form>
          <span class="small muted ellipsis">{{ account()?.email }}</span>
          @if (session.isAdmin()) {
            <span class="chip chip-cool"><app-icon name="shield" /> {{ 'account.roleAdmin' | t }}</span>
          }
        </div>
      </section>

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
        <button type="button" lang="fr" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="setLang('fr')">Français</button>
        <button type="button" lang="en" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="setLang('en')">English</button>
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
        <a routerLink="/app/workouts" class="list-item">
          <span class="list-icon"><app-icon name="dumbbell" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'engage.workouts.title' | t }}</span>
            <span class="list-sub">{{ 'engage.workouts.sub' | t }}</span>
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
