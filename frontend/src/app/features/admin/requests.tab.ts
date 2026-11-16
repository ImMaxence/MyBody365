import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiService, errorCode } from '../../core/api/api.service';
import type { AdminRequest } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { AdminStore } from './admin.store';
import { LinkSheetComponent } from './link-sheet.component';

/** Access and recovery requests of the sign-in screen: approve (a link is made) or reject. */
@Component({
  selector: 'app-admin-requests',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, LinkSheetComponent],
  template: `
    @if (pending(); as list) {
      @if (list.length) {
        @for (r of list; track r.id) {
          <article class="card req">
            <div class="row top">
              <span class="chip" [class.chip-accent]="r.kind === 'NEW_ACCESS'" [class.chip-warning]="r.kind === 'LOST_ACCESS'">
                <app-icon [name]="r.kind === 'NEW_ACCESS' ? 'userPlus' : 'key'" /> {{ 'admin.requests.' + r.kind | t }}
              </span>
              <span class="spacer"></span>
              <span class="tiny faint">{{ 'admin.requests.received' | t: { date: i18n.relative(r.createdAt) } }}</span>
            </div>
            <h3 class="name">{{ r.name }}</h3>
            <p class="small muted email">{{ r.email }}</p>
            @if (r.existingUser) {
              <span class="chip chip-cool"><app-icon name="user" /> {{ 'admin.requests.existing' | t }}</span>
            }
            @if (r.message) {
              <blockquote>{{ r.message }}</blockquote>
            }
            <div class="row actions">
              <button type="button" class="btn btn-secondary btn-s" (click)="reject(r)" [disabled]="busy() === r.id">
                <app-icon name="x" /> {{ 'admin.requests.reject' | t }}
              </button>
              <button type="button" class="btn btn-primary btn-s grow" (click)="approve(r)" [disabled]="busy() === r.id">
                <app-icon name="check" /> {{ 'admin.requests.approve' | t }}
              </button>
            </div>
          </article>
        }
      } @else {
        <div class="card empty">
          <span class="empty-icon"><app-icon name="inbox" /></span>
          <p><strong>{{ 'admin.requests.empty' | t }}</strong></p>
          <p class="small">{{ 'admin.requests.emptyHint' | t }}</p>
        </div>
      }
    } @else {
      <div class="skeleton" style="height: 180px"></div>
    }

    @if (decided().length) {
      <h2 class="section-title">{{ 'admin.requests.history' | t }}</h2>
      <div class="list">
        @for (r of decided(); track r.id) {
          <div class="list-item">
            <span class="list-icon" [class.ok]="r.status === 'APPROVED'"><app-icon [name]="r.status === 'APPROVED' ? 'check' : 'x'" /></span>
            <span class="list-body">
              <span class="list-title">{{ r.name }} · {{ r.email }}</span>
              <span class="list-sub">
                {{ 'admin.requests.decided' | t: { status: ('admin.requests.' + r.status | t), by: r.decidedBy ?? '—', date: i18n.date(r.decidedAt) } }}
              </span>
            </span>
          </div>
        }
      </div>
    }

    <app-link-sheet [link]="store.freshLink()" (closed)="store.freshLink.set(null)" />
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .req {
      display: grid;
      gap: 8px;
      justify-items: start;
    }
    .top {
      width: 100%;
    }
    .name {
      font-size: var(--fs-l);
      font-weight: 700;
    }
    .email {
      margin-top: -6px;
      word-break: break-all;
    }
    blockquote {
      width: 100%;
      margin: 0;
      padding: 10px 14px;
      border-left: 3px solid var(--accent);
      border-radius: 0 var(--radius-s) var(--radius-s) 0;
      background: var(--surface-2);
      font-size: var(--fs-s);
      color: var(--fg-2);
      white-space: pre-wrap;
    }
    .actions {
      width: 100%;
      margin-top: 6px;
    }
    .grow {
      flex: 1;
    }
    .list-icon.ok {
      background: var(--success-soft);
      color: var(--success);
    }
  `,
})
export class AdminRequestsTab {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly store = inject(AdminStore);

  protected readonly pending = signal<AdminRequest[] | null>(null);
  protected readonly decided = signal<AdminRequest[]>([]);
  protected readonly busy = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [pending, decided] = await Promise.all([this.api.adminRequests('PENDING'), this.api.adminRequests('DECIDED')]);
      this.pending.set(pending);
      this.decided.set(decided);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async approve(r: AdminRequest): Promise<void> {
    this.busy.set(r.id);
    try {
      const decision = await this.api.adminApprove(r.id);
      this.store.freshLink.set({ ...decision.link, userName: r.name });
      await this.load();
      void this.store.refreshSummary();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(null);
    }
  }

  protected async reject(r: AdminRequest): Promise<void> {
    this.busy.set(r.id);
    try {
      await this.api.adminReject(r.id);
      await this.load();
      void this.store.refreshSummary();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(null);
    }
  }
}
