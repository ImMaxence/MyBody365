import { DOCUMENT, Injectable, inject } from '@angular/core';

export interface ZoomAction {
  label: string;
  run: () => void;
}

/**
 * A profile picture opened big (1.9), as on Instagram: it grows from where it was tapped to a large circle in the
 * middle of a dimmed screen, and goes back to its place on a tap anywhere, Escape or the back button of the
 * keyboard. Built on the spot (no component to place on each screen); styles in styles/components.css.
 */
@Injectable({ providedIn: 'root' })
export class AvatarZoom {
  private readonly doc = inject(DOCUMENT);
  private current: { close: () => void } | null = null;

  open(from: Element, src: string, name: string, action?: ZoomAction): void {
    const win = this.doc.defaultView;
    if (!win) return;
    this.current?.close();
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = from.getBoundingClientRect();

    const layer = this.doc.createElement('div');
    layer.className = 'avatar-zoom';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', name);
    layer.tabIndex = -1;
    const img = this.doc.createElement('img');
    img.src = src;
    img.alt = name;
    img.referrerPolicy = 'no-referrer';
    img.className = 'avatar-zoom-img';
    const caption = this.doc.createElement('p');
    caption.className = 'avatar-zoom-name';
    caption.textContent = name;
    layer.append(img, caption);
    let button: HTMLButtonElement | null = null;
    if (action) {
      button = this.doc.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-secondary avatar-zoom-action';
      button.textContent = action.label;
      layer.append(button);
    }
    this.doc.body.append(layer);

    // from the small circle to the big one: the picture moves and grows (FLIP)
    const end = img.getBoundingClientRect();
    const fromTransform = () => {
      const r = from.isConnected ? from.getBoundingClientRect() : start;
      const scale = r.width / Math.max(1, end.width);
      const dx = r.left + r.width / 2 - (end.left + end.width / 2);
      const dy = r.top + r.height / 2 - (end.top + end.height / 2);
      return `translate(${dx}px, ${dy}px) scale(${scale})`;
    };
    const timing: KeyframeAnimationOptions = { duration: reduced ? 0 : 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'both' };
    img.animate([{ transform: fromTransform() }, { transform: 'none' }], timing);
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, duration: reduced ? 0 : 260 });
    // the small one hides while its big copy is out: a single picture on screen
    (from as HTMLElement).style.visibility = 'hidden';

    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      this.current = null;
      win.removeEventListener('keydown', onKey);
      const back = img.animate([{ transform: 'none' }, { transform: fromTransform() }], { ...timing, duration: reduced ? 0 : 300 });
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, duration: reduced ? 0 : 300 });
      back.finished.finally(() => {
        (from as HTMLElement).style.visibility = '';
        layer.remove();
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    win.addEventListener('keydown', onKey);
    layer.addEventListener('click', (e) => {
      if (button && e.target === button) {
        close();
        action?.run();
        return;
      }
      close();
    });
    this.current = { close };
    (button ?? layer).focus?.();
  }
}
