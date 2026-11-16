import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import { FriendsApi, ModerationView, Report } from '../../core/friends/friends-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

/**
 * Reports to handle (a recipe of the community, or a photo a member shared with a friend: the only kind
 * of photo an admin ever sees, and only while the report is open), and the shared recipes.
 */
@Component({
  selector: 'app-admin-moderation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <p class="small muted">{{ 'adminModeration.intro' | t }}</p>

    <h2 class="section-title">{{ 'adminModeration.reports' | t }}</h2>
    @if (view(); as v) {
      @if (v.reports.length) {
        @for (r of v.reports; track r.id) {
          <article class="card report">
            <div class="report-head">
              @if (r.thumbUrl) {
                <img class="thumb" [src]="r.thumbUrl" alt="" />
              } @else {
                <span class="thumb empty-thumb"><app-icon [name]="r.type === 'PHOTO' ? 'image' : 'book'" /></span>
              }
              <div class="report-copy">
                <span class="chip" [class.chip-danger]="r.reason === 'ILLEGAL'">{{ 'adminModeration.reasons.' + r.reason | t }}</span>
                <b>{{ r.type === 'RECIPE' ? r.title : ('adminModeration.photo' | t) }}</b>
                <span class="small muted">{{ 'adminModeration.owner' | t: { name: (r.ownerName ?? '?') + (r.ownerEmail ? ' · ' + r.ownerEmail : '') } }}</span>
                <span class="tiny muted">{{ 'adminModeration.reportedBy' | t: { name: r.reporterName ?? '?', date: i18n.dateTime(r.createdAt) } }}</span>
              </div>
            </div>
            @if (r.comment) {
              <p class="comment small">« {{ r.comment }} »</p>
            }
            <div class="row">
              <button type="button" class="btn btn-secondary btn-s" [disabled]="busy()" (click)="dismiss(r)">{{ 'adminModeration.dismiss' | t }}</button>
              <button type="button" class="btn btn-danger btn-s" [disabled]="busy()" (click)="act(r)">
                <app-icon [name]="r.type === 'PHOTO' ? 'trash' : 'eyeOff'" [size]="16" /> {{ (r.type === 'PHOTO' ? 'adminModeration.deletePhoto' : 'adminModeration.hide') | t }}
              </button>
            </div>
          </article>
        }
      } @else {
        <p class="small muted">{{ 'adminModeration.none' | t }}</p>
      }

      <h2 class="section-title">{{ 'adminModeration.sharedRecipes' | t }}</h2>
      <div class="list">
        @for (rc of v.recipes; track rc.id) {
          <div class="list-item">
            <span class="list-body">
              <span class="list-title">{{ rc.name }}</span>
              <span class="list-sub">{{ rc.author }} · {{ rc.score }} pt</span>
            </span>
            @if (rc.hidden) {
              <span class="chip chip-warning">{{ 'adminModeration.hidden' | t }}</span>
              <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="setHidden(rc.id, false)">{{ 'adminModeration.restore' | t }}</button>
            } @else {
              <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="setHidden(rc.id, true)">{{ 'adminModeration.hideRecipe' | t }}</button>
            }
          </div>
        }
      </div>
    } @else {
      <div class="skeleton" style="height: 120px; border-radius: 20px"></div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .report {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .report-head {
      display: flex;
      gap: var(--space-3);
    }
    .thumb {
      width: 64px;
      height: 85px;
      flex: none;
      object-fit: cover;
      border-radius: 12px;
      background: var(--surface-3);
    }
    .empty-thumb {
      display: grid;
      place-items: center;
      color: var(--fg-3);
    }
    .report-copy {
      display: grid;
      gap: 3px;
      justify-items: start;
      min-width: 0;
    }
    .comment {
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .row {
      display: flex;
      gap: var(--space-2);
      justify-content: flex-end;
    }
  `,
})
export class AdminModerationTab {
  private readonly api = inject(FriendsApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly view = signal<ModerationView | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    void this.api
      .moderation()
      .then((v) => this.view.set(v))
      .catch(() => this.view.set({ reports: [], recipes: [] }));
  }

  protected dismiss(r: Report): Promise<void> {
    return this.run(() => this.api.dismiss(r.id), 'adminModeration.handled');
  }

  protected act(r: Report): Promise<void> {
    return this.run(() => this.api.act(r.id), 'adminModeration.handled');
  }

  protected setHidden(id: string, hidden: boolean): Promise<void> {
    return this.run(() => this.api.setRecipeHidden(id, hidden), hidden ? 'adminModeration.recipeHidden' : 'adminModeration.recipeRestored');
  }

  private async run(call: () => Promise<ModerationView>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      this.view.set(await call());
      this.toast.show(this.i18n.t(done));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
