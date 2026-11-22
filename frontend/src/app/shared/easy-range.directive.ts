import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { isIos } from '../core/ui/haptics';

/** the half-width of the iPhone's slider thumb, and how close to it a touch counts as grabbing it */
const THUMB = 14;
const GRAB = 22;

/**
 * 1.17: on an iPhone a slider only moves when its round thumb is grabbed exactly; a finger that lands a little beside it
 * did nothing (and near the left edge of the screen, started the back swipe). Here a horizontal drag that starts anywhere
 * on the slider moves it from where it is, as far as the finger goes (no jump to the finger); a vertical one still
 * scrolls the page. On a touch on the thumb itself, the phone's own handling stays. Other phones already do this.
 */
@Directive({ selector: 'input[type=range]' })
export class EasyRangeDirective {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private drag: { x: number; y: number; from: number; locked: boolean } | null = null;

  constructor() {
    const start = (e: TouchEvent) => this.start(e);
    const move = (e: TouchEvent) => this.move(e);
    const end = () => this.end();
    afterNextRender(() => {
      if (!isIos()) return;
      this.el.addEventListener('touchstart', start, { passive: true });
      // not passive: once the drag is the slider's, the page must not scroll
      this.el.addEventListener('touchmove', move, { passive: false });
      this.el.addEventListener('touchend', end);
      this.el.addEventListener('touchcancel', end);
    });
    inject(DestroyRef).onDestroy(() => {
      this.el.removeEventListener('touchstart', start);
      this.el.removeEventListener('touchmove', move);
      this.el.removeEventListener('touchend', end);
      this.el.removeEventListener('touchcancel', end);
    });
  }

  private bounds(): { min: number; max: number; step: number } {
    return { min: Number(this.el.min || 0), max: Number(this.el.max || 100), step: Number(this.el.step) || 1 };
  }

  private start(e: TouchEvent): void {
    this.drag = null;
    if (e.touches.length !== 1 || this.el.disabled) return;
    const t = e.touches[0];
    const r = this.el.getBoundingClientRect();
    const { min, max } = this.bounds();
    const share = max > min ? (Number(this.el.value) - min) / (max - min) : 0;
    const thumb = r.left + THUMB + share * (r.width - 2 * THUMB);
    if (Math.abs(t.clientX - thumb) <= GRAB) return;
    this.drag = { x: t.clientX, y: t.clientY, from: Number(this.el.value), locked: false };
  }

  private move(e: TouchEvent): void {
    const d = this.drag;
    if (!d) return;
    const t = e.touches[0];
    const dx = t.clientX - d.x;
    const dy = t.clientY - d.y;
    if (!d.locked) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        this.drag = null;
        return;
      }
      if (Math.abs(dx) < 6) return;
      d.locked = true;
    }
    if (e.cancelable) e.preventDefault();
    const { min, max, step } = this.bounds();
    const width = Math.max(1, this.el.getBoundingClientRect().width - 2 * THUMB);
    const raw = d.from + (dx / width) * (max - min);
    const v = Math.min(max, Math.max(min, min + Math.round((raw - min) / step) * step));
    const text = String(Math.round(v * 1e6) / 1e6);
    if (this.el.value !== text) {
      this.el.value = text;
      this.el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  private end(): void {
    if (this.drag?.locked) this.el.dispatchEvent(new Event('change', { bubbles: true }));
    this.drag = null;
  }
}
