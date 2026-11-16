import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, viewChild } from '@angular/core';
import type { AdminLink } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** Shows a freshly made invitation / recovery link once, with copy and the phone's share sheet. */
@Component({
  selector: 'app-link-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #dlg (close)="closed.emit()">
      <div class="sheet-grip"></div>
      @if (link(); as l) {
        <div class="stack">
          <span class="badge"><app-icon [name]="l.kind === 'INVITE' ? 'sparkles' : 'key'" /></span>
          <h2 class="h3">{{ 'admin.link.title' | t }}</h2>
          <p class="small muted">
            {{ 'admin.link.text' | t: { name: l.userName || l.userEmail || '', date: i18n.dateTime(l.expiresAt) } }}
          </p>
          <code class="url">{{ l.url }}</code>
          <button type="button" class="btn btn-primary btn-block" (click)="copy(l)"><app-icon name="copy" /> {{ 'admin.link.copy' | t }}</button>
          @if (canShare) {
            <button type="button" class="btn btn-secondary btn-block" (click)="share(l)"><app-icon name="share" /> {{ 'admin.link.share' | t }}</button>
          }
          <button type="button" class="btn btn-ghost btn-block" (click)="dlg.close()">{{ 'common.close' | t }}</button>
        </div>
      }
    </dialog>
  `,
  styles: `
    .badge {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border-radius: 16px;
      background: var(--flame);
      color: var(--accent-ink);
    }
    .url {
      display: block;
      padding: 14px;
      border-radius: var(--radius-s);
      background: var(--surface-3);
      font-size: 13px;
      word-break: break-all;
      user-select: all;
    }
  `,
})
export class LinkSheetComponent {
  readonly link = input<AdminLink | null>(null);
  readonly closed = output<void>();

  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  constructor() {
    effect(() => {
      const dlg = this.dialog().nativeElement;
      if (this.link()?.url && !dlg.open) dlg.showModal();
    });
  }

  protected async copy(l: AdminLink): Promise<void> {
    try {
      await navigator.clipboard.writeText(l.url ?? '');
      this.toast.show(this.i18n.t('common.copied'));
    } catch {
      this.toast.error(this.i18n.t('errors.generic'));
    }
  }

  protected async share(l: AdminLink): Promise<void> {
    try {
      await navigator.share({ title: 'MyBody365', text: this.i18n.t('admin.link.shareText'), url: l.url });
    } catch {
      /* cancelled */
    }
  }
}
