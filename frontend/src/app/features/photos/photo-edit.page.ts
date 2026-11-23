import { EasyRangeDirective } from '../../shared/easy-range.directive';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { prepareImage, loadImage } from '../../core/photos/image-tools';
import {
  ANGLE_MAX,
  BACKGROUNDS,
  Background,
  NO_EDIT,
  PhotoEdit,
  ZOOM_MAX,
  ZOOM_MIN,
  changed,
  clampMove,
  clampZoom,
  cssFilter,
  draw,
  fitZoom,
  render,
  softCopy,
} from '../../core/photos/photo-edit';
import { PhotosStore } from '../../core/photos/photos.store';
import { ToastService } from '../../core/ui/toast.service';
import { ConfirmService } from '../../core/ui/confirm';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';

type Light = 'brightness' | 'contrast' | 'saturation';

/**
 * 1.16: a photo already taken, touched up: placed with a finger and sized with two (smaller than the frame too, on a
 * blurred, black or white background), turned, straightened, brighter, more contrasted, more or less colourful. Saved,
 * it takes the old one's place (core/photos/photo-edit.ts draws both the preview and the picture saved).
 */
@Component({
  selector: 'app-photo-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EasyRangeDirective, TranslatePipe, IconComponent, BackButtonComponent, SegDirective],
  template: `
    <main class="page editor">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'photos.edit.title' | t }}</h1>
      </header>
      @if (photo(); as p) {
        <figure class="frame" #frame [class.moving]="moving()" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)"
          (pointercancel)="up($event)" (wheel)="wheel($event)">
          <canvas #canvas [style.filter]="filter()" role="img" [attr.aria-label]="'photos.edit.preview' | t"></canvas>
          <!-- the thirds, while the photo moves -->
          <div class="thirds" aria-hidden="true"></div>
          @if (!img()) {
            <div class="loading skeleton"></div>
          }
        </figure>
        <p class="tiny muted center">{{ 'photos.edit.gesture' | t }}</p>

        <div class="seg" role="group" [attr.aria-label]="'photos.edit.title' | t">
          <button type="button" [attr.aria-pressed]="tab() === 'frame'" (click)="tab.set('frame')"><app-icon name="crop" /> {{ 'photos.edit.frame' | t }}</button>
          <button type="button" [attr.aria-pressed]="tab() === 'light'" (click)="tab.set('light')"><app-icon name="sun" /> {{ 'photos.edit.light' | t }}</button>
        </div>

        @if (tab() === 'frame') {
          <div class="tools">
            <button type="button" class="btn btn-secondary" (click)="turn()"><app-icon name="rotateCw" /> {{ 'photos.edit.turn' | t }}</button>
            <button type="button" class="btn btn-ghost" [disabled]="!dirty()" (click)="reset()"><app-icon name="refresh" /> {{ 'photos.edit.reset' | t }}</button>
          </div>
          <!-- the slider is named on its own (a label would name the output first) -->
          <div class="slider">
            <span class="slider-head">
              <span aria-hidden="true">{{ 'photos.edit.size' | t }}</span>
              <span class="num grow" aria-hidden="true">{{ zoomText() }}</span>
              <!-- 1.17: the whole photo in the frame (a very wide one needs less than the usual smallest size) -->
              <button type="button" class="fit" [disabled]="!img() || atFit()" (click)="fit()"><app-icon name="maximize" [size]="14" /> {{ 'photos.edit.fit' | t }}</button>
            </span>
            <input type="range" [min]="zoomMin()" [max]="zoomMax" step="0.01" [value]="zoomPos()" [attr.aria-label]="'photos.edit.size' | t"
              [attr.aria-valuetext]="zoomText()" (input)="setZoom(+$any($event.target).value)" />
          </div>
          <div class="slider">
            <span class="slider-head" aria-hidden="true"><span>{{ 'photos.edit.straighten' | t }}</span><span class="num">{{ signed(edit().angle, 1) }}°</span></span>
            <input type="range" [min]="-angleMax" [max]="angleMax" step="0.5" [value]="edit().angle" [attr.aria-label]="'photos.edit.straighten' | t"
              [attr.aria-valuetext]="signed(edit().angle, 1) + '°'" (input)="patch({ angle: +$any($event.target).value })" />
          </div>
          <div class="bg">
            <span class="label">{{ 'photos.edit.background' | t }}</span>
            <div class="chips" role="radiogroup" [attr.aria-label]="'photos.edit.background' | t">
              @for (b of backgrounds; track b) {
                <button type="button" class="chip-bg" role="radio" [attr.aria-checked]="edit().background === b" (click)="patch({ background: b })">
                  <i class="swatch" [attr.data-bg]="b" aria-hidden="true"></i>{{ 'photos.edit.backgrounds.' + b | t }}
                </button>
              }
            </div>
            <p class="tiny muted">{{ 'photos.edit.backgroundHint' | t }}</p>
          </div>
        } @else {
          @for (l of lights; track l) {
            <div class="slider">
              <span class="slider-head" aria-hidden="true"><span>{{ 'photos.edit.' + l | t }}</span><span class="num">{{ signed(lightPos(l), 0) }}</span></span>
              <input type="range" min="-50" max="50" step="1" [value]="lightPos(l)" [attr.aria-label]="'photos.edit.' + l | t"
                [attr.aria-valuetext]="signed(lightPos(l), 0)" (input)="setLight(l, +$any($event.target).value)" />
            </div>
          }
        }

        <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || !img() || !dirty()" (click)="save()">
          <app-icon name="check" /> {{ 'photos.edit.save' | t }}
        </button>
      } @else if (missing()) {
        <div class="empty"><span class="empty-icon"><app-icon name="image" /></span><p>{{ 'errors.not_found' | t }}</p></div>
      } @else {
        <div class="frame skeleton"></div>
      }
    </main>
  `,
  styles: `
    .small-title {
      font-size: 1.6rem;
    }
    .frame {
      position: relative;
      margin: 0;
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: #0a0a0c;
      aspect-ratio: 3 / 4;
      /* the gestures are the photo's, not the page's */
      touch-action: none;
      cursor: grab;
    }
    .frame.moving {
      cursor: grabbing;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .thirds {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--dur-2);
      background:
        linear-gradient(90deg, transparent calc(33.33% - 0.5px), rgba(255, 255, 255, 0.55) 0 calc(33.33% + 0.5px), transparent 0 calc(66.66% - 0.5px), rgba(255, 255, 255, 0.55) 0 calc(66.66% + 0.5px), transparent 0),
        linear-gradient(180deg, transparent calc(33.33% - 0.5px), rgba(255, 255, 255, 0.55) 0 calc(33.33% + 0.5px), transparent 0 calc(66.66% - 0.5px), rgba(255, 255, 255, 0.55) 0 calc(66.66% + 0.5px), transparent 0);
    }
    .moving .thirds {
      opacity: 1;
    }
    .loading {
      position: absolute;
      inset: 0;
    }
    .center {
      text-align: center;
      margin: 0;
    }
    .tools {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .slider {
      display: grid;
      gap: 6px;
    }
    .slider-head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
      font-weight: 650;
    }
    .slider-head .num {
      color: var(--fg-2);
      font-weight: 600;
    }
    .slider-head .grow {
      margin-left: auto;
    }
    .fit {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 30px;
      margin-block: -4px;
      padding: 4px 11px;
      border-radius: var(--radius-pill);
      background: var(--accent-soft);
      color: var(--accent-text);
      font-size: var(--fs-s);
      font-weight: 650;
    }
    .fit:disabled {
      opacity: 0.45;
    }
    /* 1.17: the thumbs away from the left edge of the screen, where a touch is the back swipe */
    .slider {
      padding-inline: 8px;
    }
    input[type='range'] {
      width: 100%;
      height: 32px;
      margin: 0;
      accent-color: var(--accent);
    }
    .bg {
      display: grid;
      gap: var(--space-2);
    }
    .bg .label,
    .bg p {
      margin: 0;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip-bg {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      padding: 8px 14px 8px 10px;
      border-radius: var(--radius-pill);
      box-shadow: inset 0 0 0 1px var(--line-strong);
      color: var(--fg-2);
      font-size: var(--fs-s);
      font-weight: 650;
    }
    .chip-bg[aria-checked='true'] {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent);
      color: var(--accent-text);
    }
    .swatch {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      box-shadow: inset 0 0 0 1px var(--line-strong);
    }
    .swatch[data-bg='blur'] {
      background: radial-gradient(circle at 35% 35%, #f3b28c, #8a6fd1 70%);
      filter: blur(1px);
    }
    .swatch[data-bg='black'] {
      background: #000;
    }
    .swatch[data-bg='white'] {
      background: #fff;
    }
  `,
})
export class PhotoEditPage {
  private readonly confirm = inject(ConfirmService);
  readonly id = input.required<string>();
  private readonly store = inject(PhotosStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);

  protected readonly photo = computed(() => this.store.photos()?.find((p) => p.id === this.store.resolve(this.id())) ?? null);
  protected readonly missing = signal(false);
  protected readonly img = signal<HTMLImageElement | null>(null);
  protected readonly edit = signal<PhotoEdit>({ ...NO_EDIT });
  protected readonly dirty = computed(() => changed(this.edit()));
  protected readonly filter = computed(() => cssFilter(this.edit()));
  protected readonly tab = signal<'frame' | 'light'>('frame');
  protected readonly busy = signal(false);
  protected readonly moving = signal(false);
  protected readonly backgrounds = BACKGROUNDS;
  protected readonly lights: Light[] = ['brightness', 'contrast', 'saturation'];
  protected readonly angleMax = ANGLE_MAX;
  /** the size slider goes by doubling: as far from 50 % to 100 % as from 100 % to 200 % */
  /** 1.17: the smallest size, lower for a very wide photo (all of it in the frame) */
  private readonly fitOf = computed(() => {
    const img = this.img();
    const e = this.edit();
    return img ? fitZoom(img.naturalWidth || img.width, img.naturalHeight || img.height, e.turn, e.angle) : 1;
  });
  private readonly floor = computed(() => Math.min(ZOOM_MIN, this.fitOf()));
  protected readonly zoomMin = computed(() => Math.floor(Math.log2(this.floor()) * 100) / 100);
  protected readonly atFit = computed(() => Math.abs(this.edit().zoom - this.fitOf()) < 0.005 && !this.edit().x && !this.edit().y);
  protected readonly zoomMax = Math.round(Math.log2(ZOOM_MAX) * 100) / 100;
  protected readonly zoomPos = computed(() => Math.round(Math.log2(this.edit().zoom) * 100) / 100);
  protected readonly zoomText = computed(() => `${this.i18n.number(this.edit().zoom * 100)} %`);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly size = signal<{ w: number; h: number } | null>(null);
  private readonly turnOf = computed(() => this.edit().turn);
  private readonly blurred = computed(() => this.edit().background === 'blur');
  /** the blurred background, made again only when the photo turns */
  private readonly soft = computed(() => {
    const img = this.img();
    return img && this.blurred() ? softCopy(img, this.turnOf()) : null;
  });

  /** the fingers on the photo, and where the gesture started */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture: { edit: PhotoEdit; points: { x: number; y: number }[]; rect: DOMRect } | null = null;

  constructor() {
    void this.store.ensure().then((list) => this.missing.set(!list.some((p) => p.id === this.store.resolve(this.id())))).catch(() => this.missing.set(true));
    // the picture itself, once
    effect(() => {
      const p = this.photo();
      if (!p || untracked(this.img)) return;
      loadImage(p.url)
        .then((img) => this.img.set(img))
        .catch(() => this.toast.error(this.i18n.t('photos.edit.loadError')));
    });
    // the canvas follows the frame's size (and the screen's density); the frame appears with the photo list
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.measure());
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      this.stopAnim();
    });
    effect(() => {
      const f = this.frame()?.nativeElement;
      if (!f) return;
      observer?.observe(f);
      untracked(() => this.measure());
    });
    afterNextRender(() => this.measure());
    effect(() => {
      const img = this.img();
      const size = this.size();
      const e = this.edit();
      const soft = this.soft();
      const c = this.canvas()?.nativeElement;
      if (!img || !size || !c) return;
      if (c.width !== size.w || c.height !== size.h) {
        c.width = size.w;
        c.height = size.h;
      }
      draw(c.getContext('2d')!, size.w, size.h, img, e, soft);
    });
  }

  private measure(): void {
    const f = this.frame()?.nativeElement;
    if (!f) return;
    const dpr = Math.min(2.5, globalThis.devicePixelRatio || 1);
    const w = Math.round(f.clientWidth * dpr);
    if (!w) return;
    const prev = this.size();
    if (prev?.w !== w) this.size.set({ w, h: Math.round((w * 4) / 3) });
  }

  protected patch(p: Partial<PhotoEdit>): void {
    this.edit.update((e) => ({ ...e, ...p }));
  }

  protected setZoom(pos: number): void {
    this.stopAnim();
    this.patch({ zoom: clampZoom(Math.round(2 ** pos * 100) / 100, this.floor()) });
  }

  /** 1.17: « Tout voir »: the whole photo, in the middle */
  protected fit(): void {
    this.animateTo({ zoom: this.fitOf(), x: 0, y: 0 });
  }

  /** 1.17: a double tap on the photo: back to 100 % in the middle (already there: the whole photo) */
  private doubleTap(): void {
    const e = this.edit();
    const home = Math.abs(e.zoom - 1) < 0.005 && !e.x && !e.y;
    if (home && this.fitOf() < 0.995) this.fit();
    else this.animateTo({ zoom: 1, x: 0, y: 0 });
  }

  private anim = 0;

  /** to a size and a place, in a quarter of a second */
  private animateTo(to: Pick<PhotoEdit, 'zoom' | 'x' | 'y'>): void {
    this.stopAnim();
    const from = this.edit();
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 260));
      const k = 1 - (1 - t) ** 3;
      const mix = (a: number, b: number) => (t === 1 ? b : a + (b - a) * k);
      this.patch({ zoom: mix(from.zoom, to.zoom), x: mix(from.x, to.x), y: mix(from.y, to.y) });
      this.anim = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.anim = requestAnimationFrame(step);
  }

  private stopAnim(): void {
    if (this.anim) cancelAnimationFrame(this.anim);
    this.anim = 0;
  }

  protected lightPos(l: Light): number {
    return Math.round((this.edit()[l] - 1) * 100);
  }

  protected setLight(l: Light, v: number): void {
    this.patch({ [l]: Math.round(100 + v) / 100 } as Partial<PhotoEdit>);
  }

  /** « +12 », « −8 », « 0 » */
  protected signed(v: number, decimals: number): string {
    const s = this.i18n.number(Math.abs(v), decimals);
    return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
  }

  /** a quarter turn clockwise, back in the middle */
  protected turn(): void {
    this.edit.update((e) => ({ ...e, turn: ((e.turn + 1) % 4) as PhotoEdit['turn'], x: 0, y: 0 }));
  }

  protected reset(): void {
    this.stopAnim();
    this.edit.update((e) => ({ ...NO_EDIT, background: e.background as Background }));
  }

  // ── the gestures: one finger moves the photo, two size it ──────────────────

  /** 1.17: the last tap (for the double tap) and the touch going on */
  private lastTap: { t: number; x: number; y: number } | null = null;
  private press: { t: number; x: number; y: number; moved: boolean } | null = null;

  protected down(e: PointerEvent): void {
    if (!this.img() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.stopAnim();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    this.press = this.pointers.size ? null : { t: e.timeStamp, x: e.clientX, y: e.clientY, moved: false };
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.begin(e.currentTarget as Element);
    this.moving.set(true);
  }

  protected move(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId) || !this.gesture) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 10) this.press.moved = true;
    const g = this.gesture;
    const now = [...this.pointers.values()];
    const mid = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
    const a = mid(g.points);
    const b = mid(now);
    let zoom = g.edit.zoom;
    if (now.length >= 2 && g.points.length >= 2) {
      const dist = (pts: { x: number; y: number }[]) => Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      zoom = clampZoom(g.edit.zoom * (dist(now) / dist(g.points)), this.floor());
    }
    this.patch({
      zoom,
      x: clampMove(g.edit.x + (b.x - a.x) / g.rect.width),
      y: clampMove(g.edit.y + (b.y - a.y) / g.rect.height),
    });
  }

  protected up(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size) {
      this.press = null;
      this.begin(e.currentTarget as Element);
    } else {
      this.gesture = null;
      this.moving.set(false);
      const p = this.press;
      this.press = null;
      // a tap, not a move: a second one close in time and place is a double tap
      if (p && !p.moved && e.type === 'pointerup' && e.timeStamp - p.t < 300) {
        const last = this.lastTap;
        if (last && p.t - last.t < 350 && Math.hypot(p.x - last.x, p.y - last.y) < 40) {
          this.lastTap = null;
          this.doubleTap();
        } else {
          this.lastTap = { t: e.timeStamp, x: p.x, y: p.y };
        }
      }
    }
  }

  /** a mouse wheel or a trackpad sizes it too */
  protected wheel(e: WheelEvent): void {
    if (!this.img()) return;
    e.preventDefault();
    this.stopAnim();
    this.patch({ zoom: clampZoom(Math.round(this.edit().zoom * Math.exp(-e.deltaY * 0.0015) * 100) / 100, this.floor()) });
  }

  /** the gesture starts again from here (a finger added or lifted) */
  private begin(target: Element): void {
    this.gesture = { edit: this.edit(), points: [...this.pointers.values()], rect: target.getBoundingClientRect() };
  }

  /** 1.17: saved, or nothing changed: leaving asks nothing */
  private saved = false;

  /** 1.17: leaving with changes not saved (the back button, the phone's back): asked first (route guard confirmLeave) */
  canLeave(): boolean | Promise<boolean> {
    return this.saved || !this.dirty() || this.confirm.askSentence(this.i18n.t('photos.edit.leaveConfirm'), this.i18n.t('photos.edit.leaveOk'));
  }

  protected async save(): Promise<void> {
    const img = this.img();
    const p = this.photo();
    if (!img || !p) return;
    this.busy.set(true);
    try {
      const blob = await prepareImage(render(img, this.edit()));
      const photo = await this.store.replace(p.id, blob);
      this.saved = true;
      this.toast.show(this.i18n.t('photos.edit.saved'));
      this.stack.back(`/app/photos/${photo.id}`);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
