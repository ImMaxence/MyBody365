import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Photo, Pose } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { formatBytes } from '../../core/photos/image-tools';
import { POSES, PhotosStore } from '../../core/photos/photos.store';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';
import { readPref, writePref } from '../../core/ui/device-prefs';

/** the photos blurred on this phone (1.9): a choice kept here only, visible by default */
const BLUR_KEY = 'mb.photosBlurred';

interface Month {
  key: string;
  label: string;
  photos: Photo[];
}

/** The Photos tab: today's photo, the grid month by month, the before / after and the time-lapse. */
@Component({
  selector: 'app-photos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, RouterLink, TranslatePipe, IconComponent],
  template: `
    <main class="page" [class.blurred]="blurred()">
      <header class="page-head">
        <h1 class="title">{{ 'photos.title' | t }}</h1>
        <span class="spacer"></span>
        <!-- blurred in public (the bus, a friend next to you): one tap, kept on this phone -->
        <button type="button" class="icon-btn blur-btn" [class.on]="blurred()" [attr.aria-pressed]="blurred()"
          [attr.aria-label]="(blurred() ? 'photos.blur.off' : 'photos.blur.on') | t" (click)="toggleBlur()">
          <app-icon [name]="blurred() ? 'eyeOff' : 'eye'" />
        </button>
        @if (canCompare()) {
          <a routerLink="/app/photos/compare" class="icon-btn" [attr.aria-label]="'photos.compare' | t"><app-icon name="columns" /></a>
          <a routerLink="/app/photos/timelapse" class="icon-btn" [attr.aria-label]="'photos.timelapse' | t"><app-icon name="film" /></a>
        }
      </header>

      @if (store.todayPhotos()[0]; as today) {
        <a class="today card done" routerLink="/app/photos/camera">
          <img [src]="today.thumbUrl" alt="" width="64" height="85" />
          <span class="today-copy">
            <span class="today-title"><app-icon name="check" [size]="18" [stroke]="2.6" /> {{ 'photos.todayDone' | t }}</span>
            <span class="small muted">{{ 'photos.todayDoneHint' | t }}</span>
          </span>
          <span class="chip">{{ 'photos.retake' | t }}</span>
        </a>
      } @else {
        <a class="today card cta" routerLink="/app/photos/camera">
          <span class="cam-ico"><app-icon name="camera" [size]="26" /></span>
          <span class="today-copy">
            <span class="today-title">{{ 'photos.todayCta' | t }}</span>
            <span class="small">{{ 'photos.todayHint' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
      }
      <!-- 1.10: the photo of the day from the phone's gallery (taken earlier, or with the phone's own camera) -->
      <button type="button" class="btn btn-secondary btn-block from-gallery" (click)="gallery.click()">
        <app-icon name="image" [size]="18" /> {{ 'photos.camera.import' | t }}
      </button>
      <input #gallery type="file" accept="image/*" hidden (change)="picked($event)" />

      @if (blurred()) {
        <p class="blur-note small muted"><app-icon name="eyeOff" [size]="15" /> {{ 'photos.blur.note' | t }}</p>
      }
      @if (store.photos(); as all) {
        @if (all.length) {
          <div class="seg" role="group" [attr.aria-label]="'photos.title' | t">
            <button type="button" [attr.aria-pressed]="pose() === null" (click)="pose.set(null)">{{ 'photos.all' | t }}</button>
            @for (p of poses; track p) {
              <button type="button" [attr.aria-pressed]="pose() === p" (click)="pose.set(p)">{{ 'photos.poses.' + p | t }}</button>
            }
          </div>
          @for (m of months(); track m.key) {
            <section class="month">
              <h2 class="section-title"><span class="month-name">{{ m.label }}</span> <span class="faint">· {{ 'photos.count' | t: { n: m.photos.length } }}</span></h2>
              <div class="grid">
                @for (p of m.photos; track p.id; let i = $index) {
                  <a class="tile" [routerLink]="['/app/photos', p.id]" [style.--i]="i" [attr.aria-label]="'photos.open' | t: { date: i18n.date(p.day) }">
                    <img [src]="p.thumbUrl" alt="" loading="lazy" decoding="async" />
                    <span class="tile-day num">{{ dayOf(p.day) }}</span>
                    @if (pose() === null && p.pose !== 'FRONT') {
                      <span class="tile-pose">{{ 'photos.poses.' + p.pose | t }}</span>
                    }
                  </a>
                }
              </div>
            </section>
          }
        } @else {
          <div class="empty">
            <span class="empty-icon"><app-icon name="image" /></span>
            <h2 class="h3">{{ 'photos.emptyTitle' | t }}</h2>
            <p class="small">{{ 'photos.emptyText' | t }}</p>
          </div>
        }
      } @else {
        <div class="grid">
          @for (i of [0, 1, 2, 3, 4, 5]; track i) {
            <div class="tile skeleton"></div>
          }
        </div>
      }

      <p class="private small muted"><span class="lock"><app-icon name="lock" [size]="15" /></span>{{ 'photos.privateNote' | t }}</p>
      @if (store.storage(); as s) {
        <div class="storage">
          <div class="bar" role="progressbar" [attr.aria-label]="storageLabel()" [attr.aria-valuenow]="storagePct()" aria-valuemin="0" aria-valuemax="100">
            <i [style.width.%]="storagePct()"></i>
          </div>
          <span class="tiny muted">{{ storageLabel() }}</span>
        </div>
      }
    </main>
  `,
  styles: `
    .spacer {
      flex: 1;
    }
    .blur-btn {
      transition:
        background-color var(--dur-2),
        color var(--dur-2);
    }
    .blur-btn.on {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    /* blurred: still there (the grid keeps its shape), opened with a tap as usual */
    .page .tile img,
    .page .today img {
      transition:
        filter 320ms var(--ease-out),
        transform var(--dur-3) var(--ease-out);
    }
    .blurred .tile img {
      filter: blur(14px) saturate(0.6);
      transform: scale(1.15);
    }
    .blurred .today img {
      filter: blur(8px) saturate(0.6);
      clip-path: inset(0 round 14px);
    }
    .blurred .tile:active img {
      transform: scale(1.2);
    }
    .blur-note {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: calc(var(--space-2) * -1) 0 0;
    }
    .today {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4);
      color: inherit;
      text-decoration: none;
      transition: transform var(--dur-2) var(--ease-out);
    }
    .today:active {
      transform: scale(0.98);
    }
    /* white on the deep flame (contrast AA everywhere), a warm glow in the corner */
    .today.cta {
      background:
        radial-gradient(120% 140% at 100% 0%, rgba(255, 194, 61, 0.35), transparent 55%),
        var(--flame-deep);
      color: #fff;
      border: 0;
      box-shadow:
        0 18px 40px -18px var(--accent-glow),
        inset 0 1px 0 rgba(255, 255, 255, 0.25);
    }
    .today.cta .small {
      color: rgba(255, 255, 255, 0.88);
    }
    .cam-ico {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.18);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
      flex: none;
    }
    .today img {
      width: 64px;
      height: 85px;
      object-fit: cover;
      border-radius: 14px;
      flex: none;
    }
    .today-copy {
      display: grid;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .today-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 750;
      font-size: 1.05rem;
    }
    .done .today-title {
      color: var(--success);
    }
    .month {
      display: grid;
      gap: var(--space-3);
    }
    .month .section-title {
      margin: 0;
    }
    /* "novembre 2026" → "Novembre 2026", the count after it untouched */
    .month-name {
      display: inline-block;
    }
    .month-name::first-letter {
      text-transform: uppercase;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .tile {
      position: relative;
      display: block;
      aspect-ratio: 3 / 4;
      border-radius: 14px;
      overflow: hidden;
      background: var(--surface-3);
    }
    .tile img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform var(--dur-3) var(--ease-out);
    }
    .tile:active img {
      transform: scale(1.05);
    }
    .tile-day {
      position: absolute;
      left: 6px;
      bottom: 6px;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      background: rgba(10, 10, 12, 0.6);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
    }
    .tile-pose {
      position: absolute;
      right: 6px;
      top: 6px;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      background: rgba(10, 10, 12, 0.6);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
    }
    @keyframes tile-in {
      from {
        opacity: 0;
        transform: scale(0.92);
      }
    }
    /* centred on the screen, the lock in front of the first line (a flex row kept the text to the left) */
    .private {
      max-width: 34ch;
      margin-inline: auto;
      text-align: center;
      text-wrap: balance;
    }
    .private .lock {
      display: inline-block;
      margin-right: 6px;
      vertical-align: -2px;
    }
    .storage {
      display: grid;
      gap: 6px;
      justify-items: center;
    }
    .bar {
      width: min(240px, 100%);
      height: 6px;
      border-radius: 3px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: var(--flame);
    }
  `,
})
export class PhotosPage {
  protected readonly store = inject(PhotosStore);
  protected readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  /** a picture of the gallery: on to the camera screen, which shows it to choose its pose and keep it */
  protected picked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.store.handOver(file);
    void this.router.navigate(['/app/photos/camera']);
  }
  protected readonly poses = POSES;
  protected readonly pose = signal<Pose | null>(null);

  protected readonly canCompare = computed(() => POSES.some((p) => (this.store.photos() ?? []).filter((x) => x.pose === p).length >= 2));

  protected readonly months = computed<Month[]>(() => {
    const pose = this.pose();
    const out: Month[] = [];
    for (const p of this.store.photos() ?? []) {
      if (pose && p.pose !== pose) continue;
      const key = p.day.slice(0, 7);
      let m = out.at(-1);
      if (!m || m.key !== key) {
        m = { key, label: this.i18n.date(key + '-01', { month: 'long', year: 'numeric' }), photos: [] };
        out.push(m);
      }
      m.photos.push(p);
    }
    return out;
  });

  protected readonly storagePct = computed(() => {
    const s = this.store.storage();
    return s && s.quotaBytes > 0 ? Math.min(100, Math.round((s.usedBytes / s.quotaBytes) * 100)) : 0;
  });

  protected readonly storageLabel = computed(() => {
    const s = this.store.storage();
    if (!s) return '';
    const lang = this.i18n.lang();
    return this.i18n.t('photos.storage', { used: formatBytes(s.usedBytes, lang), quota: formatBytes(s.quotaBytes, lang) });
  });

  /** blurred on this phone or not (visible by default) */
  protected readonly blurred = signal(readPref(BLUR_KEY) === '1');

  protected toggleBlur(): void {
    const on = !this.blurred();
    this.blurred.set(on);
    writePref(BLUR_KEY, on ? '1' : null);
  }

  constructor() {
    void this.store.load().catch(() => this.store.photos.set(this.store.photos() ?? []));
    void this.store.loadStorage();
  }

  protected dayOf(day: string): string {
    return String(Number(day.slice(8, 10)));
  }
}
