import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Lang } from '../core/i18n/i18n.service';

let uid = 0;

/**
 * The flag of a language, drawn inline: emoji flags do not show on Windows (two letters instead).
 * French: the tricolour; English: the Union Jack.
 */
@Component({
  selector: 'app-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (lang() === 'fr') {
      <svg viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice">
        <rect width="1" height="2" fill="#0055a4" />
        <rect x="1" width="1" height="2" fill="#fff" />
        <rect x="2" width="1" height="2" fill="#ef4135" />
      </svg>
    } @else {
      <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice">
        <clipPath [attr.id]="clip">
          <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
        </clipPath>
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" [attr.clip-path]="'url(#' + clip + ')'" stroke="#c8102e" stroke-width="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" stroke-width="6" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-block;
      flex: none;
      width: var(--flag-w, 22px);
      height: var(--flag-h, 16px);
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
      vertical-align: middle;
    }
    /* ":host >" outweighs the icon sizes of buttons (".seg button svg" made the flag 18 px wide in its 22 px
       frame, pushed to the left) */
    :host > svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class FlagComponent {
  readonly lang = input.required<Lang>();
  protected readonly clip = `flag-uk-${++uid}`;
}
