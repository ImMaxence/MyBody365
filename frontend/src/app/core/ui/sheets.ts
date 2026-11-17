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
  const update = () => {
    const kb = Math.max(0, Math.round(view.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty('--kb', `${kb}px`);
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
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

  // swipe down to close: from the grip, or anywhere while the sheet is scrolled to its very top. Scrolling a
  // long sheet back up never closes it (it did when the finger started near its top)
  let drag: { dialog: HTMLDialogElement; y: number; dy: number; id: number } | null = null;
  const release = (dialog: HTMLDialogElement) => {
    dialog.style.transition = 'transform 260ms cubic-bezier(0.34, 1.4, 0.5, 1)';
    dialog.style.transform = '';
    view.setTimeout(() => dialog.style.removeProperty('transition'), 280);
  };
  doc.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement | null;
    const dialog = t?.closest('dialog.sheet') as HTMLDialogElement | null;
    if (!dialog || !dialog.open || e.pointerType === 'mouse') return;
    if (t?.closest('input, textarea, select, button, a, [role=slider], video, .no-swipe')) return;
    const onGrip = !!t?.classList.contains('sheet-grip');
    if (!onGrip && dialog.scrollTop > 0) return;
    drag = { dialog, y: e.clientY, dy: 0, id: e.pointerId };
  });
  doc.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y;
      // moving up, or the content scrolled meanwhile: this is a scroll, not a close
      if (dy < -4 || drag.dialog.scrollTop > 0) {
        const d = drag.dialog;
        drag = null;
        if (d.style.transform) release(d);
        return;
      }
      drag.dy = Math.max(0, dy);
      if (drag.dy > 4) drag.dialog.style.transform = `translateY(${drag.dy}px)`;
    },
    { passive: true },
  );
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dialog, dy } = drag;
    drag = null;
    if (dy > 90) {
      close(dialog);
    } else {
      release(dialog);
    }
  };
  doc.addEventListener('pointerup', end);
  doc.addEventListener('pointercancel', end);
}
