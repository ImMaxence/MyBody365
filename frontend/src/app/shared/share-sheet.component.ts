import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorCode } from '../core/api/api.service';
import { FriendsApi, Post, PostKind } from '../core/friends/friends-api';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { postImage, shareImage } from '../core/share/share-image';
import { closeSheet } from '../core/ui/sheets';
import { localDay } from '../core/tracking/tracking.store';
import { ToastService } from '../core/ui/toast.service';
import { IconComponent } from './icon.component';
import { PostCardComponent } from './post-card.component';

/**
 * Sharing one's progress or one's day (1.9): first what the friends will see (made by the server, as it will be
 * kept), then « Partager avec mes amis » (in their « Amis », with a notification) or « Envoyer en image » (the phone's
 * share sheet: WhatsApp, Instagram, a message…). The weights are shown only when asked, the change otherwise.
 */
@Component({
  selector: 'app-share-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, PostCardComponent],
  template: `
    <dialog class="sheet" #dlg [attr.aria-label]="'friends.posts.share.' + kind() | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div>
          <h2 class="h3">{{ 'friends.posts.share.' + kind() | t }}</h2>
          <p class="small muted">{{ 'friends.posts.share.sub' | t }}</p>
        </div>

        @if (kind() !== 'DAY') {
          <label class="check card toggle">
            <input type="checkbox" name="weights" [checked]="weights()" (change)="setWeights($any($event.target).checked)" />
            <span><b>{{ 'friends.posts.share.weights' | t }}</b><span class="small muted">{{ 'friends.posts.share.weightsHint' | t }}</span></span>
          </label>
        }

        @if (preview(); as p) {
          <app-post-card [post]="p" />
        } @else if (failed(); as e) {
          <p class="small muted">{{ e }}</p>
        } @else {
          <div class="skeleton" style="height: 180px; border-radius: 24px"></div>
        }

        @if (friends() === 0) {
          <p class="small muted">{{ 'friends.posts.share.noFriends' | t }}</p>
          <a class="btn btn-secondary btn-block" routerLink="/app/friends" (click)="close()"><app-icon name="userPlus" /> {{ 'friends.invite' | t }}</a>
        } @else {
          <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || !preview()" (click)="toFriends()">
            <app-icon name="users" /> {{ (existing() ? 'friends.posts.share.update' : 'friends.posts.share.toFriends') | t }}
          </button>
        }
        <button type="button" class="btn btn-secondary btn-block" [disabled]="busy() || !preview()" (click)="asImage()">
          <app-icon name="image" /> {{ 'friends.posts.share.image' | t }}
        </button>
        @if (existing(); as e) {
          <button type="button" class="btn btn-ghost btn-block" [disabled]="busy()" (click)="unshare(e)">{{ 'friends.posts.share.remove' | t }}</button>
        }
        <p class="tiny muted center">{{ 'friends.posts.share.note' | t }}</p>
      </div>
    </dialog>
  `,
  styles: `
    .center {
      text-align: center;
    }
  `,
})
export class ShareSheetComponent {
  private readonly api = inject(FriendsApi);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly kind = signal<PostKind>('PROGRESS');
  private day = '';
  private milestoneId: string | undefined;
  protected readonly weights = signal(false);
  protected readonly preview = signal<Post | null>(null);
  protected readonly failed = signal<string | null>(null);
  /** what is already shown to the friends for this day (to update or take back) */
  protected readonly existing = signal<Post | null>(null);
  protected readonly friends = signal<number | null>(null);
  protected readonly busy = signal(false);

  open(kind: PostKind, day = '', milestoneId?: string): void {
    this.kind.set(kind);
    this.day = day;
    this.milestoneId = milestoneId;
    this.weights.set(false);
    this.existing.set(null);
    this.busy.set(false);
    void this.load();
    this.api
      .myPosts()
      .then((list) => this.existing.set(list.find((p) => p.kind === kind && p.day === (kind === 'DAY' ? day : localDay())) ?? null))
      .catch(() => undefined);
    this.api
      .list()
      .then((v) => this.friends.set(v.friends.length))
      .catch(() => this.friends.set(null));
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dialog().nativeElement);
  }

  protected setWeights(on: boolean): void {
    this.weights.set(on);
    void this.load();
  }

  private async load(): Promise<void> {
    this.preview.set(null);
    this.failed.set(null);
    try {
      this.preview.set(await this.api.sharePost(this.kind(), { weights: this.weights(), day: this.day || undefined, milestoneId: this.milestoneId, preview: true }));
    } catch (e) {
      this.failed.set(this.i18n.error(errorCode(e)));
    }
  }

  protected async toFriends(): Promise<void> {
    this.busy.set(true);
    try {
      const p = await this.api.sharePost(this.kind(), { weights: this.weights(), day: this.day || undefined, milestoneId: this.milestoneId });
      this.existing.set(p);
      this.toast.show(this.i18n.t('friends.posts.share.done'));
      this.close();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async unshare(p: Post): Promise<void> {
    if (!p.id) return;
    this.busy.set(true);
    try {
      await this.api.unsharePost(p.id);
      this.existing.set(null);
      this.toast.show(this.i18n.t('friends.posts.share.removed'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async asImage(): Promise<void> {
    const p = this.preview();
    if (!p) return;
    this.busy.set(true);
    try {
      const blob = await postImage(p, this.i18n);
      const file = { PROGRESS: 'avancee', DAY: 'journee', MILESTONE: 'palier' }[p.kind];
      const how = await shareImage(blob, `mybody365-${file}-${p.day}.png`, this.i18n.t('friends.posts.share.imageText'));
      if (how === 'downloaded') this.toast.show(this.i18n.t('friends.posts.share.downloaded'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
