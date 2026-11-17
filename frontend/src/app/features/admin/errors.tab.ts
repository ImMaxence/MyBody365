import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ErrorEntry, SupportApi, TodoStore } from '../../core/support/support-api';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';
import { AdminStore } from './admin.store';

/**
 * The errors the app ran into, on the phones and on the server, the same one counted on one line: open
 * one for its trace, archive it once handled (it comes back as a new line if it happens again).
 */
@Component({
  selector: 'app-admin-errors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, TranslatePipe, IconComponent],
  template: `
    <p class="small muted intro">{{ 'adminSupport.errorsIntro' | t }}</p>
    <div class="bar">
      <div class="seg" appSeg role="group" [attr.aria-label]="'adminSupport.errorsTitle' | t">
        <button type="button" [attr.aria-pressed]="!archived()" (click)="show(false)">{{ 'adminSupport.open' | t }}</button>
        <button type="button" [attr.aria-pressed]="archived()" (click)="show(true)">{{ 'adminSupport.archived' | t }}</button>
      </div>
      @if (!archived() && items()?.length) {
        <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="archiveAll()"><app-icon name="archive" [size]="16" /> {{ 'adminSupport.archiveAll' | t }}</button>
      }
    </div>
    @if (items(); as list) {
      @if (list.length) {
        <div class="list">
          @for (e of list; track e.id) {
            <button type="button" class="list-item err" (click)="open(e)">
              <span class="list-icon" [class.server]="e.source === 'SERVER'"><app-icon [name]="e.source === 'SERVER' ? 'monitor' : 'smartphone'" /></span>
              <span class="list-body">
                <span class="list-title">{{ e.message }}</span>
                <span class="list-sub">{{ 'adminSupport.errorLine' | t: { n: e.occurrences, when: i18n.relative(e.lastSeen), path: e.path ?? '—' } }}</span>
              </span>
              @if (e.occurrences > 1) {
                <span class="chip num">×{{ e.occurrences }}</span>
              }
            </button>
          }
        </div>
      } @else {
        <div class="empty">
          <span class="empty-icon"><app-icon name="check" /></span>
          <p class="small">{{ (archived() ? 'adminSupport.noArchivedErrors' : 'adminSupport.noErrors') | t }}</p>
        </div>
      }
    } @else {
      <div class="skeleton" style="height: 140px; border-radius: 20px"></div>
    }

    <dialog class="sheet" #detail [attr.aria-label]="'adminSupport.errorTitle' | t">
      <div class="sheet-grip"></div>
      @if (selected(); as e) {
        <div class="stack">
          <div>
            <span class="chip">{{ 'adminSupport.sources.' + e.source | t }}</span>
            <h2 class="h3 err-title">{{ e.message }}</h2>
          </div>
          <dl class="facts small">
            <dt>{{ 'adminSupport.occurrences' | t }}</dt>
            <dd class="num">{{ e.occurrences }}</dd>
            <dt>{{ 'adminSupport.firstSeen' | t }}</dt>
            <dd>{{ i18n.dateTime(e.firstSeen) }}</dd>
            <dt>{{ 'adminSupport.lastSeen' | t }}</dt>
            <dd>{{ i18n.dateTime(e.lastSeen) }}</dd>
            @if (e.path) {
              <dt>{{ 'adminSupport.where' | t }}</dt>
              <dd>{{ e.path }}</dd>
            }
            @if (e.appVersion) {
              <dt>{{ 'adminSupport.version' | t }}</dt>
              <dd>{{ e.appVersion }}</dd>
            }
            @if (e.userName) {
              <dt>{{ 'adminSupport.who' | t }}</dt>
              <dd>{{ e.userName }}</dd>
            }
            @if (e.device) {
              <dt>{{ 'adminSupport.device' | t }}</dt>
              <dd class="ua">{{ e.device }}</dd>
            }
          </dl>
          @if (e.detail) {
            <pre class="trace">{{ e.detail }}</pre>
          }
          <div class="row">
            <button type="button" class="btn btn-secondary btn-s" (click)="copy(e)"><app-icon name="copy" [size]="16" /> {{ 'adminSupport.copy' | t }}</button>
            @if (!e.archivedAt) {
              <button type="button" class="btn btn-primary btn-s" [disabled]="busy()" (click)="archive(e)"><app-icon name="archive" [size]="16" /> {{ 'adminSupport.archive' | t }}</button>
            }
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    .intro {
      margin: 0;
    }
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .list-icon.server {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .err .list-icon:not(.server) {
      background: var(--danger-soft);
      color: var(--danger);
    }
    .err-title {
      margin-top: var(--space-2);
      overflow-wrap: anywhere;
    }
    .facts {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px 12px;
      margin: 0;
    }
    .facts dt {
      color: var(--fg-2);
      font-weight: 600;
    }
    .facts dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .trace {
      max-height: 280px;
      overflow: auto;
      padding: 12px;
      border-radius: var(--radius-s);
      background: var(--surface-2);
      font-size: 11px;
      line-height: 1.45;
      white-space: pre;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class AdminErrorsTab {
  private readonly api = inject(SupportApi);
  private readonly store = inject(AdminStore);
  private readonly todo = inject(TodoStore);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('detail');
  protected readonly items = signal<ErrorEntry[] | null>(null);
  protected readonly selected = signal<ErrorEntry | null>(null);
  protected readonly archived = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    void this.show(false);
  }

  protected async show(archived: boolean): Promise<void> {
    this.archived.set(archived);
    this.items.set(null);
    try {
      this.items.set(await this.api.errors(archived));
    } catch (e) {
      this.items.set([]);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected open(e: ErrorEntry): void {
    this.selected.set(e);
    this.sheet().nativeElement.showModal();
  }

  protected async archive(e: ErrorEntry): Promise<void> {
    await this.run(() => this.api.archiveError(e.id));
    closeSheet(this.sheet().nativeElement);
  }

  protected archiveAll(): Promise<void> {
    return this.run(() => this.api.archiveAllErrors());
  }

  protected async copy(e: ErrorEntry): Promise<void> {
    const text = [e.message, e.path, e.appVersion && 'v' + e.appVersion, e.device, e.detail].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show(this.i18n.t('adminSupport.copied'));
    } catch {
      /* no clipboard */
    }
  }

  private async run(action: () => Promise<ErrorEntry[]>): Promise<void> {
    this.busy.set(true);
    try {
      this.items.set(await action());
      this.archived.set(false);
      void this.store.refreshSummary();
      void this.todo.refresh();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
