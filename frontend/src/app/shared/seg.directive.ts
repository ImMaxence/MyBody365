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
        // a chip row that scrolls: the chosen chip comes into view
        if (el.scrollWidth > el.clientWidth) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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
