/**
 * 1.20: a photo that grows from where it was tapped into the screen it opens (the Photos grid to the viewer), and shrinks
 * back into its place on the way back, as in a phone's gallery. The grid marks the tile touched (its picture, where it is);
 * the stack navigation (StackNavigation) flies a copy of the picture between the two places in place of its push or pop.
 * A tile carries `data-zoom-key` (the photo's id), the viewer's picture `data-zoom-target` with the same key.
 */
export interface ZoomPlace {
  key: string;
  rect: DOMRect;
  src: string;
  radius: string;
}

let touched: ZoomPlace | null = null;

/** the tile under the finger, just before its link opens the viewer */
export function markZoom(tile: EventTarget | null): void {
  const el = tile instanceof HTMLElement ? tile : null;
  const key = el?.dataset['zoomKey'];
  const img = el?.querySelector('img');
  if (!el || !key || !img) return;
  touched = { key, rect: img.getBoundingClientRect(), src: img.currentSrc || img.src, radius: getComputedStyle(el).borderRadius };
}

/** what the next navigation zooms from (taken once) */
export function takeZoom(): ZoomPlace | null {
  const z = touched;
  touched = null;
  return z;
}

/** the picture flying between the two places, over everything, still */
export function flyer(doc: Document, from: { rect: DOMRect; src: string; radius: string }): HTMLImageElement {
  const img = doc.createElement('img');
  img.src = from.src;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.className = 'zoom-flyer';
  Object.assign(img.style, {
    position: 'fixed',
    left: `${from.rect.left}px`,
    top: `${from.rect.top}px`,
    width: `${from.rect.width}px`,
    height: `${from.rect.height}px`,
    objectFit: 'cover',
    borderRadius: from.radius,
    zIndex: '98',
    pointerEvents: 'none',
    margin: '0',
  });
  doc.body.appendChild(img);
  return img;
}

/** the frames of a flight from a box to another */
export function flight(from: DOMRect, to: DOMRect, fromRadius: string, toRadius: string): Keyframe[] {
  const box = (r: DOMRect, radius: string): Keyframe => ({
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    borderRadius: radius,
  });
  return [box(from, fromRadius), box(to, toRadius)];
}
