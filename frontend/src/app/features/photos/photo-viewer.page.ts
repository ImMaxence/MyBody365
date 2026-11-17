import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { Friend, FriendsApi } from '../../core/friends/friends-api';
import { PhotosStore } from '../../core/photos/photos.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

/** One photo, big: its day, the weight of that day, and what can be done with it. */
@Component({
  selector: 'app-photo-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page viewer">
      <header class="page-head">
        <app-back-button />
        @if (photo(); as p) {
          <div class="head-copy">
            <h1 class="title small-title">{{ i18n.date(p.day, { weekday: 'long', day: 'numeric', month: 'long' }) }}</h1>
            <span class="small muted">{{ 'photos.poses.' + p.pose | t }} · {{ p.weightKg != null ? ('photos.viewer.weight' | t: { kg: i18n.number(p.weightKg, 1) }) : ('photos.viewer.noWeight' | t) }}</span>
          </div>
        }
      </header>
      @if (photo(); as p) {
        <figure class="frame">
          <!-- a long press keeps « Enregistrer l’image » here: one's own photo, worth keeping -->
          <img class="savable" [src]="p.url" [attr.width]="p.width" [attr.height]="p.height" alt="" />
        </figure>
        <div class="actions">
          <a class="btn btn-secondary" routerLink="/app/photos/compare" [queryParams]="{ after: p.id }"><app-icon name="columns" /> {{ 'photos.viewer.compareFirst' | t }}</a>
          <a class="btn btn-secondary" [href]="p.url" [attr.download]="'mybody365-' + p.day + '.webp'"><app-icon name="download" /> {{ 'photos.viewer.download' | t }}</a>
          <button type="button" class="btn btn-secondary wide" (click)="openShare(p.id)">
            <app-icon name="users" /> {{ 'photos.viewer.share' | t }}{{ shares().length ? ' · ' + shares().length : '' }}
          </button>
          <button type="button" class="btn btn-ghost danger" (click)="confirm.showModal()"><app-icon name="trash" /> {{ 'photos.viewer.delete' | t }}</button>
        </div>
        <dialog class="sheet" #shareDialog>
          <div class="sheet-grip"></div>
          <div class="stack">
            <div>
              <h2 class="h3">{{ 'friends.share.title' | t }}</h2>
              <p class="small muted">{{ 'friends.share.text' | t }}</p>
            </div>
            @if (friends(); as list) {
              @if (list.length) {
                <div class="list">
                  @for (f of list; track f.id) {
                    <label class="list-item share-row">
                      <span class="list-body"><span class="list-title">{{ f.name }}</span></span>
                      <input type="checkbox" [checked]="shares().includes(f.id)" [attr.aria-label]="'friends.share.with' | t: { name: f.name }" (change)="toggleShare(p.id, f.id, $any($event.target).checked)" />
                    </label>
                  }
                </div>
              } @else {
                <p class="small muted">{{ 'friends.share.none' | t }}</p>
                <a class="btn btn-secondary btn-block" routerLink="/app/friends"><app-icon name="userPlus" /> {{ 'friends.invite' | t }}</a>
              }
            }
            <button type="button" class="btn btn-ghost btn-block" (click)="shareDialog.close()">{{ 'common.close' | t }}</button>
          </div>
        </dialog>
        <dialog class="sheet" #confirm>
          <div class="sheet-grip"></div>
          <div class="stack">
            <p>{{ 'photos.viewer.deleteConfirm' | t }}</p>
            <button type="button" class="btn btn-danger btn-block" [disabled]="busy()" (click)="remove(p.id)"><app-icon name="trash" /> {{ 'photos.viewer.delete' | t }}</button>
            <button type="button" class="btn btn-ghost btn-block" (click)="confirm.close()">{{ 'common.cancel' | t }}</button>
          </div>
        </dialog>
      } @else if (missing()) {
        <div class="empty"><span class="empty-icon"><app-icon name="image" /></span><p>{{ 'errors.not_found' | t }}</p></div>
      } @else {
        <div class="frame skeleton"></div>
      }
    </main>
  `,
  styles: `
    .head-copy {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .head-copy .title {
      text-transform: capitalize;
    }
    .frame {
      margin: 0;
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: #0a0a0c;
      aspect-ratio: 3 / 4;
      animation: zoom-in 360ms var(--ease-out);
    }
    .frame img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    @keyframes zoom-in {
      from {
        transform: scale(0.94);
        opacity: 0;
      }
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .actions .wide {
      grid-column: 1 / -1;
    }
    .share-row input {
      width: 22px;
      height: 22px;
      accent-color: var(--accent);
    }
    .actions .danger {
      grid-column: 1 / -1;
      color: var(--danger);
    }
  `,
})
export class PhotoViewerPage {
  readonly id = input.required<string>();
  private readonly store = inject(PhotosStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);
  private readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('confirm');

  protected readonly busy = signal(false);
  protected readonly friends = signal<Friend[] | null>(null);
  protected readonly shares = signal<string[]>([]);
  private readonly friendsApi = inject(FriendsApi);
  private readonly shareDialog = viewChild.required<ElementRef<HTMLDialogElement>>('shareDialog');
  protected readonly photo = computed(() => this.store.photos()?.find((p) => p.id === this.id()) ?? null);
  protected readonly missing = computed(() => this.store.photos() !== null && !this.photo());

  constructor() {
    void this.store.ensure().catch(() => this.store.photos.set([]));
  }

  protected async openShare(photoId: string): Promise<void> {
    this.shareDialog().nativeElement.showModal();
    try {
      const [view, shares] = await Promise.all([this.friendsApi.list(), this.friendsApi.shares(photoId)]);
      this.friends.set(view.friends);
      this.shares.set(shares);
    } catch (e) {
      this.friends.set([]);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async toggleShare(photoId: string, friendId: string, on: boolean): Promise<void> {
    try {
      if (on) await this.friendsApi.share(photoId, friendId);
      else await this.friendsApi.unshare(photoId, friendId);
      this.shares.update((s) => (on ? [...s, friendId] : s.filter((x) => x !== friendId)));
      this.toast.show(this.i18n.t('friends.share.saved'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async remove(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.remove(id);
      this.confirmDialog().nativeElement.close();
      this.toast.show(this.i18n.t('photos.viewer.deleted'));
      this.stack.back('/app/photos');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
