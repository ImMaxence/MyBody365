import { DOCUMENT, DestroyRef, Directive, ElementRef, PLATFORM_ID, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { haptic } from '../core/ui/haptics';

/** how far a row slides open (the width of its actions), and how far the finger must pull for it to stay open */
const OPEN = 152;
const ENOUGH = 56;

/** the row open now: opening another one closes it, as in a phone's lists */
const opened = signal<HTMLElement | null>(null);

/**
 * 1.19: the actions of a row behind it, as in a phone's lists: a swipe to the left uncovers them (the row follows the finger,
 * then stays open or closes back when let go), a tap on the row or elsewhere closes it. Put on the element that moves (the
 * row itself), inside a container holding the actions (`.swipe-actions`) under it. A drag never counts as a tap on the
 * row. Vertical scrolling stays the page's (touch-action: pan-y).
 */
@Directive({
  selector: '[appSwipeRow]',
  host: {
    '[style.touch-action]': "'pan-y'",
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up($event)',
    '(pointercancel)': 'cancel()',
  },
})
export class SwipeRowDirective {
  /** off: the row does not slide (a line waiting for the network) */
  readonly appSwipeRow = input(true);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly doc = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private x0 = 0;
  private y0 = 0;
  private dx = 0;
  private base = 0;
  private dragging = false;
  private decided = false;
  private moved = false;
  private hide?: ReturnType<typeof setTimeout>;

  constructor() {
    if (!this.browser) return;
    // another row opened (or this one closed from outside): back in place
    effect(() => {
      if (opened() !== this.el && this.isOpen()) this.place(0, true);
    });
    const outside = (e: Event) => {
      if (this.el.contains(e.target as Node)) return;
      // a new gesture elsewhere: the drag of this row is over
      this.moved = false;
      if (opened() === this.el && !this.el.parentElement?.contains(e.target as Node)) this.close();
    };
    this.doc.addEventListener('pointerdown', outside, true);
    // one of the actions used: the row comes back over them (not the click that ends the drag opening it)
    const used = (e: Event) => {
      if (opened() === this.el && !this.moved && !this.el.contains(e.target as Node)) this.close();
    };
    this.doc.addEventListener('click', used);
    // before the row's own click (capture, on the row): a drag, or a tap that closes it, opens nothing
    const click = (e: MouseEvent) => this.click(e);
    this.el.addEventListener('click', click, true);
    inject(DestroyRef).onDestroy(() => {
      this.doc.removeEventListener('pointerdown', outside, true);
      this.doc.removeEventListener('click', used);
      this.el.removeEventListener('click', click, true);
      if (opened() === this.el) opened.set(null);
    });
  }

  protected down(e: PointerEvent): void {
    if (!this.appSwipeRow() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.x0 = e.clientX;
    this.y0 = e.clientY;
    this.dx = 0;
    this.base = this.isOpen() ? -OPEN : 0;
    this.dragging = true;
    this.decided = false;
    this.moved = false;
  }

  protected move(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.x0;
    const dy = e.clientY - this.y0;
    if (!this.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      this.decided = true;
      // a vertical move is the page's scroll
      if (Math.abs(dy) > Math.abs(dx)) {
        this.dragging = false;
        return;
      }
      this.el.setPointerCapture?.(e.pointerId);
    }
    this.moved = true;
    this.dx = dx;
    // past the actions, the row resists
    let x = this.base + dx;
    if (x < -OPEN) x = -OPEN - (-OPEN - x) * 0.25;
    if (x > 0) x = x * 0.2;
    this.place(x, false);
  }

  protected up(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.el.releasePointerCapture?.(e.pointerId);
    if (!this.moved) return;
    const open = this.base === 0 ? this.dx < -ENOUGH : this.dx < ENOUGH;
    if (open) this.open();
    else this.close();
  }

  protected cancel(): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved) (this.base ? this.open() : this.close());
  }

  /** a drag is not a tap; a tap on an open row closes it */
  private click(e: MouseEvent): void {
    if (this.moved || this.isOpen()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!this.moved) this.close();
      this.moved = false;
    }
  }

  close(): void {
    this.place(0, true);
    if (opened() === this.el) opened.set(null);
  }

  private open(): void {
    if (!this.isOpen()) haptic('tap');
    this.place(-OPEN, true);
    opened.set(this.el);
  }

  private isOpen(): boolean {
    return this.el.dataset['open'] === '1';
  }

  private place(x: number, settle: boolean): void {
    this.el.style.transition = settle ? 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    this.el.style.transform = x ? `translateX(${x}px)` : '';
    this.el.dataset['open'] = settle && x < 0 ? '1' : settle ? '0' : this.el.dataset['open'] ?? '0';
    // the actions show only while the row is moved (else their edges would bleed around it); hidden once it is back
    const holder = this.el.parentElement;
    if (!holder) return;
    if (x) {
      holder.dataset['swiping'] = '';
    } else {
      clearTimeout(this.hide);
      this.hide = setTimeout(() => {
        if (!this.el.style.transform) delete holder.dataset['swiping'];
      }, settle ? 340 : 0);
    }
  }
}
