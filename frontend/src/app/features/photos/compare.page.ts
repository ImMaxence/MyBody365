import { EasyRangeDirective } from '../../shared/easy-range.directive';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import type { Photo, Pose } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { POSES, PhotosStore } from '../../core/photos/photos.store';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';

/** Before / after: two photos of the same pose, one over the other with a slider, or side by side. */
@Component({
  selector: 'app-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EasyRangeDirective, SegDirective, RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'photos.compareView.title' | t }}</h1>
      </header>

      <div class="seg" role="group" [attr.aria-label]="'photos.title' | t">
        @for (p of poses; track p) {
          <!-- 1.12.1: a pose without two photos yet is greyed, yet chosen like the others: it says what it waits for -->
          <button type="button" [attr.aria-pressed]="pose() === p" [class.few]="count(p) < 2" (click)="choosePose(p)">{{ 'photos.poses.' + p | t }}</button>
        }
      </div>

      @if (before() && after()) {
        @let b = before()!;
        @let a = after()!;
        <div class="summary">
          <span class="chip">{{ 'photos.compareView.days' | t: { n: daysApart() } }}</span>
          @if (delta() !== null) {
            <span class="chip" [class.chip-success]="delta()! < 0">{{ signed(delta()!) }} kg</span>
          }
        </div>

        @if (mode() === 'slide') {
          <div class="frames" [style.--split]="split() + '%'">
            <img class="after" [src]="a.url" alt="" />
            <img class="before" [src]="b.url" alt="" />
            <span class="tag left">{{ 'photos.compareView.before' | t }} · {{ i18n.date(b.day, { day: 'numeric', month: 'short' }) }}</span>
            <span class="tag right">{{ 'photos.compareView.after' | t }} · {{ i18n.date(a.day, { day: 'numeric', month: 'short' }) }}</span>
            <span class="handle" aria-hidden="true"><app-icon name="chevronLeft" [size]="14" /><app-icon name="chevronRight" [size]="14" /></span>
            <input type="range" min="0" max="100" step="1" [value]="split()" (input)="split.set(+$any($event.target).value)"
              [attr.aria-label]="'photos.compareView.slider' | t" />
          </div>
        } @else {
          <div class="side">
            <figure>
              <img [src]="b.url" alt="" />
              <figcaption class="small">{{ 'photos.compareView.before' | t }} · {{ i18n.date(b.day, { day: 'numeric', month: 'short' }) }}</figcaption>
            </figure>
            <figure>
              <img [src]="a.url" alt="" />
              <figcaption class="small">{{ 'photos.compareView.after' | t }} · {{ i18n.date(a.day, { day: 'numeric', month: 'short' }) }}</figcaption>
            </figure>
          </div>
        }

        <div class="seg" role="group" [attr.aria-label]="'photos.compareView.title' | t">
          <button type="button" [attr.aria-pressed]="mode() === 'slide'" (click)="mode.set('slide')">{{ 'photos.compareView.slide' | t }}</button>
          <button type="button" [attr.aria-pressed]="mode() === 'side'" (click)="mode.set('side')">{{ 'photos.compareView.sideBySide' | t }}</button>
        </div>

        <h2 class="section-title">{{ 'photos.compareView.pickBefore' | t }}</h2>
        <div class="strip" role="listbox" [attr.aria-label]="'photos.compareView.pickBefore' | t">
          @for (p of list(); track p.id) {
            <button type="button" role="option" class="pick" [attr.aria-selected]="p.id === b.id" [disabled]="p.day >= a.day" (click)="beforeId.set(p.id)">
              <img [src]="p.thumbUrl" alt="" loading="lazy" /><span class="num">{{ i18n.date(p.day, { day: 'numeric', month: 'short' }) }}</span>
            </button>
          }
        </div>
        <h2 class="section-title">{{ 'photos.compareView.pickAfter' | t }}</h2>
        <div class="strip" role="listbox" [attr.aria-label]="'photos.compareView.pickAfter' | t">
          @for (p of list(); track p.id) {
            <button type="button" role="option" class="pick" [attr.aria-selected]="p.id === a.id" [disabled]="p.day <= b.day" (click)="afterId.set(p.id)">
              <img [src]="p.thumbUrl" alt="" loading="lazy" /><span class="num">{{ i18n.date(p.day, { day: 'numeric', month: 'short' }) }}</span>
            </button>
          }
        </div>
      } @else if (store.photos() !== null) {
        <div class="empty">
          <span class="empty-icon"><app-icon name="columns" /></span>
          <h2 class="h3">{{ (count(pose()) === 0 ? 'photos.few.none' : 'photos.few.one') | t: { pose: ('photos.few.of.' + pose() | t) } }}</h2>
          <p class="small">{{ 'photos.compareView.notEnough' | t }}</p>
          <a class="btn btn-secondary" routerLink="/app/photos/camera"><app-icon name="camera" [size]="18" /> {{ 'photos.few.take' | t }}</a>
        </div>
      }
    </main>
  `,
  styles: `
    /* a pose without enough photos: paler, still a choice */
    .seg button.few:not([aria-pressed='true']) {
      opacity: 0.5;
    }
    .summary {
      display: flex;
      gap: var(--space-2);
      justify-content: center;
    }
    .frames {
      position: relative;
      aspect-ratio: 3 / 4;
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: #0a0a0c;
      touch-action: pan-y;
    }
    .frames img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .frames .before {
      clip-path: inset(0 calc(100% - var(--split)) 0 0);
    }
    .frames::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: var(--split);
      width: 2px;
      margin-left: -1px;
      background: #fff;
      box-shadow: 0 0 12px rgba(0, 0, 0, 0.4);
    }
    .handle {
      position: absolute;
      top: 50%;
      left: var(--split);
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      margin: -20px 0 0 -20px;
      border-radius: 50%;
      background: #fff;
      color: #111;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
    }
    .tag {
      position: absolute;
      top: 12px;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: rgba(10, 10, 12, 0.6);
      color: #fff;
      font-size: var(--fs-xs);
      font-weight: 700;
    }
    .tag.left {
      left: 12px;
    }
    .tag.right {
      right: 12px;
    }
    .frames input {
      position: absolute;
      inset: 0;
      z-index: 2;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: ew-resize;
    }
    .frames:has(input:focus-visible) {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
    .side {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }
    .side figure {
      margin: 0;
      display: grid;
      gap: 6px;
    }
    .side img {
      width: 100%;
      aspect-ratio: 3 / 4;
      object-fit: cover;
      border-radius: var(--radius-l);
      background: #0a0a0c;
    }
    .side figcaption {
      text-align: center;
      font-weight: 650;
      color: var(--fg-2);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
    .strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      scroll-snap-type: x proximity;
    }
    .pick {
      position: relative;
      flex: none;
      width: 64px;
      border-radius: 12px;
      overflow: hidden;
      scroll-snap-align: start;
      outline: 2px solid transparent;
      outline-offset: -2px;
      transition: outline-color var(--dur-2), opacity var(--dur-2);
    }
    .pick img {
      display: block;
      width: 64px;
      height: 85px;
      object-fit: cover;
    }
    .pick span {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 2px;
      background: rgba(10, 10, 12, 0.6);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
    }
    .pick[aria-selected='true'] {
      outline-color: var(--accent);
    }
    .pick:disabled {
      opacity: 0.35;
    }
  `,
})
export class ComparePage {
  /** optional query parameter: the "after" photo (from the viewer) */
  readonly afterParam = input<string | undefined>(undefined, { alias: 'after' });
  protected readonly store = inject(PhotosStore);
  protected readonly i18n = inject(I18nService);
  protected readonly poses = POSES;

  protected readonly pose = signal<Pose>('FRONT');
  protected readonly mode = signal<'slide' | 'side'>('slide');
  protected readonly split = signal(50);
  protected readonly beforeId = signal<string | null>(null);
  protected readonly afterId = signal<string | null>(null);

  protected readonly list = computed(() => {
    this.store.photos();
    return this.store.ofPose(this.pose());
  });
  protected readonly before = computed(() => this.list().find((p) => p.id === this.beforeId()) ?? this.list()[0] ?? null);
  protected readonly after = computed(() => {
    const list = this.list();
    const chosen = list.find((p) => p.id === this.afterId());
    const after = chosen ?? list.at(-1) ?? null;
    return after && this.before() && after.id !== this.before()!.id ? after : null;
  });
  protected readonly daysApart = computed(() => {
    const b = this.before();
    const a = this.after();
    return b && a ? Math.round((Date.parse(a.day) - Date.parse(b.day)) / 86_400_000) : 0;
  });
  protected readonly delta = computed(() => {
    const b = this.before()?.weightKg;
    const a = this.after()?.weightKg;
    return b != null && a != null ? Math.round((a - b) * 10) / 10 : null;
  });

  constructor() {
    void this.store.ensure().catch(() => this.store.photos.set([]));
    // opened from a photo: its pose, the photo as "after", the first photo of the pose as "before"
    effect(() => {
      const id = this.afterParam();
      const all = this.store.photos();
      if (!id || !all) return;
      const photo: Photo | undefined = all.find((p) => p.id === id);
      if (!photo) return;
      this.pose.set(photo.pose);
      this.afterId.set(photo.id);
      const first = this.store.ofPose(photo.pose)[0];
      if (first && first.id !== photo.id) this.beforeId.set(first.id);
    });
    // no "after" param: the pose with the most photos, once, as the photos arrive (1.12.1: a pose chosen afterwards
    // stays chosen, even without photos, and says so)
    let picked = false;
    effect(() => {
      const all = this.store.photos();
      if (!all || this.afterParam() || picked) return;
      picked = true;
      untracked(() => {
        const best = [...POSES].sort((x, y) => this.count(y) - this.count(x))[0];
        if (this.count(this.pose()) < 2) this.pose.set(best);
      });
    });
  }

  protected count(pose: Pose): number {
    return (this.store.photos() ?? []).filter((p) => p.pose === pose).length;
  }

  protected choosePose(p: Pose): void {
    this.pose.set(p);
    this.beforeId.set(null);
    this.afterId.set(null);
  }

  protected signed(n: number): string {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + this.i18n.number(Math.abs(n), 1);
  }
}
