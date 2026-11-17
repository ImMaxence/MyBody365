import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { UserDataService } from '../../core/user-data.service';
import { TodoStore } from '../../core/support/support-api';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

interface Change {
  added: number;
  changed: number;
  removed: number;
  same: number;
  examples: string[];
}

interface Preview {
  token: string;
  exportedAt?: string;
  appVersion?: string;
  profile: boolean;
  changes: Record<string, Change>;
}

interface DriveStatus {
  connected: boolean;
  auto: boolean;
  lastBackupAt?: string;
  lastStatus?: string;
  lastError?: string;
}

interface DriveFile {
  id: string;
  name: string;
  size: number;
  createdTime: string;
}

/** Backups: download everything, restore a file (preview first), Google Drive every night. */
@Component({
  selector: 'app-backup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'backup.title' | t }}</h1>
      </header>

      <section class="card block">
        <span class="ico"><app-icon name="archive" /></span>
        <h2 class="h3">{{ 'backup.exportTitle' | t }}</h2>
        <p class="small muted">{{ 'backup.exportText' | t }}</p>
        <a class="btn btn-primary btn-block" href="/api/me/backup/export" download><app-icon name="download" /> {{ 'backup.export' | t }}</a>
      </section>

      <section class="card block">
        <span class="ico cool"><app-icon name="upload" /></span>
        <h2 class="h3">{{ 'backup.restoreTitle' | t }}</h2>
        <p class="small muted">{{ 'backup.restoreText' | t }}</p>
        <label class="btn btn-secondary btn-block file" [class.disabled]="busy()">
          <app-icon name="upload" /> {{ (busy() ? 'backup.reading' : 'backup.choose') | t }}
          <input type="file" accept=".zip,application/zip" [disabled]="busy()" (change)="pick($event)" [attr.aria-label]="'backup.choose' | t" />
        </label>
      </section>

      <section class="card block">
        <span class="ico drive"><app-icon name="cloud" /></span>
        <h2 class="h3">{{ 'backup.drive' | t }}</h2>
        <p class="small muted">{{ 'backup.driveText' | t }}</p>
        @if (!driveConfigured()) {
          <p class="notice"><app-icon name="info" /> {{ 'backup.driveUnavailable' | t }}</p>
        } @else if (drive()?.connected) {
          @let d = drive()!;
          <p class="small">
            @if (d.lastStatus === 'FAILED') {
              <span class="err">{{ 'backup.driveLastFailed' | t }}</span>
            } @else if (d.lastBackupAt) {
              {{ 'backup.driveLast' | t: { date: i18n.dateTime(d.lastBackupAt) } }}
            } @else {
              {{ 'backup.driveNever' | t }}
            }
          </p>
          <label class="check">
            <input type="checkbox" [checked]="d.auto" (change)="setAuto($any($event.target).checked)" />
            <span>{{ 'backup.driveAuto' | t }}</span>
          </label>
          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="backupNow()"><app-icon name="cloud" /> {{ 'backup.driveNow' | t }}</button>
          @if (files().length) {
            <h3 class="section-title">{{ 'backup.driveList' | t }}</h3>
            <div class="list">
              @for (f of files(); track f.id) {
                <div class="list-item">
                  <span class="list-body">
                    <span class="list-title">{{ i18n.dateTime(f.createdTime) }}</span>
                    <span class="list-sub">{{ size(f.size) }}</span>
                  </span>
                  <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="previewDrive(f)">{{ 'backup.driveRestore' | t }}</button>
                </div>
              }
            </div>
          }
          <button type="button" class="btn btn-ghost btn-block danger" [disabled]="busy()" (click)="disconnect()">{{ 'backup.driveDisconnect' | t }}</button>
        } @else {
          <a class="btn btn-secondary btn-block" href="/api/me/drive/connect"><app-icon name="cloud" /> {{ 'backup.driveConnect' | t }}</a>
        }
      </section>

      <dialog class="sheet" #previewDialog>
        <div class="sheet-grip"></div>
        @if (preview(); as p) {
          <div class="stack">
            <div>
              <h2 class="h3">{{ 'backup.previewTitle' | t }}</h2>
              @if (p.exportedAt) {
                <p class="small muted">{{ 'backup.exportedAt' | t: { date: i18n.dateTime(p.exportedAt) } }}</p>
              }
            </div>
            <ul class="changes" role="list">
              @for (c of categories; track c) {
                @let ch = p.changes[c];
                @if (ch) {
                  <li>
                    <b>{{ 'backup.categories.' + c | t }}</b>
                    <span class="small">
                      @if (!ch.added && !ch.changed && !ch.removed) {
                        <span class="muted">{{ 'backup.nothing' | t }}</span>
                      } @else {
                        @if (ch.added) {
                          <span class="add">{{ 'backup.added' | t: { n: ch.added } }}</span>
                        }
                        @if (ch.changed) {
                          <span class="chg">{{ 'backup.changed' | t: { n: ch.changed } }}</span>
                        }
                        @if (ch.removed) {
                          <span class="rem">{{ 'backup.removed' | t: { n: ch.removed } }}</span>
                        }
                      }
                    </span>
                    @if (ch.examples.length) {
                      <span class="tiny muted ex">{{ ch.examples.join(' · ') }}</span>
                    }
                  </li>
                }
              }
            </ul>
            @if (p.profile) {
              <p class="small muted">{{ 'backup.profile' | t }}</p>
            }
            <span class="label">{{ 'backup.mode' | t }}</span>
            <div class="modes" role="radiogroup" [attr.aria-label]="'backup.mode' | t">
              <button type="button" role="radio" class="mode" [class.on]="mode() === 'MERGE'" [attr.aria-checked]="mode() === 'MERGE'" (click)="mode.set('MERGE')">
                <b>{{ 'backup.merge' | t }}</b><span class="small muted">{{ 'backup.mergeText' | t }}</span>
              </button>
              <button type="button" role="radio" class="mode" [class.on]="mode() === 'REPLACE'" [attr.aria-checked]="mode() === 'REPLACE'" (click)="mode.set('REPLACE')">
                <b>{{ 'backup.replace' | t }}</b><span class="small muted">{{ 'backup.replaceText' | t }}</span>
              </button>
            </div>
            <button type="button" class="btn btn-block" [class.btn-primary]="mode() === 'MERGE'" [class.btn-danger]="mode() === 'REPLACE'" [disabled]="busy()" (click)="restore(p)">
              <app-icon name="check" /> {{ (busy() ? 'backup.restoring' : 'backup.confirm') | t }}
            </button>
            <button type="button" class="btn btn-ghost btn-block" (click)="previewDialog.close()">{{ 'common.cancel' | t }}</button>
          </div>
        }
      </dialog>
    </main>
  `,
  styles: `
    .block {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5);
    }
    .ico {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .ico.cool {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .ico.drive {
      background: var(--success-soft);
      color: var(--success);
    }
    .file {
      position: relative;
      overflow: hidden;
    }
    .file input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    .file:has(input:focus-visible) {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
    .file.disabled {
      opacity: 0.6;
    }
    .changes {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .changes li {
      display: grid;
      gap: 2px;
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--line);
    }
    .changes .small {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
    }
    .add {
      color: var(--success);
      font-weight: 650;
    }
    .chg {
      color: var(--warning);
      font-weight: 650;
    }
    .rem {
      color: var(--fg-2);
    }
    .ex {
      overflow-wrap: anywhere;
    }
    .modes {
      display: grid;
      gap: var(--space-2);
    }
    .mode {
      display: grid;
      gap: 2px;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-m);
      border: 1.5px solid var(--line);
      text-align: left;
      transition: border-color var(--dur-2);
    }
    .mode.on {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .err,
    .danger {
      color: var(--danger);
    }
  `,
})
export class BackupPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly userData = inject(UserDataService);
  private readonly todo = inject(TodoStore);
  protected readonly i18n = inject(I18nService);
  private readonly previewDialog = viewChild.required<ElementRef<HTMLDialogElement>>('previewDialog');

  protected readonly categories = ['logs', 'photos', 'meals', 'foods', 'recipes', 'water', 'timers', 'workouts'];
  protected readonly driveConfigured = signal(false);
  protected readonly drive = signal<DriveStatus | null>(null);
  protected readonly files = signal<DriveFile[]>([]);
  protected readonly preview = signal<Preview | null>(null);
  protected readonly mode = signal<'MERGE' | 'REPLACE'>('MERGE');
  protected readonly busy = signal(false);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // back from Google's consent page
    const drive = new URLSearchParams(location.search).get('drive');
    if (drive) {
      history.replaceState(history.state, '', location.pathname);
      if (drive === 'connected') this.toast.show(this.i18n.t('backup.driveConnected'));
      else if (drive === 'cancelled') this.toast.show(this.i18n.t('backup.driveCancelled'));
      else this.toast.error(this.i18n.t('backup.driveFailed'));
    }
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const o = await firstValueFrom(this.http.get<{ driveConfigured: boolean; drive: DriveStatus }>('/api/me/backup'));
      this.driveConfigured.set(o.driveConfigured);
      this.drive.set(o.drive);
      // the red dot of the profile follows
      void this.todo.refresh();
      if (o.drive.connected) {
        this.files.set(await firstValueFrom(this.http.get<DriveFile[]>('/api/me/drive/backups')).catch(() => []));
      }
    } catch {
      /* the sections show their defaults */
    }
  }

  protected size(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? `${this.i18n.number(mb, 1)} ${this.i18n.lang() === 'fr' ? 'Mo' : 'MB'}` : `${this.i18n.number(bytes / 1024)} ${this.i18n.lang() === 'fr' ? 'Ko' : 'KB'}`;
  }

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file, file.name);
    await this.showPreview(() => firstValueFrom(this.http.post<Preview>('/api/me/backup/preview', form)));
  }

  protected previewDrive(f: DriveFile): Promise<void> {
    return this.showPreview(() => firstValueFrom(this.http.post<Preview>(`/api/me/drive/backups/${f.id}/preview`, null)));
  }

  private async showPreview(call: () => Promise<Preview>): Promise<void> {
    this.busy.set(true);
    try {
      this.preview.set(await call());
      this.mode.set('MERGE');
      this.previewDialog().nativeElement.showModal();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async restore(p: Preview): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(
        this.http.post<{ logs: number; photos: number; meals: number }>('/api/me/backup/restore', { token: p.token, mode: this.mode() }),
      );
      this.previewDialog().nativeElement.close();
      // everything loaded before is stale now
      this.userData.clear();
      this.toast.show(this.i18n.t('backup.restored', { logs: r.logs, photos: r.photos, meals: r.meals }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async setAuto(auto: boolean): Promise<void> {
    try {
      const o = await firstValueFrom(this.http.put<{ drive: DriveStatus }>('/api/me/drive', { auto }));
      this.drive.set(o.drive);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async backupNow(): Promise<void> {
    this.busy.set(true);
    try {
      const o = await firstValueFrom(this.http.post<{ drive: DriveStatus }>('/api/me/drive/backup', null));
      this.drive.set(o.drive);
      this.files.set(await firstValueFrom(this.http.get<DriveFile[]>('/api/me/drive/backups')).catch(() => []));
      this.toast.show(this.i18n.t('backup.driveSaved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async disconnect(): Promise<void> {
    this.busy.set(true);
    try {
      const o = await firstValueFrom(this.http.delete<{ drive: DriveStatus }>('/api/me/drive'));
      this.drive.set(o.drive);
      this.files.set([]);
      void this.todo.refresh();
      this.toast.show(this.i18n.t('backup.driveDisconnected'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
