import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { Location } from '@angular/common';
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
        <!-- 1.9: a swipe goes to the photo before or after (the grid's order), the next one already there on the side -->
        <figure class="frame" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="cancel()">
          <div class="track" #track>
            <div class="slide">
              @if (newer(); as n) {
                <img [src]="n.url" alt="" draggable="false" />
              }
            </div>
            <div class="slide">
              <!-- a long press keeps « Enregistrer l’image » here: one's own photo, worth keeping -->
              <img class="savable" [src]="p.url" [attr.width]="p.width" [attr.height]="p.height" alt="" draggable="false" />
            </div>
            <div class="slide">
              @if (older(); as o) {
                <img [src]="o.url" alt="" draggable="false" />
              }
            </div>
          </div>
          @if (newer()) {
            <button type="button" class="nav prev" [attr.aria-label]="'photos.viewer.newer' | t" (click)="go(-1)"><app-icon name="chevronLeft" /></button>
          }
          @if (older()) {
            <button type="button" class="nav next" [attr.aria-label]="'photos.viewer.older' | t" (click)="go(1)"><app-icon name="chevronRight" /></button>
          }
        </figure>
        @if (total() > 1) {
          <p class="pos tiny muted num">{{ 'photos.viewer.position' | t: { n: index() + 1, total: total() } }}</p>
        }
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
    /* « Dimanche 30 septembre » on one line, whatever the width: the size follows the screen */
    .head-copy .title {
      text-transform: capitalize;
      font-size: clamp(1.2rem, 6.2vw, 1.9rem);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .frame {
      position: relative;
      margin: 0;
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: #0a0a0c;
      aspect-ratio: 3 / 4;
      animation: zoom-in 360ms var(--ease-out);
      /* the page still scrolls up and down, a sideways move is the swipe */
      touch-action: pan-y;
    }
    .track {
      display: flex;
      width: 100%;
      height: 100%;
      transform: translateX(-100%);
      will-change: transform;
    }
    .slide {
      flex: none;
      width: 100%;
      height: 100%;
    }
    .slide img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }
    .nav {
      position: absolute;
      top: 50%;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin-top: -20px;
      border-radius: 50%;
      background: rgba(10, 10, 12, 0.45);
      color: #fff;
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
    }
    .nav.prev {
      left: 10px;
    }
    .nav.next {
      right: 10px;
    }
    .pos {
      margin: calc(var(--space-2) * -1) 0 0;
      text-align: center;
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
  /** the photo shown: the one opened, then the ones swiped to */
  private readonly current = linkedSignal(() => this.id());
  protected readonly photo = computed(() => this.store.photos()?.find((p) => p.id === this.current()) ?? null);
  /** in the grid's order: newest first */
  protected readonly index = computed(() => (this.store.photos() ?? []).findIndex((p) => p.id === this.current()));
  protected readonly total = computed(() => this.store.photos()?.length ?? 0);
  protected readonly newer = computed(() => (this.index() > 0 ? this.store.photos()![this.index() - 1] : null));
  protected readonly older = computed(() => (this.index() >= 0 ? (this.store.photos()?.[this.index() + 1] ?? null) : null));
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  private readonly location = inject(Location);
  private readonly doc = inject(DOCUMENT);
  private drag: { id: number; x: number; y: number; dx: number; t: number; speed: number; lastX: number; lastT: number; on: boolean } | null = null;
  private moving = false;

  // ── the swipe (1.9) ────────────────────────────────────────────────────────

  protected down(e: PointerEvent): void {
    if (this.moving || (e.pointerType === 'mouse' && e.button !== 0) || (e.target as Element).closest('.nav')) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, t: e.timeStamp, speed: 0, lastX: e.clientX, lastT: e.timeStamp, on: false };
  }

  protected move(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    if (!d.on) {
      if (Math.abs(e.clientY - d.y) > Math.abs(dx) && Math.abs(e.clientY - d.y) > 8) {
        this.drag = null;
        return;
      }
      if (Math.abs(dx) < 8) return;
      d.on = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.speed = 0.6 * d.speed + 0.4 * ((e.clientX - d.lastX) / dt);
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    // no photo that way: it resists
    const blocked = (dx > 0 && !this.newer()) || (dx < 0 && !this.older());
    d.dx = blocked ? dx * 0.3 : dx;
    this.place(d.dx, false);
  }

  protected up(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.on || e.pointerId !== d.id) return;
    const width = this.track()?.nativeElement.clientWidth ?? 1;
    const flick = e.timeStamp - d.lastT < 100 && Math.abs(d.speed) > 0.45;
    const far = Math.abs(d.dx) > width * 0.22;
    const dir = d.dx < 0 ? 1 : -1;
    if ((far || flick) && (dir === 1 ? this.older() : this.newer())) this.slide(dir);
    else this.place(0, true);
  }

  protected cancel(): void {
    if (this.drag?.on) this.place(0, true);
    this.drag = null;
  }

  /** the arrows: the same slide */
  protected go(dir: 1 | -1): void {
    if (!this.moving && (dir === 1 ? this.older() : this.newer())) this.slide(dir);
  }

  /** the track a few pixels aside (dx), animated or under the finger */
  private place(dx: number, animated: boolean): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    el.style.transition = animated ? 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    el.style.transform = `translateX(calc(-100% + ${dx}px))`;
  }

  /** to the photo after (1) or before (-1): the track slides, then the photo changes and the track comes back unseen */
  private slide(dir: 1 | -1): void {
    const el = this.track()?.nativeElement;
    const target = dir === 1 ? this.older() : this.newer();
    if (!el || !target) return;
    const reduced = this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.moving = true;
    const done = () => {
      this.current.set(target.id);
      this.shares.set([]);
      // the address follows (a reload or a share opens this one), the history keeps one entry for the viewer
      this.location.replaceState(`/app/photos/${target.id}`, '', this.doc.defaultView?.history.state);
      el.style.transition = 'none';
      el.style.transform = 'translateX(-100%)';
      this.moving = false;
    };
    if (reduced) {
      done();
      return;
    }
    el.style.transition = 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';
    el.style.transform = `translateX(${dir === 1 ? '-200%' : '0%'})`;
    const end = () => {
      el.removeEventListener('transitionend', end);
      clearTimeout(timer);
      done();
    };
    const timer = setTimeout(end, 400);
    el.addEventListener('transitionend', end);
  }
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
