import { DestroyRef, Directive, ElementRef, afterEveryRender, afterNextRender, inject } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * 1.14: a small cross at the end of a search box, shown once something is typed: it empties the box (as if typed, so its
 * [value]/(input) or ngModel follow) and keeps the focus and the keyboard. The browsers' own cross is hidden (styles/
 * components.css): iOS shows none, and they all look different. The box's parent is expected to lay out in a row.
 */
@Directive({ selector: 'input[type=search], input[appClearable]' })
export class ClearableDirective {
  constructor() {
    const input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
    const i18n = inject(I18nService);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clear-btn';
    button.hidden = true;
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '3', 'stroke-linecap': 'round', 'aria-hidden': 'true' })) {
      svg.setAttribute(k, v);
    }
    for (const d of ['M18 6 6 18', 'm6 6 12 12']) {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
    button.appendChild(svg);

    const sync = () => {
      button.hidden = !input.value || input.disabled;
      button.setAttribute('aria-label', i18n.t('common.clearSearch'));
    };
    // pressed, the button does not take the focus: the keyboard stays open
    button.addEventListener('pointerdown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      sync();
      input.focus();
    });
    input.addEventListener('input', sync);

    afterNextRender(() => {
      input.insertAdjacentElement('afterend', button);
      sync();
    });
    // a value set by the page ([value], ngModel) shows or hides it too
    afterEveryRender(sync);
    inject(DestroyRef).onDestroy(() => button.remove());
  }
}
