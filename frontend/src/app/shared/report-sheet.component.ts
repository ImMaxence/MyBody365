import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../core/api/api.service';
import { FriendsApi, ReportReason } from '../core/friends/friends-api';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { ToastService } from '../core/ui/toast.service';
import { IconComponent } from './icon.component';

/** Report a shared recipe or photo: a reason, a word, sent to the admins. */
@Component({
  selector: 'app-report-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #dlg>
      <div class="sheet-grip"></div>
      <form class="stack" (ngSubmit)="send()">
        <div>
          <h2 class="h3">{{ 'friends.report.title' | t }}</h2>
          <p class="small muted">{{ 'friends.report.text' | t }}</p>
        </div>
        <span class="label">{{ 'friends.report.reason' | t }}</span>
        <div class="reasons" role="radiogroup" [attr.aria-label]="'friends.report.reason' | t">
          @for (r of reasons; track r) {
            <button type="button" role="radio" class="chip" [class.chip-accent]="reason() === r" [attr.aria-checked]="reason() === r" (click)="reason.set(r)">
              {{ 'friends.report.reasons.' + r | t }}
            </button>
          }
        </div>
        <div class="field">
          <label class="label" for="rp-comment">{{ 'friends.report.comment' | t }}</label>
          <textarea class="textarea" id="rp-comment" name="comment" rows="3" maxlength="500" [(ngModel)]="comment"></textarea>
        </div>
        <button type="submit" class="btn btn-danger btn-block" [disabled]="busy()"><app-icon name="flag" /> {{ 'friends.report.send' | t }}</button>
        <button type="button" class="btn btn-ghost btn-block" (click)="dlg.close()">{{ 'common.cancel' | t }}</button>
      </form>
    </dialog>
  `,
  styles: `
    .reasons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .reasons .chip {
      cursor: pointer;
    }
  `,
})
export class ReportSheetComponent {
  private readonly api = inject(FriendsApi);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly reasons: ReportReason[] = ['INAPPROPRIATE', 'ILLEGAL', 'SPAM', 'OTHER'];
  protected readonly reason = signal<ReportReason>('INAPPROPRIATE');
  protected readonly busy = signal(false);
  protected comment = '';
  private target: { type: 'RECIPE' | 'PHOTO'; id: string } | null = null;

  open(type: 'RECIPE' | 'PHOTO', id: string): void {
    this.target = { type, id };
    this.reason.set('INAPPROPRIATE');
    this.comment = '';
    this.dialog().nativeElement.showModal();
  }

  protected async send(): Promise<void> {
    if (!this.target) return;
    this.busy.set(true);
    try {
      await this.api.report(this.target.type, this.target.id, this.reason(), this.comment.trim());
      this.dialog().nativeElement.close();
      this.toast.show(this.i18n.t('friends.report.sent'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
