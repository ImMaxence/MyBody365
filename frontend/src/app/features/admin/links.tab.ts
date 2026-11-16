import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApiService, errorCode } from '../../core/api/api.service';
import type { AdminLink } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { AdminStore } from './admin.store';

/** The last invitation / recovery links; active ones can be revoked at any time. */
@Component({
  selector: 'app-admin-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (links(); as list) {
      @if (list.length) {
        <div class="list">
          @for (l of list; track l.id) {
            <div class="list-item">
              <span class="list-icon" [class.live]="l.state === 'ACTIVE'"><app-icon [name]="l.kind === 'INVITE' ? 'sparkles' : 'key'" /></span>
              <span class="list-body">
                <span class="list-title">{{ 'admin.links.' + l.kind | t }} · {{ l.userName || l.userEmail }}</span>
                <span class="list-sub">
                  @if (l.state === 'ACTIVE') {
                    {{ 'admin.links.expires' | t: { date: i18n.relative(l.expiresAt) } }}
                  } @else {
                    {{ i18n.dateTime(l.usedAt || l.revokedAt || l.expiresAt) }}
                  }
                  @if (l.createdBy) {
                    · {{ 'admin.links.by' | t: { email: l.createdBy } }}
                  }
                </span>
              </span>
              @if (l.state === 'ACTIVE') {
                <button type="button" class="btn btn-danger btn-s" (click)="revoke(l)">{{ 'admin.links.revoke' | t }}</button>
              } @else {
                <span class="chip" [class.chip-success]="l.state === 'USED'">{{ 'admin.links.states.' + l.state | t }}</span>
              }
            </div>
          }
        </div>
      } @else {
        <div class="card empty">
          <span class="empty-icon"><app-icon name="link" /></span>
          <p>{{ 'admin.links.empty' | t }}</p>
        </div>
      }
    } @else {
      <div class="skeleton" style="height: 200px"></div>
    }
  `,
  styles: `
    .list-icon.live {
      background: var(--flame);
      color: var(--accent-ink);
    }
  `,
})
export class AdminLinksTab {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly store = inject(AdminStore);
  protected readonly i18n = inject(I18nService);
  protected readonly links = signal<AdminLink[] | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.links.set(await this.api.adminLinks());
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async revoke(l: AdminLink): Promise<void> {
    try {
      const updated = await this.api.adminRevokeLink(l.id);
      this.links.update((list) => (list ?? []).map((x) => (x.id === l.id ? { ...x, ...updated, userName: x.userName } : x)));
      this.toast.show(this.i18n.t('admin.links.revoked'));
      void this.store.refreshSummary();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
