/**
 * 1.20: the press effect of a button (it sinks, it darkens) only for a real tap. A phone lit `:active` the moment a finger came
 * down, so scrolling the page with the finger starting on a button flashed it, as a hover would. The styles now use the class
 * `is-pressed` where they used `:active`; it is put on what the finger touched and on its ancestors (as `:active` is), after
 * 60 ms without the finger moving, taken off as soon as the page scrolls (the browser cancels the pointer) or the finger
 * slides; a quick tap still shows it for an instant. A mouse presses at once.
 */
const CLASS = 'is-pressed';
const DELAY_MS = 60;
const FLASH_MS = 120;

export function installPress(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  let chain: Element[] = [];
  let timer = 0;
  let x0 = 0;
  let y0 = 0;
  const mark = (els: Element[], on: boolean) => {
    for (const el of els) el.classList.toggle(CLASS, on);
  };
  const cancel = () => {
    view.clearTimeout(timer);
    timer = 0;
    mark(chain, false);
    chain = [];
  };
  const opts: AddEventListenerOptions = { capture: true, passive: true };

  doc.addEventListener(
    'pointerdown',
    (e) => {
      cancel();
      if (e.button !== 0) return;
      const list: Element[] = [];
      for (let el = e.target as Element | null; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) list.push(el);
      chain = list;
      x0 = e.clientX;
      y0 = e.clientY;
      if (e.pointerType === 'mouse') {
        mark(chain, true);
        return;
      }
      timer = view.setTimeout(() => {
        timer = 0;
        mark(chain, true);
      }, DELAY_MS);
    },
    opts,
  );
  // the finger slides (a row swiped, a slider): no press
  doc.addEventListener(
    'pointermove',
    (e) => {
      if (chain.length && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancel();
    },
    opts,
  );
  // the page scrolls: the browser takes the pointer back
  doc.addEventListener('pointercancel', cancel, opts);
  doc.addEventListener(
    'pointerup',
    () => {
      if (!chain.length) return;
      const els = chain;
      const quick = timer !== 0;
      view.clearTimeout(timer);
      timer = 0;
      chain = [];
      // a quick tap: the press for an instant, so the finger feels it was taken
      if (quick) mark(els, true);
      view.setTimeout(() => mark(els, false), quick ? FLASH_MS : 0);
    },
    opts,
  );
}
