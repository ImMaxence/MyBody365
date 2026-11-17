import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorCode } from '../../core/api/api.service';
import type { AdminUser, LinkKind } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { formatBytes } from '../../core/photos/image-tools';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarImgComponent } from '../../shared/avatar-img.component';
import { IconComponent } from '../../shared/icon.component';
import { AdminStore } from './admin.store';
import { LinkSheetComponent } from './link-sheet.component';

/** Every account with its role and sign-in methods; actions in a bottom sheet. */
@Component({
  selector: 'app-admin-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarImgComponent, FormsModule, TranslatePipe, IconComponent, LinkSheetComponent],
  template: `
    <div class="row tools">
      <label class="search">
        <app-icon name="search" [size]="18" />
        <span class="sr-only">{{ 'admin.users.search' | t }}</span>
        <input type="search" [placeholder]="'admin.users.search' | t" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </label>
      <button type="button" class="icon-btn add" (click)="addDialog.showModal()" [attr.aria-label]="'admin.users.add' | t">
        <app-icon name="userPlus" />
      </button>
    </div>

    @if (users(); as list) {
      <div class="list">
        @for (u of filtered(); track u.id) {
          <button type="button" class="list-item" (click)="open(u)">
            <span class="avatar"><app-avatar-img [src]="u.avatarUrl" [name]="u.displayName" /></span>
            <span class="list-body">
              <span class="list-title">
                {{ u.displayName }}
                @if (u.self) {
                  <span class="you">· {{ 'admin.users.you' | t }}</span>
                }
              </span>
              <span class="list-sub">{{ u.email }}</span>
              <span class="badges">
                <span class="chip" [class.chip-cool]="u.role === 'ADMIN'">{{ (u.role === 'ADMIN' ? 'admin.users.roleAdmin' : 'admin.users.roleUser') | t }}</span>
                @if (u.status === 'SUSPENDED') {
                  <span class="chip chip-danger">{{ 'admin.users.suspended' | t }}</span>
                }
                @if (u.google.linked) {
                  <span class="chip">G</span>
                }
                @if (u.passkeys > 0) {
                  <span class="chip"><app-icon name="fingerprint" /> {{ u.passkeys }}</span>
                }
                @if (!u.lastLoginAt) {
                  <span class="chip chip-warning">{{ 'admin.users.pending' | t }}</span>
                }
              </span>
            </span>
            <app-icon name="chevronRight" />
          </button>
        }
      </div>
    } @else {
      <div class="skeleton" style="height: 240px"></div>
    }

    <dialog class="sheet" #userDialog (close)="selected.set(null)">
      <div class="sheet-grip"></div>
      @if (selected(); as u) {
        <div class="stack">
          <div class="row">
            <span class="avatar">{{ u.displayName.charAt(0).toUpperCase() }}</span>
            <div class="grow">
              <h2 class="h3">{{ u.displayName }}</h2>
              <p class="small muted ellipsis">{{ u.email }}</p>
            </div>
          </div>
          <dl class="facts">
            <div>
              <dt>{{ 'admin.users.methods' | t }}</dt>
              <dd>
                @if (u.google.linked) {
                  {{ 'admin.users.google' | t }} ({{ u.google.email }})
                }
                @if (u.google.linked && u.passkeys) {
                  ·
                }
                @if (u.passkeys) {
                  {{ 'admin.users.passkeys' | t: { n: u.passkeys } }}
                }
                @if (!u.google.linked && !u.passkeys) {
                  {{ 'admin.users.noMethod' | t }}
                }
              </dd>
            </div>
            <div>
              <dt>{{ 'admin.users.lastLoginTitle' | t }}</dt>
              <dd>
                @if (u.lastLoginAt) {
                  {{ i18n.dateTime(u.lastLoginAt) }} · {{ 'admin.users.lastLoginMethod.' + u.lastLoginMethod | t }}
                } @else {
                  {{ 'admin.users.never' | t }}
                }
              </dd>
            </div>
            <div>
              <dt>{{ 'admin.users.created' | t: { date: '' } }}</dt>
              <dd>{{ i18n.date(u.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }) }}</dd>
            </div>
            <div>
              <dt>RGPD</dt>
              <dd>{{ (u.onboarded ? 'admin.users.onboarded' : 'admin.users.notOnboarded') | t }}</dd>
            </div>
            <div>
              <dt>{{ 'admin.users.storage' | t }}</dt>
              <dd class="quota">
                <span>{{ 'admin.users.storageUsed' | t: { used: bytes(u.storageUsedBytes) } }}</span>
                <select class="select" [attr.aria-label]="'admin.users.quota' | t" [value]="u.storageQuotaMb ?? -1" (change)="setQuota(u, +$any($event.target).value)">
                  <option [value]="-1">{{ 'admin.users.quotaDefault' | t: { quota: bytes(u.defaultQuotaMb * 1048576) } }}</option>
                  @for (q of quotas; track q) {
                    <option [value]="q">{{ bytes(q * 1048576) }}</option>
                  }
                </select>
              </dd>
            </div>
            @if (u.activeLink) {
              <div>
                <dt><app-icon name="link" [size]="14" /></dt>
                <dd>{{ 'admin.users.activeLink' | t: { date: i18n.dateTime(u.activeLink.expiresAt) } }}</dd>
              </div>
            }
          </dl>

          @if (u.envAdmin) {
            <p class="notice"><app-icon name="lock" /> {{ 'admin.users.envAdmin' | t }} — {{ 'admin.users.envAdminHint' | t }}</p>
          }

          <div class="list actions">
            <button type="button" class="list-item" (click)="link(u, u.lastLoginAt ? 'RECOVERY' : 'INVITE')" [disabled]="u.status === 'SUSPENDED'">
              <span class="list-icon"><app-icon name="link" /></span>
              <span class="list-body"><span class="list-title">{{ (u.lastLoginAt ? 'admin.users.recovery' : 'admin.users.invite') | t }}</span></span>
            </button>
            @if (!u.envAdmin && !u.self) {
              <button type="button" class="list-item" (click)="toggleRole(u)">
                <span class="list-icon"><app-icon name="shield" /></span>
                <span class="list-body"><span class="list-title">{{ (u.role === 'ADMIN' ? 'admin.users.makeUser' : 'admin.users.makeAdmin') | t }}</span></span>
              </button>
              <button type="button" class="list-item" (click)="toggleStatus(u)">
                <span class="list-icon"><app-icon [name]="u.status === 'ACTIVE' ? 'ban' : 'refresh'" /></span>
                <span class="list-body"><span class="list-title">{{ (u.status === 'ACTIVE' ? 'admin.users.suspend' : 'admin.users.reactivate') | t }}</span></span>
              </button>
            }
            <button type="button" class="list-item" (click)="endSessions(u)">
              <span class="list-icon"><app-icon name="logout" /></span>
              <span class="list-body"><span class="list-title">{{ 'admin.users.endSessions' | t }}</span></span>
            </button>
            @if (!u.envAdmin && !u.self) {
              <button type="button" class="list-item danger" (click)="remove(u)">
                <span class="list-icon"><app-icon name="trash" /></span>
                <span class="list-body"><span class="list-title">{{ 'admin.users.remove' | t }}</span></span>
              </button>
            }
          </div>
          <button type="button" class="btn btn-ghost btn-block" (click)="userDialog.close()">{{ 'common.close' | t }}</button>
        </div>
      }
    </dialog>

    <dialog class="sheet" #addDialog>
      <div class="sheet-grip"></div>
      <form class="stack" (ngSubmit)="create()" #f="ngForm">
        <h2 class="h3">{{ 'admin.users.add' | t }}</h2>
        <p class="small muted">{{ 'admin.users.addText' | t }}</p>
        <div class="field">
          <label for="au-email">{{ 'admin.users.email' | t }}</label>
          <input id="au-email" class="input" type="email" name="email" required maxlength="254" [(ngModel)]="newEmail" />
        </div>
        <div class="field">
          <label for="au-name">{{ 'admin.users.name' | t }}</label>
          <input id="au-name" class="input" name="name" maxlength="80" [(ngModel)]="newName" />
        </div>
        <button type="submit" class="btn btn-primary btn-block" [disabled]="f.invalid || busy()">{{ 'admin.users.create' | t }}</button>
        <button type="button" class="btn btn-ghost btn-block" (click)="addDialog.close()">{{ 'common.cancel' | t }}</button>
      </form>
    </dialog>

    <app-link-sheet [link]="store.freshLink()" (closed)="store.freshLink.set(null)" />
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
    }
    .tools {
      gap: var(--space-2);
    }
    .search {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      padding: 0 14px;
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--line);
      color: var(--fg-3);
    }
    .search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      outline: none;
      font-size: 16px;
      color: var(--fg);
    }
    .search:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-soft);
    }
    .add {
      background: var(--flame);
      color: var(--accent-ink);
    }
    .you {
      color: var(--fg-3);
      font-weight: 500;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    .badges .chip {
      min-height: 22px;
      padding: 0 8px;
      font-size: 11px;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .ellipsis {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .facts {
      display: grid;
      gap: 10px;
      padding: var(--space-4);
      border-radius: var(--radius-m);
      background: var(--surface-2);
      font-size: var(--fs-s);
    }
    /* both columns can shrink: a long address wraps, the quota select stays inside the card */
    .facts div {
      display: grid;
      grid-template-columns: minmax(0, 7.5rem) minmax(0, 1fr);
      gap: 10px;
    }
    .facts dt {
      color: var(--fg-3);
      font-weight: 600;
    }
    .facts dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .facts .quota {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .facts .quota .select {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      min-height: 40px;
      padding-block: 6px;
    }
    /* a narrow phone: the label above its value */
    @media (max-width: 360px) {
      .facts div {
        grid-template-columns: minmax(0, 1fr);
        gap: 2px;
      }
    }
    .actions .list-item:disabled {
      opacity: 0.5;
    }
    .actions .danger {
      color: var(--danger);
    }
    .actions .danger .list-icon {
      background: var(--danger-soft);
      color: var(--danger);
    }
  `,
})
export class AdminUsersTab {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly store = inject(AdminStore);
  private readonly addRef = viewChild.required<ElementRef<HTMLDialogElement>>('addDialog');
  private readonly userDialog = viewChild.required<ElementRef<HTMLDialogElement>>('userDialog');

  protected readonly users = signal<AdminUser[] | null>(null);
  protected readonly query = signal('');
  protected readonly selected = signal<AdminUser | null>(null);
  protected readonly busy = signal(false);
  protected newEmail = '';
  protected newName = '';

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.users() ?? [];
    return q ? list.filter((u) => u.email.includes(q) || u.displayName.toLowerCase().includes(q)) : list;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.users.set(await this.api.adminUsers());
    } catch (e) {
      this.fail(e);
    }
  }

  protected open(u: AdminUser): void {
    this.selected.set(u);
    this.userDialog().nativeElement.showModal();
  }

  private replace(u: AdminUser): void {
    this.users.update((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)));
    if (this.selected()?.id === u.id) this.selected.set(u);
  }

  protected async link(u: AdminUser, kind: LinkKind): Promise<void> {
    try {
      const link = await this.api.adminCreateLink(u.id, kind);
      this.userDialog().nativeElement.close();
      this.store.freshLink.set({ ...link, userName: u.displayName });
      void this.load();
      void this.store.refreshSummary();
    } catch (e) {
      this.fail(e);
    }
  }

  protected readonly quotas = [100, 250, 500, 1024, 2048, 5120, 10240];

  protected bytes(n: number): string {
    return formatBytes(n, this.i18n.lang());
  }

  protected async setQuota(u: AdminUser, mb: number): Promise<void> {
    try {
      this.replace(await this.api.adminUpdateUser(u.id, { storageQuotaMb: mb }));
      this.toast.show(this.i18n.t('admin.users.quotaSaved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async toggleRole(u: AdminUser): Promise<void> {
    try {
      this.replace(await this.api.adminUpdateUser(u.id, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' }));
      void this.store.refreshSummary();
    } catch (e) {
      this.fail(e);
    }
  }

  protected async toggleStatus(u: AdminUser): Promise<void> {
    if (u.status === 'ACTIVE' && !confirm(this.i18n.t('admin.users.suspendConfirm', { email: u.email }))) return;
    try {
      this.replace(await this.api.adminUpdateUser(u.id, { status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }));
    } catch (e) {
      this.fail(e);
    }
  }

  protected async endSessions(u: AdminUser): Promise<void> {
    try {
      const { ended } = await this.api.adminEndSessions(u.id);
      this.toast.show(this.i18n.t('admin.users.sessionsEnded', { n: ended }));
    } catch (e) {
      this.fail(e);
    }
  }

  protected async remove(u: AdminUser): Promise<void> {
    if (!confirm(this.i18n.t('admin.users.removeConfirm', { email: u.email }))) return;
    try {
      await this.api.adminDeleteUser(u.id);
      this.userDialog().nativeElement.close();
      this.users.update((list) => (list ?? []).filter((x) => x.id !== u.id));
      void this.store.refreshSummary();
    } catch (e) {
      this.fail(e);
    }
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      const { user, link } = await this.api.adminCreateUser(this.newEmail.trim(), this.newName.trim());
      this.addRef().nativeElement.close();
      this.newEmail = '';
      this.newName = '';
      this.users.update((list) => [...(list ?? []), user]);
      this.store.freshLink.set(link);
      void this.store.refreshSummary();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown): void {
    this.toast.error(this.i18n.error(errorCode(e)));
  }
}
