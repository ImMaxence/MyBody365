import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { MealsStore } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

type State = 'starting' | 'scanning' | 'looking' | 'denied' | 'unavailable';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/**
 * Barcode scanner, full screen: the browser's own detector where there is one (Android), ZXing loaded on
 * demand otherwise (iPhone). The product found goes back to the add screen, ready for its amount.
 */
@Component({
  selector: 'app-barcode-scan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent],
  template: `
    <main class="scan">
      <video #video playsinline muted autoplay></video>
      <div class="frame" [class.found]="state() === 'looking'" aria-hidden="true"><i></i></div>

      <header class="top">
        <button type="button" class="round" [attr.aria-label]="'meals.scan.close' | t" (click)="close()"><app-icon name="x" /></button>
        <h1 class="top-title">{{ 'meals.scan.title' | t }}</h1>
        <span class="round-space"></span>
      </header>

      <footer class="bottom">
        @switch (state()) {
          @case ('looking') {
            <p class="msg">{{ 'meals.scan.looking' | t }}</p>
          }
          @case ('denied') {
            <p class="msg">{{ 'meals.scan.denied' | t }}</p>
          }
          @case ('unavailable') {
            <p class="msg">{{ 'meals.scan.unavailable' | t }}</p>
          }
          @default {
            <p class="msg">{{ 'meals.scan.hint' | t }}</p>
          }
        }
        <form class="manual" (ngSubmit)="lookup(code)">
          <input class="input" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="14" autocomplete="off" [(ngModel)]="code"
            [attr.aria-label]="'meals.scan.manualLabel' | t" [placeholder]="'meals.scan.manual' | t" />
          <button type="submit" class="btn btn-primary" [disabled]="code.length < 8 || state() === 'looking'">{{ 'meals.scan.search' | t }}</button>
        </form>
      </footer>
    </main>
  `,
  styles: `
    .scan {
      position: fixed;
      inset: 0;
      z-index: 60;
      background: #050506;
      color: #fff;
      overflow: hidden;
    }
    video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .frame {
      position: absolute;
      left: 50%;
      top: 42%;
      width: min(78vw, 340px);
      aspect-ratio: 16 / 9;
      transform: translate(-50%, -50%);
      border-radius: 22px;
      box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.5);
      outline: 3px solid #fff;
      transition: outline-color var(--dur-2);
    }
    .frame.found {
      outline-color: var(--accent);
    }
    .frame i {
      position: absolute;
      left: 8%;
      right: 8%;
      top: 50%;
      height: 2px;
      background: var(--accent);
      box-shadow: 0 0 12px var(--accent);
      animation: sweep 1.6s ease-in-out infinite alternate;
    }
    @keyframes sweep {
      from {
        transform: translateY(-38px);
      }
      to {
        transform: translateY(38px);
      }
    }
    .top,
    .bottom {
      position: absolute;
      left: 0;
      right: 0;
      z-index: 2;
      padding-inline: var(--space-4);
    }
    .top {
      top: 0;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      padding-top: calc(var(--safe-top) + var(--space-3));
    }
    .top-title {
      text-align: center;
      font-size: 1.05rem;
      font-weight: 750;
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
      background: rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: #fff;
    }
    .bottom {
      bottom: 0;
      display: grid;
      gap: var(--space-3);
      justify-items: center;
      padding-bottom: calc(var(--safe-bottom) + var(--space-5));
    }
    .msg {
      text-align: center;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
    }
    .manual {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-2);
      width: min(100%, 26rem);
    }
    @media (prefers-reduced-motion: reduce) {
      .frame i {
        animation: none;
      }
    }
  `,
})
export class BarcodeScanPage {
  private readonly api = inject(MealsApi);
  private readonly store = inject(MealsStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  private readonly i18n = inject(I18nService);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly state = signal<State>('starting');
  protected code = '';
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private zxing: { stop(): void } | null = null;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.set('unavailable');
      return;
    }
    try {
      // asked in landscape, as the sensor is: iOS then gives upright frames (asked otherwise, a cropped picture, like a zoom)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      await v.play().catch(() => undefined);
      this.state.set('scanning');
      await this.detect(v);
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.state.set(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  }

  private async detect(v: HTMLVideoElement): Promise<void> {
    const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (Native) {
      const detector = new Native({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      this.timer = setInterval(async () => {
        if (this.state() !== 'scanning') return;
        const codes = await detector.detect(v).catch(() => []);
        if (codes[0]?.rawValue) void this.lookup(codes[0].rawValue);
      }, 250);
      return;
    }
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
    const reader = new BrowserMultiFormatReader(hints);
    this.zxing = await reader.decodeFromVideoElement(v, (result) => {
      if (result && this.state() === 'scanning') void this.lookup(result.getText());
    });
  }

  protected async lookup(raw: string): Promise<void> {
    const code = raw.replace(/\D/g, '');
    if (code.length < 8) return;
    this.state.set('looking');
    navigator.vibrate?.(30);
    try {
      const food = await this.api.barcode(code);
      this.store.pick.set({ kind: 'FOOD', id: food.id });
      this.stack.back('/app/meals/add');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
      this.state.set(this.stream ? 'scanning' : 'unavailable');
    }
  }

  protected close(): void {
    this.stack.back('/app/meals/add');
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.zxing?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
