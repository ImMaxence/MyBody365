import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Pose } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { readPref, writePref } from '../../core/ui/device-prefs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { prepareImage } from '../../core/photos/image-tools';
import { POSES, PhotosStore } from '../../core/photos/photos.store';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** loading: a picture picked in the gallery from the Photos tab, on its way to the preview */
type State = 'loading' | 'starting' | 'live' | 'denied' | 'unavailable' | 'preview' | 'saving';
const TIMERS = [0, 3, 10] as const;
type Timer = (typeof TIMERS)[number];

/** the camera last used on this phone */
const FACING_KEY = 'mb.cameraFacing';
/** the self-timer last chosen on this phone (1.10: none until one is chosen) */
const TIMER_KEY = 'mb.cameraTimer';

function savedTimer(): Timer {
  const n = Number(readPref(TIMER_KEY));
  return TIMERS.find((t) => t === n) ?? 0;
}

/**
 * The daily photo, full screen: the live camera with the last photo of the same pose as an overlay
 * (same framing every day), a self-timer to step back if wanted, then a preview before keeping it.
 */

@Component({
  selector: 'app-camera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <main class="cam" [class.live]="state() === 'live'">
      <!-- the photo's own frame (3:4, upright), like the camera of the phone: what is seen is what is kept -->
      <div class="stage">
        <video #video playsinline muted autoplay [class.mirror]="facing() === 'user'" [hidden]="state() === 'preview' || state() === 'saving'"
          (loadedmetadata)="fitStream()"></video>

        @if (ghostOn() && ghostUrl() && state() === 'live') {
          <img class="ghost" [src]="ghostUrl()" alt="" [class.mirror]="facing() === 'user'" />
        }
        @if (state() === 'live') {
          <div class="guides" aria-hidden="true"><i></i><i></i></div>
        }
        @if (previewUrl() && (state() === 'preview' || state() === 'saving')) {
          <img class="preview" [src]="previewUrl()" alt="" />
        }
      </div>
      @if (countdown() > 0) {
        @for (n of [countdown()]; track n) {
          <span class="countdown num" aria-live="assertive">{{ n }}</span>
        }
      }
      @if (flash()) {
        <span class="flash" aria-hidden="true"></span>
      }

      <header class="top">
        <button type="button" class="round" [attr.aria-label]="'photos.camera.close' | t" (click)="close()"><app-icon name="x" /></button>
        <div class="poses" role="radiogroup" [attr.aria-label]="'photos.title' | t">
          @for (p of poses; track p) {
            <button type="button" role="radio" [attr.aria-checked]="pose() === p" (click)="pose.set(p)">{{ 'photos.poses.' + p | t }}</button>
          }
        </div>
        <span class="round-space"></span>
      </header>

      @switch (state()) {
        @case ('starting') {
          <p class="center-msg">{{ 'photos.camera.starting' | t }}</p>
        }
        @case ('denied') {
          <div class="center-msg card-msg">
            <app-icon name="camera" [size]="30" />
            <p>{{ 'photos.camera.denied' | t }}</p>
            <button type="button" class="btn btn-primary" (click)="file.click()"><app-icon name="image" /> {{ 'photos.camera.import' | t }}</button>
          </div>
        }
        @case ('unavailable') {
          <div class="center-msg card-msg">
            <app-icon name="camera" [size]="30" />
            <p>{{ 'photos.camera.unavailable' | t }}</p>
            <button type="button" class="btn btn-primary" (click)="file.click()"><app-icon name="image" /> {{ 'photos.camera.import' | t }}</button>
          </div>
        }
      }

      <footer class="bottom">
        @if (state() === 'live') {
          <p class="tip small">{{ tipKey() | t }}</p>
          <!-- the two options in words, so that each says what it does and whether it is on -->
          <div class="options">
            <button type="button" class="pill" [class.on]="ghostOn() && !!ghostUrl()" [disabled]="!ghostUrl()" [attr.aria-pressed]="ghostOn() && !!ghostUrl()"
              [attr.aria-label]="'photos.camera.ghost' | t" (click)="ghostOn.set(!ghostOn())">
              <app-icon name="layers" [size]="16" /> {{ 'photos.camera.ghostShort' | t }}
            </button>
            <button type="button" class="pill" [class.on]="timer() > 0" [attr.aria-label]="timerLabel()" (click)="cycleTimer()">
              <app-icon name="timer" [size]="16" />
              @if (timer() > 0) {
                <span class="num">{{ 'photos.camera.timerShortOn' | t: { s: timer() } }}</span>
              } @else {
                {{ 'photos.camera.timerShort' | t }}
              }
            </button>
          </div>
          <!-- like the phone's camera: the gallery on the left, the shutter, the other camera on the right -->
          <div class="controls">
            <button type="button" class="round gallery" [attr.aria-label]="'photos.camera.import' | t" (click)="file.click()">
              <app-icon name="image" />
            </button>
            <button type="button" class="shutter" [disabled]="countdown() > 0" [attr.aria-label]="'photos.camera.shutter' | t" (click)="shoot()">
              <span></span>
            </button>
            @if (cameras() > 1) {
              <button type="button" class="round" [attr.aria-label]="'photos.camera.flip' | t" (click)="flip()"><app-icon name="switchCamera" /></button>
            } @else {
              <span class="round-space"></span>
            }
          </div>
        } @else if (state() === 'preview' || state() === 'saving') {
          <div class="choices">
            <button type="button" class="btn btn-secondary" [disabled]="state() === 'saving'" (click)="retake()"><app-icon name="repeat" /> {{ 'photos.camera.retake' | t }}</button>
            <button type="button" class="btn btn-primary" [disabled]="state() === 'saving'" (click)="keep()">
              <app-icon name="check" /> {{ (state() === 'saving' ? 'photos.camera.saving' : 'photos.camera.use') | t }}
            </button>
            <!-- 1.17: kept, then straight to its touch-up -->
            <button type="button" class="btn btn-ghost touch-up" [disabled]="state() === 'saving'" (click)="keep(true)">
              <app-icon name="sliders" /> {{ 'photos.camera.keepEdit' | t }}
            </button>
          </div>
        }
      </footer>
      <input #file type="file" accept="image/*" hidden (change)="imported($event)" />
    </main>
  `,
  styles: `
    :host {
      display: block;
    }
    .cam {
      position: fixed;
      inset: 0;
      z-index: 60;
      background: #050506;
      color: #fff;
      overflow: hidden;
    }
    /* the frame of the photo: 3:4 upright, as wide as the screen, centred between the top and the controls */
    .stage {
      position: absolute;
      top: 50%;
      left: 50%;
      width: min(100%, calc(100dvh * 3 / 4));
      aspect-ratio: 3 / 4;
      overflow: hidden;
      transform: translate(-50%, -50%);
    }
    video,
    .ghost,
    .preview {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .preview {
      animation: develop 420ms var(--ease-out);
    }
    @keyframes develop {
      from {
        transform: scale(1.04);
        filter: brightness(1.6);
      }
    }
    .mirror {
      transform: scaleX(-1);
    }
    .ghost {
      opacity: 0.34;
      mix-blend-mode: screen;
      pointer-events: none;
    }
    .guides {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .guides i {
      position: absolute;
      top: 12%;
      bottom: 12%;
      width: 1px;
      background: rgba(255, 255, 255, 0.18);
    }
    .guides i:first-child {
      left: 33.3%;
    }
    .guides i:last-child {
      left: 66.6%;
    }
    .top,
    .bottom {
      position: absolute;
      left: 0;
      right: 0;
      display: grid;
      gap: var(--space-3);
      padding-inline: var(--space-4);
      z-index: 2;
    }
    .top {
      top: 0;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      padding-top: calc(var(--safe-top) + var(--space-3));
      padding-bottom: var(--space-6);
      background: linear-gradient(rgba(0, 0, 0, 0.55), transparent);
    }
    .bottom {
      bottom: 0;
      justify-items: center;
      padding-top: var(--space-10);
      padding-bottom: calc(var(--safe-bottom) + var(--space-5));
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    }
    .round,
    .round-space {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      border-radius: 50%;
    }
    .round {
      position: relative;
      background: rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: #fff;
      transition: background-color var(--dur-2), transform var(--dur-2) var(--ease-out);
    }
    .round.is-pressed {
      transform: scale(0.92);
    }
    .round.on {
      background: #fff;
      color: #111;
    }
    .round:disabled {
      opacity: 0.35;
    }
    /* the gallery, a square like the last picture on a phone's camera */
    .round.gallery {
      border-radius: 14px;
      border: 2px solid rgba(255, 255, 255, 0.85);
    }
    .options {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-2);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 14px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: #fff;
      font-size: var(--fs-s);
      font-weight: 650;
      transition:
        background-color var(--dur-2),
        color var(--dur-2),
        transform var(--dur-2) var(--ease-out);
    }
    .pill.is-pressed {
      transform: scale(0.95);
    }
    .pill.on {
      background: #fff;
      color: #111;
    }
    .pill:disabled {
      opacity: 0.35;
    }
    .poses {
      justify-self: center;
      display: flex;
      gap: 4px;
      padding: 4px;
      border-radius: var(--radius-pill);
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .poses button {
      padding: 7px 13px;
      border-radius: var(--radius-pill);
      color: rgba(255, 255, 255, 0.82);
      font-size: var(--fs-s);
      font-weight: 650;
      transition: background-color var(--dur-2), color var(--dur-2);
    }
    .poses button[aria-checked='true'] {
      background: #fff;
      color: #111;
    }
    .tip {
      max-width: 30rem;
      text-align: center;
      color: rgba(255, 255, 255, 0.86);
    }
    .controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-10);
    }
    .shutter {
      display: grid;
      place-items: center;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 4px solid #fff;
      transition: transform var(--dur-2) var(--ease-out);
    }
    .shutter span {
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: #fff;
      transition: transform var(--dur-2) var(--ease-out), background-color var(--dur-2);
    }
    .shutter.is-pressed span {
      transform: scale(0.86);
    }
    .shutter:disabled span {
      background: var(--accent);
      transform: scale(0.6);
    }
    .choices {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
      width: min(100%, 26rem);
    }
    .choices .touch-up {
      grid-column: 1 / -1;
      color: #fff;
    }
    .center-msg {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: var(--space-4);
      padding: var(--space-8);
      text-align: center;
      color: rgba(255, 255, 255, 0.86);
    }
    .countdown {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-family: var(--font-display);
      font-stretch: 125%;
      font-weight: 900;
      font-size: 9rem;
      color: #fff;
      text-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      animation: tick 1s var(--ease-out) both;
      pointer-events: none;
      z-index: 3;
    }
    @keyframes tick {
      from {
        transform: scale(1.6);
        opacity: 0;
      }
      30% {
        transform: scale(1);
        opacity: 1;
      }
      to {
        opacity: 0.2;
      }
    }
    .flash {
      position: absolute;
      inset: 0;
      background: #fff;
      animation: flash 380ms ease-out forwards;
      pointer-events: none;
      z-index: 4;
    }
    @keyframes flash {
      to {
        opacity: 0;
      }
    }
  `,
})
export class CameraPage {
  private readonly store = inject(PhotosStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly poses = POSES;
  /** a picture already picked in the gallery (from the Photos tab): straight to its preview, no camera */
  private readonly picked = this.store.takePicked();
  protected readonly state = signal<State>(this.picked ? 'loading' : 'starting');
  protected readonly pose = signal<Pose>('FRONT');
  /** the back camera unless the front one was chosen last time on this phone (1.9: the back one is the better one) */
  protected readonly facing = signal<'user' | 'environment'>(readPref(FACING_KEY) === 'user' ? 'user' : 'environment');
  protected readonly timer = signal<Timer>(savedTimer());
  protected readonly tipKey = computed(() =>
    this.ghostOn() && this.ghostUrl() ? 'photos.camera.ghostTip' : this.timer() > 0 ? 'photos.camera.tip' : 'photos.camera.tipNoTimer',
  );
  protected readonly ghostOn = signal(true);
  protected readonly countdown = signal(0);
  protected readonly flash = signal(false);
  protected readonly cameras = signal(0);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly ghostUrl = computed(() => this.store.latest(this.pose())?.url ?? null);
  protected readonly timerLabel = computed(() =>
    this.timer() > 0 ? this.i18n.t('photos.camera.timerOn', { s: this.timer() }) : this.i18n.t('photos.camera.timerOff'),
  );

  private stream: MediaStream | null = null;
  private blob: Blob | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;

  constructor() {
    void this.store.ensure().catch(() => undefined);
    afterNextRender(() => void (this.picked ? this.usePicked(this.picked) : this.start()));
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      if (this.tick) clearInterval(this.tick);
      this.revoke();
    });
  }

  private async start(): Promise<void> {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.set('unavailable');
      return;
    }
    this.state.set('starting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // asked in landscape, as the sensor is: iOS then hands upright frames to a phone held upright (asked upright, it
        // gave landscape frames, cropped on screen like a strong zoom, and photos saved in landscape)
        video: { facingMode: this.facing(), width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      await this.zoomOne();
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      await v.play().catch(() => undefined);
      this.state.set('live');
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      this.cameras.set(devices.filter((d) => d.kind === 'videoinput').length);
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.state.set(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  }

  private stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  protected flip(): void {
    this.swapped = false;
    this.facing.set(this.facing() === 'user' ? 'environment' : 'user');
    writePref(FACING_KEY, this.facing());
    void this.start();
  }

  /** none → 3 s → 10 s, kept on this phone for the next photos */
  protected cycleTimer(): void {
    const i = TIMERS.indexOf(this.timer());
    this.timer.set(TIMERS[(i + 1) % TIMERS.length]);
    writePref(TIMER_KEY, this.timer() ? String(this.timer()) : null);
  }

  protected shoot(): void {
    if (this.timer() === 0) {
      void this.snap();
      return;
    }
    this.countdown.set(this.timer());
    this.tick = setInterval(() => {
      const n = this.countdown() - 1;
      if (n <= 0) {
        clearInterval(this.tick!);
        this.tick = null;
        this.countdown.set(0);
        void this.snap();
      } else {
        this.countdown.set(n);
      }
    }, 1000);
  }

  /** no zoom of its own: some phones start their camera zoomed in */
  private async zoomOne(): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number } }) | undefined;
    const zoom = (track?.getSettings() as MediaTrackSettings & { zoom?: number } | undefined)?.zoom;
    if (!track || !caps?.zoom || zoom === undefined || zoom === 1 || caps.zoom.min > 1 || caps.zoom.max < 1) return;
    await track.applyConstraints({ advanced: [{ zoom: 1 } as MediaTrackConstraintSet] }).catch(() => undefined);
  }

  /** still landscape frames on a phone held upright: asked once the other way round */
  private swapped = false;
  protected fitStream(): void {
    const v = this.video().nativeElement;
    const track = this.stream?.getVideoTracks()[0];
    if (this.swapped || !track || window.innerWidth > window.innerHeight || v.videoWidth <= v.videoHeight) return;
    this.swapped = true;
    void track.applyConstraints({ width: { ideal: v.videoHeight }, height: { ideal: v.videoWidth } }).catch(() => undefined);
  }

  /**
   * What the frame on screen shows, upright 3:4, as the sensor sees it (the live preview is only mirrored for
   * the front camera): the middle of the camera picture when its proportions differ
   */
  private async snap(): Promise<void> {
    const v = this.video().nativeElement;
    if (!v.videoWidth) return;
    const ratio = 3 / 4;
    let sw = v.videoWidth;
    let sh = v.videoHeight;
    if (sw / sh > ratio) sw = Math.round(sh * ratio);
    else sh = Math.round(sw / ratio);
    const sx = Math.round((v.videoWidth - sw) / 2);
    const sy = Math.round((v.videoHeight - sh) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d')!.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
    this.flash.set(true);
    setTimeout(() => this.flash.set(false), 400);
    navigator.vibrate?.(20);
    await this.showPreview(await prepareImage(canvas));
  }

  protected async imported(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      await this.showPreview(await prepareImage(file));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  /** the picture picked from the Photos tab: its preview, the pose still to choose; unreadable, the camera instead */
  private async usePicked(file: File): Promise<void> {
    try {
      await this.showPreview(await prepareImage(file));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
      void this.start();
    }
  }

  private async showPreview(blob: Blob): Promise<void> {
    this.revoke();
    this.blob = blob;
    this.previewUrl.set(URL.createObjectURL(blob));
    this.state.set('preview');
    this.video().nativeElement.pause();
  }

  protected retake(): void {
    this.revoke();
    this.blob = null;
    if (this.stream) {
      this.state.set('live');
      void this.video().nativeElement.play().catch(() => undefined);
    } else {
      void this.start();
    }
  }

  /** kept; 1.17: with `edit`, its touch-up opens in place of the camera (back from it: the Photos tab) */
  protected async keep(edit = false): Promise<void> {
    if (!this.blob) return;
    this.state.set('saving');
    try {
      const photo = await this.store.upload(this.blob, localDay(), this.pose());
      // 1.17: without network, kept on the phone (the touch-up waits for it to be sent)
      this.toast.show(this.i18n.t(photo ? 'photos.camera.saved' : edit ? 'photos.camera.queuedEdit' : 'offline.queued'));
      if (edit && photo) void this.router.navigate(['/app/photos', photo.id, 'edit'], { replaceUrl: true });
      else this.stack.back('/app/photos');
    } catch (e) {
      this.state.set('preview');
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected close(): void {
    this.stack.back('/app/photos');
  }

  private revoke(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }
}
