import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Segmented controls and filter chips get the tab bar's sliding indicator: a soft orange pill that glides
 * under the chosen option. Works on any `.seg` / `.slide-chips` / `[appSeg]` whose buttons carry aria-pressed,
 * aria-selected or aria-checked, or whose links carry aria-current="page" (styles: styles/components.css).
 */
@Directive({ selector: '.seg, .slide-chips, [appSeg]' })
export class SegDirective {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let mo: MutationObserver | null = null;
    let ro: ResizeObserver | null = null;
    afterNextRender(() => {
      el.classList.add('seg-anim');
      let first = true;
      const update = () => {
        const active = el.querySelector<HTMLElement>(
          ':scope > [aria-pressed="true"], :scope > [aria-selected="true"], :scope > [aria-checked="true"], :scope > [aria-current="page"]',
        );
        if (!active) {
          el.style.setProperty('--seg-o', '0');
          return;
        }
        el.style.setProperty('--seg-x', `${active.offsetLeft}px`);
        el.style.setProperty('--seg-y', `${active.offsetTop}px`);
        el.style.setProperty('--seg-w', `${active.offsetWidth}px`);
        el.style.setProperty('--seg-h', `${active.offsetHeight}px`);
        el.style.setProperty('--seg-o', '1');
        // a chip row that scrolls: the chosen chip comes into view. 1.14: the row alone scrolls (scrollIntoView also scrolled
        // the page sideways while it slid in from the right: the Recipes screen overshot to the left, then jumped back)
        if (el.scrollWidth > el.clientWidth) {
          const left = active.offsetLeft;
          const right = left + active.offsetWidth;
          const target = left < el.scrollLeft ? left - 8 : right > el.scrollLeft + el.clientWidth ? right - el.clientWidth + 8 : el.scrollLeft;
          if (target !== el.scrollLeft) el.scrollTo({ left: Math.max(0, target), behavior: first ? 'auto' : 'smooth' });
        }
        first = false;
      };
      update();
      // transitions on only once the indicator sits under the first choice (no slide on arrival)
      requestAnimationFrame(() => el.classList.add('seg-ready'));
      mo = new MutationObserver(update);
      mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'aria-checked', 'aria-current'] });
      ro = new ResizeObserver(update);
      ro.observe(el);
    });
    inject(DestroyRef).onDestroy(() => {
      mo?.disconnect();
      ro?.disconnect();
    });
  }
}
