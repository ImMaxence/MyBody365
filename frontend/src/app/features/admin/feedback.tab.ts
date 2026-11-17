import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Feedback, SupportApi, TodoStore } from '../../core/support/support-api';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';
import { AdminStore } from './admin.store';

const KIND_ICON = { IDEA: 'bulb', BUG: 'alert', OTHER: 'mail' } as const;

/** What the members wrote from their profile (ideas, bugs): read, answer by e-mail, archive. */
@Component({
  selector: 'app-admin-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, TranslatePipe, IconComponent],
  template: `
    <div class="seg" appSeg role="group" [attr.aria-label]="'adminSupport.feedbackTitle' | t">
      <button type="button" [attr.aria-pressed]="!archived()" (click)="show(false)">{{ 'adminSupport.open' | t }}</button>
      <button type="button" [attr.aria-pressed]="archived()" (click)="show(true)">{{ 'adminSupport.archived' | t }}</button>
    </div>
    @if (items(); as list) {
      @for (f of list; track f.id) {
        <article class="card fb">
          <header class="fb-head">
            <span class="chip" [class.chip-danger]="f.kind === 'BUG'" [class.chip-accent]="f.kind === 'IDEA'">
              <app-icon [name]="kindIcon[f.kind]" /> {{ 'feedback.kinds.' + f.kind | t }}
            </span>
            <span class="tiny muted">{{ i18n.dateTime(f.createdAt) }}</span>
          </header>
          <p class="msg">{{ f.message }}</p>
          <p class="tiny muted">
            {{ f.userName ?? ('adminSupport.unknown' | t) }}@if (f.userEmail) { · {{ f.userEmail }} }@if (f.appVersion) { · v{{ f.appVersion }} }
          </p>
          @if (f.device) {
            <p class="tiny faint ua">{{ f.device }}</p>
          }
          <div class="row">
            @if (f.userEmail) {
              <a class="btn btn-secondary btn-s" [href]="'mailto:' + f.userEmail + '?subject=MyBody365'"><app-icon name="mail" [size]="16" /> {{ 'adminSupport.reply' | t }}</a>
            }
            @if (!f.archivedAt) {
              <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="archive(f)"><app-icon name="archive" [size]="16" /> {{ 'adminSupport.archive' | t }}</button>
            }
          </div>
        </article>
      } @empty {
        <div class="empty">
          <span class="empty-icon"><app-icon name="inbox" /></span>
          <p class="small">{{ (archived() ? 'adminSupport.noArchivedFeedback' : 'adminSupport.noFeedback') | t }}</p>
        </div>
      }
    } @else {
      <div class="skeleton" style="height: 140px; border-radius: 20px"></div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .fb {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
    }
    .fb-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .msg {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .ua {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class AdminFeedbackTab {
  private readonly api = inject(SupportApi);
  private readonly store = inject(AdminStore);
  private readonly todo = inject(TodoStore);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly kindIcon = KIND_ICON;
  protected readonly items = signal<Feedback[] | null>(null);
  protected readonly archived = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    void this.show(false);
  }

  protected async show(archived: boolean): Promise<void> {
    this.archived.set(archived);
    this.items.set(null);
    try {
      this.items.set(await this.api.feedback(archived));
    } catch (e) {
      this.items.set([]);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async archive(f: Feedback): Promise<void> {
    this.busy.set(true);
    try {
      this.items.set(await this.api.archiveFeedback(f.id));
      void this.store.refreshSummary();
      void this.todo.refresh();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
