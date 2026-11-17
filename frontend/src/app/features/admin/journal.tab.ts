import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiService, errorCode } from '../../core/api/api.service';
import type { AuditLine } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

const ICON: Record<string, string> = {
  USER_CREATED: 'userPlus',
  USER_ROLE_CHANGED: 'shield',
  USER_SUSPENDED: 'ban',
  USER_REACTIVATED: 'refresh',
  USER_DELETED: 'trash',
  USER_SESSIONS_ENDED: 'logout',
  ACCESS_APPROVED: 'check',
  ACCESS_REJECTED: 'x',
  LINK_CREATED: 'link',
  LINK_REVOKED: 'link',
};

/** What the admins did, newest first. */
@Component({
  selector: 'app-admin-journal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <p class="small muted intro">{{ 'admin.journal.intro' | t }}</p>
    @if (lines(); as list) {
      @if (list.length) {
        <ol class="timeline" role="list">
          @for (a of list; track a.id) {
            <li>
              <span class="dot"><app-icon [name]="icon(a.action)" [size]="16" /></span>
              <div class="body">
                <p class="small">
                  <strong>{{ a.actorEmail }}</strong>
                  {{ 'admin.journal.actions.' + a.action | t }}
                  @if (a.targetLabel) {
                    <strong>{{ a.targetLabel }}</strong>
                  }
                  @if (a.details) {
                    <span class="faint">({{ a.details }})</span>
                  }
                </p>
                <p class="tiny faint">{{ i18n.dateTime(a.createdAt) }}@if (a.ip) { · {{ a.ip }}}</p>
              </div>
            </li>
          }
        </ol>
        @if (more()) {
          <button type="button" class="btn btn-secondary btn-block" (click)="next()">{{ 'admin.journal.more' | t }}</button>
        }
      } @else {
        <div class="card empty">
          <span class="empty-icon"><app-icon name="list" /></span>
          <p>{{ 'admin.journal.empty' | t }}</p>
        </div>
      }
    } @else {
      <div class="skeleton" style="height: 240px"></div>
    }
  `,
  styles: `
    .intro {
      margin: 0;
    }
    :host {
      display: grid;
      gap: var(--space-4);
    }
    .timeline {
      display: grid;
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--surface);
      border: 1px solid var(--line);
    }
    li {
      position: relative;
      display: grid;
      grid-template-columns: 32px 1fr;
      gap: 12px;
      padding-bottom: var(--space-4);
    }
    li:not(:last-child)::before {
      content: '';
      position: absolute;
      left: 15px;
      top: 32px;
      bottom: 0;
      width: 2px;
      background: var(--line);
    }
    .dot {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--surface-3);
    }
    .body {
      display: grid;
      gap: 2px;
      padding-top: 5px;
      min-width: 0;
      word-break: break-word;
    }
  `,
})
export class AdminJournalTab {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly lines = signal<AuditLine[] | null>(null);
  protected readonly more = signal(false);

  constructor() {
    void this.next();
  }

  protected icon(action: string): string {
    return ICON[action] ?? 'info';
  }

  protected async next(): Promise<void> {
    const current = this.lines() ?? [];
    try {
      const page = await this.api.adminAudit(current.at(-1)?.id);
      this.lines.set([...current, ...page]);
      this.more.set(page.length === 50);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
