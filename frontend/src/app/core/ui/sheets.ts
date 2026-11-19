/**
 * Every bottom sheet (<dialog class="sheet">) closes like on a phone, with no code in the screens:
 * a click outside it (the backdrop), a tap on its grip, a swipe down from its top, or Escape.
 * It slides out instead of vanishing.
 */
/** closes a sheet with its slide-out (screens call it too, after a choice made in the sheet) */
export function closeSheet(dialog: HTMLDialogElement): void {
  const view = dialog.ownerDocument.defaultView;
  if (!dialog.open || dialog.classList.contains('closing')) return;
  if (!view || view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dialog.close();
    return;
  }
  dialog.classList.add('closing');
  const done = () => {
    dialog.removeEventListener('animationend', onEnd);
    if (!dialog.classList.contains('closing')) return;
    dialog.classList.remove('closing');
    dialog.style.removeProperty('transform');
    dialog.close();
  };
  // only the sheet's own slide-out (the animations inside it bubble up too)
  const onEnd = (e: AnimationEvent) => e.target === dialog && done();
  dialog.addEventListener('animationend', onEnd);
  // a safety net if the animation never runs
  view.setTimeout(done, 400);
}

/**
 * Opening a sheet never opens the phone keyboard by itself: the focus goes to its grip (a "dismiss" button
 * for screen readers) instead of its first field, unless a field asks for it with `autofocus`. A tap on the
 * field opens the keyboard as usual.
 */
function noKeyboardOnOpen(doc: Document, view: Window & typeof globalThis): void {
  const proto = view.HTMLDialogElement.prototype;
  const original = proto.showModal;
  const isField = (el: Element | null) => !!el?.matches('input:not([type=checkbox]):not([type=radio]), textarea, select');
  proto.showModal = function (this: HTMLDialogElement) {
    const grip = this.classList.contains('sheet') ? this.querySelector<HTMLElement>(':scope > .sheet-grip') : null;
    const wanted = this.querySelector('[autofocus]');
    if (grip && (!wanted || wanted === grip)) {
      grip.tabIndex = -1;
      grip.setAttribute('autofocus', '');
      grip.setAttribute('role', 'button');
      grip.setAttribute('aria-label', doc.documentElement.lang === 'en' ? 'Dismiss the panel' : 'Masquer le panneau');
    }
    original.call(this);
    // older engines focus the first field anyway
    if (grip && isField(doc.activeElement) && !doc.activeElement?.hasAttribute('autofocus')) grip.focus({ preventScroll: true });
  };
}

/**
 * The phone keyboard covers the bottom of the screen without resizing the page (iOS): the space it takes
 * is kept in --kb, and an open sheet sits right above it.
 */
function followKeyboard(doc: Document, view: Window): void {
  const vv = view.visualViewport;
  if (!vv) return;
  const root = doc.documentElement;
  let open = false;
  const update = () => {
    // 1.12: only the heights tell the keyboard. iOS moves the visual viewport (offsetTop) while the page bounces past
    // its top or its bottom: read as a keyboard, a hard pull down hid the tab bar at once, and a long pull up pushed it
    // further down the further the finger went.
    const shorter = view.innerHeight - vv.height;
    const kb = Math.max(0, Math.round(shorter - Math.max(0, vv.offsetTop)));
    // 1.11.1: iOS, as an installed app, sometimes keeps the page as short as it was with the keyboard once the keyboard
    // is gone (or back from the background): what is fixed at the bottom (the tab bar, the toasts) then floats in the
    // middle of the screen. The gap between what is seen and that short page is measured, the fixed bars go down by it.
    const stuck = Math.round(-shorter);
    root.style.setProperty('--kb', `${shorter > 120 ? kb : 0}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--vv-stuck', `${stuck > 2 ? stuck : 0}px`);
    // the keyboard up: the tab bar steps aside (it would float above the keyboard, or under the finger)
    const nowOpen = shorter > 120;
    root.classList.toggle('keyboard-open', nowOpen);
    if (open && !nowOpen) unstick();
    open = nowOpen;
  };
  /** a one-pixel scroll there and back: WebKit lays out what is fixed again, at the real bottom */
  const unstick = () =>
    setTimeout(() => {
      const x = view.scrollX;
      const y = view.scrollY;
      view.scrollTo(x, y > 0 ? y - 1 : y + 1);
      view.scrollTo(x, y);
      update();
    }, 80);
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  view.addEventListener('resize', update);
  view.addEventListener('pageshow', update);
  // the keyboard closes a moment after the field loses the focus
  doc.addEventListener('focusout', () => setTimeout(update, 350));
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return;
    update();
    unstick();
  });
  update();
}

export function installSheets(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  const close = closeSheet;
  noKeyboardOnOpen(doc, view);
  followKeyboard(doc, view);

  // the grip is a button for the keyboard too
  doc.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if ((e.key === 'Enter' || e.key === ' ') && t?.classList.contains('sheet-grip')) {
      e.preventDefault();
      const d = t.closest('dialog.sheet') as HTMLDialogElement | null;
      if (d) close(d);
    }
  });

  doc.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.classList.contains('sheet-grip')) {
      const d = t.closest('dialog.sheet') as HTMLDialogElement | null;
      if (d) close(d);
      return;
    }
    // the backdrop belongs to the dialog: a click on it lands outside the dialog's box
    if (t instanceof HTMLDialogElement && t.classList.contains('sheet') && t.open) {
      const r = t.getBoundingClientRect();
      const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (outside && (e.clientX !== 0 || e.clientY !== 0)) close(t);
    }
  });

  // Pull down to close, like a sheet on iOS: from anywhere, once its content is at its very top (scrolling a long
  // sheet back up first, then going on down, carries the sheet along). Touch events, not pointer events: the
  // browser cancels a pointer as soon as it scrolls (the sheet then never moved); a touch can be kept, the scroll
  // stopped and the sheet follows the finger. Let go far enough, or with a flick, and it closes.
  let drag: { dialog: HTMLDialogElement; from: number; at: number | null; lastY: number; lastT: number; speed: number; dy: number } | null = null;
  const release = (dialog: HTMLDialogElement) => {
    dialog.style.transition = 'transform 260ms cubic-bezier(0.34, 1.4, 0.5, 1)';
    dialog.style.transform = '';
    view.setTimeout(() => dialog.style.removeProperty('transition'), 280);
  };
  doc.addEventListener(
    'touchstart',
    (e) => {
      drag = null;
      const t = e.target as HTMLElement | null;
      const dialog = t?.closest('dialog.sheet') as HTMLDialogElement | null;
      if (e.touches.length !== 1 || !dialog || !dialog.open) return;
      if (t?.closest('input, textarea, select, [role=slider], video, .no-swipe')) return;
      const y = e.touches[0].clientY;
      drag = { dialog, from: y, at: null, lastY: y, lastT: e.timeStamp, speed: 0, dy: 0 };
    },
    { passive: true },
  );
  doc.addEventListener(
    'touchmove',
    (e) => {
      if (!drag) return;
      const y = e.touches[0].clientY;
      drag.speed = 0.6 * drag.speed + 0.4 * ((y - drag.lastY) / Math.max(1, e.timeStamp - drag.lastT));
      drag.lastY = y;
      drag.lastT = e.timeStamp;
      const atTop = drag.dialog.scrollTop <= 0;
      if (drag.at === null) {
        // the content scrolls; the sheet joins in once the content is at its top and the finger goes down
        if (!atTop || y <= drag.from + 2) {
          drag.from = Math.min(drag.from, y);
          if (!atTop) drag.from = y;
          return;
        }
        // from where the finger was at the top, not from here (the move so far counts)
        drag.at = drag.from;
      }
      const dy = y - drag.at;
      if (dy <= 0) {
        // back up past where it started: the content scrolls again
        drag.dialog.style.transform = '';
        drag.at = null;
        drag.from = y;
        drag.dy = 0;
        return;
      }
      if (e.cancelable) e.preventDefault();
      drag.dy = dy;
      drag.dialog.style.transform = `translateY(${dy}px)`;
    },
    { passive: false },
  );
  const end = (e: TouchEvent) => {
    if (!drag) return;
    const { dialog, dy, speed, lastT } = drag;
    drag = null;
    if (dy <= 0) return;
    const flick = speed > 0.5 && e.timeStamp - lastT < 90 && dy > 30;
    if (dy > 110 || flick) close(dialog);
    else release(dialog);
  };
  doc.addEventListener('touchend', end);
  doc.addEventListener('touchcancel', end);
}
