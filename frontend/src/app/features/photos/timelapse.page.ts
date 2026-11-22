import { EasyRangeDirective } from '../../shared/easy-range.directive';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Photo, Pose } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { loadImage } from '../../core/photos/image-tools';
import { POSES, PhotosStore } from '../../core/photos/photos.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';

type Speed = 'slow' | 'normal' | 'fast';
const FPS: Record<Speed, number> = { slow: 3, normal: 6, fast: 12 };

/** The time-lapse of a pose: every photo in a row, with the date and the weight, exportable as a video. */
@Component({
  selector: 'app-timelapse',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EasyRangeDirective, SegDirective, RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'photos.timelapseView.title' | t }}</h1>
      </header>

      <div class="seg" role="group" [attr.aria-label]="'photos.title' | t">
        @for (p of poses; track p) {
          <!-- 1.12.1: a pose without two photos yet is greyed, yet chosen like the others: it says what it waits for -->
          <button type="button" [attr.aria-pressed]="pose() === p" [class.few]="count(p) < 2" (click)="choose(p)">{{ 'photos.poses.' + p | t }}</button>
        }
      </div>

      @if (frames().length >= 2) {
        @let f = frames()[index()];
        <div class="player">
          @for (p of frames(); track p.id; let i = $index) {
            <img [src]="p.url" alt="" [class.on]="i === index()" [attr.loading]="i < 3 ? 'eager' : 'lazy'" />
          }
          <div class="overlay">
            <span class="date">{{ i18n.date(f.day, { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
            @if (f.weightKg != null) {
              <span class="kg num">{{ i18n.number(f.weightKg, 1) }} <small>kg</small></span>
            }
          </div>
          <span class="counter tiny num">{{ 'photos.timelapseView.frame' | t: { n: index() + 1, total: frames().length } }}</span>
        </div>

        <input class="scrub" type="range" min="0" [max]="frames().length - 1" [value]="index()" (input)="seek(+$any($event.target).value)"
          [attr.aria-label]="'photos.timelapseView.position' | t" />

        <div class="controls">
          <button type="button" class="play" (click)="toggle()" [attr.aria-label]="(playing() ? 'photos.timelapseView.pause' : 'photos.timelapseView.play') | t">
            <app-icon [name]="playing() ? 'pause' : 'play'" [size]="26" />
          </button>
          <div class="seg speeds" role="group" [attr.aria-label]="'photos.timelapseView.speed' | t">
            @for (s of speeds; track s) {
              <button type="button" [attr.aria-pressed]="speed() === s" (click)="setSpeed(s)">{{ 'photos.timelapseView.speeds.' + s | t }}</button>
            }
          </div>
        </div>

        @if (canExport) {
          <button type="button" class="btn btn-secondary btn-block" [disabled]="exporting() !== null" (click)="export()">
            <app-icon name="download" />
            {{ exporting() !== null ? ('photos.timelapseView.exporting' | t: { pct: exporting()! }) : ('photos.timelapseView.export' | t) }}
          </button>
        }
      } @else if (store.photos() !== null) {
        <div class="empty">
          <span class="empty-icon"><app-icon name="film" /></span>
          <h2 class="h3">{{ (count(pose()) === 0 ? 'photos.few.none' : 'photos.few.one') | t: { pose: ('photos.few.of.' + pose() | t) } }}</h2>
          <p class="small">{{ 'photos.timelapseView.notEnough' | t }}</p>
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
    .player {
      position: relative;
      aspect-ratio: 3 / 4;
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: #0a0a0c;
    }
    .player img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
    }
    .player img.on {
      opacity: 1;
    }
    .overlay {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-8) var(--space-4) var(--space-4);
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
      color: #fff;
    }
    .date {
      font-weight: 700;
      text-transform: capitalize;
    }
    .kg {
      font-family: var(--font-display);
      font-stretch: 120%;
      font-weight: 800;
      font-size: 2rem;
      line-height: 1;
    }
    .kg small {
      font-size: 0.9rem;
    }
    .counter {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      background: rgba(10, 10, 12, 0.6);
      color: #fff;
      font-weight: 700;
    }
    .scrub {
      width: 100%;
      accent-color: var(--accent);
    }
    .controls {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
    .play {
      display: grid;
      place-items: center;
      width: 60px;
      height: 60px;
      flex: none;
      border-radius: 50%;
      background: var(--flame);
      color: var(--accent-ink);
      box-shadow: 0 12px 30px -12px var(--accent-glow);
      transition: transform var(--dur-2) var(--ease-out);
    }
    .play:active {
      transform: scale(0.92);
    }
    .speeds {
      flex: 1;
    }
  `,
})
export class TimelapsePage {
  protected readonly store = inject(PhotosStore);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  protected readonly poses = POSES;
  protected readonly speeds: Speed[] = ['slow', 'normal', 'fast'];
  protected readonly canExport = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';

  protected readonly pose = signal<Pose>('FRONT');
  protected readonly speed = signal<Speed>('normal');
  protected readonly index = signal(0);
  protected readonly playing = signal(false);
  protected readonly exporting = signal<number | null>(null);
  protected readonly frames = computed<Photo[]>(() => {
    this.store.photos();
    return this.store.ofPose(this.pose());
  });
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    void this.store.ensure().catch(() => this.store.photos.set([]));
    // the pose with the most photos, once, as the photos arrive (1.12.1: a pose chosen afterwards stays chosen)
    let picked = false;
    effect(() => {
      if (!this.store.photos() || picked) return;
      picked = true;
      untracked(() => {
        if (this.count(this.pose()) < 2) {
          const best = [...POSES].sort((x, y) => this.count(y) - this.count(x))[0];
          this.pose.set(best);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected count(pose: Pose): number {
    return (this.store.photos() ?? []).filter((p) => p.pose === pose).length;
  }

  protected choose(p: Pose): void {
    this.stop();
    this.pose.set(p);
    this.index.set(0);
  }

  protected seek(i: number): void {
    this.index.set(i);
  }

  protected toggle(): void {
    if (this.playing()) {
      this.stop();
      return;
    }
    if (this.index() >= this.frames().length - 1) this.index.set(0);
    this.playing.set(true);
    this.schedule();
  }

  protected setSpeed(s: Speed): void {
    this.speed.set(s);
    if (this.playing()) this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      const next = this.index() + 1;
      if (next >= this.frames().length) {
        this.stop();
        return;
      }
      this.index.set(next);
    }, 1000 / FPS[this.speed()]);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing.set(false);
  }

  /** drawn frame by frame on a canvas and recorded (MP4 where the browser can, WebM otherwise) */
  protected async export(): Promise<void> {
    const frames = this.frames();
    this.stop();
    this.exporting.set(0);
    try {
      const images = await Promise.all(frames.map((f) => loadImage(f.url)));
      const w = 720;
      const h = 960;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      if (!type) throw new Error('unsupported');
      const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
      recorder.start();
      const perFrame = 1000 / FPS[this.speed()];
      for (let i = 0; i < images.length; i++) {
        this.drawFrame(ctx, images[i], frames[i], w, h);
        this.exporting.set(Math.round(((i + 1) / images.length) * 100));
        await new Promise((r) => setTimeout(r, perFrame));
      }
      await new Promise((r) => setTimeout(r, 400));
      recorder.stop();
      await done;
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mybody365-timelapse.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      this.toast.show(this.i18n.t('photos.timelapseView.exported'));
    } catch {
      this.toast.error(this.i18n.t('photos.timelapseView.exportUnsupported'));
    } finally {
      this.exporting.set(null);
    }
  }

  private drawFrame(ctx: CanvasRenderingContext2D, img: HTMLImageElement, f: Photo, w: number, h: number): void {
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, w, h);
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const g = ctx.createLinearGradient(0, h - 200, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h - 200, w, 200);
    ctx.fillStyle = '#fff';
    ctx.font = '600 30px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(this.i18n.date(f.day, { day: 'numeric', month: 'long', year: 'numeric' }), 32, h - 40);
    if (f.weightKg != null) {
      ctx.font = '800 64px Archivo, Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${this.i18n.number(f.weightKg, 1)} kg`, w - 32, h - 36);
      ctx.textAlign = 'left';
    }
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('MyBody365', 32, 52);
  }
}
