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

export function installSheets(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  const close = closeSheet;

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

  // swipe down from the top of a sheet (or anywhere when it is scrolled to the top)
  let drag: { dialog: HTMLDialogElement; y: number; dy: number; id: number } | null = null;
  doc.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement | null;
    const dialog = t?.closest('dialog.sheet') as HTMLDialogElement | null;
    if (!dialog || !dialog.open || e.pointerType === 'mouse') return;
    if (t?.closest('input, textarea, select, button, a, [role=slider], video, .no-swipe')) return;
    const fromTop = e.clientY - dialog.getBoundingClientRect().top;
    if (dialog.scrollTop > 0 && fromTop > 56) return;
    drag = { dialog, y: e.clientY, dy: 0, id: e.pointerId };
  });
  doc.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
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
      dialog.style.transition = 'transform 260ms cubic-bezier(0.34, 1.4, 0.5, 1)';
      dialog.style.transform = '';
      view.setTimeout(() => dialog.style.removeProperty('transition'), 280);
    }
  };
  doc.addEventListener('pointerup', end);
  doc.addEventListener('pointercancel', end);
}
