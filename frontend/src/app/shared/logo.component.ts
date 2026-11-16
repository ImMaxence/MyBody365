import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let uid = 0;

/** The mark: a flame inside an almost closed ring (a year of progress), and the wordmark. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'logo' },
  template: `
    <svg class="mark" viewBox="0 0 48 48" [attr.width]="size()" [attr.height]="size()" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient [attr.id]="gid" x1="8" y1="40" x2="40" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#ff3d1f" />
          <stop offset=".5" stop-color="#ff7a1a" />
          <stop offset="1" stop-color="#ffc23d" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="#0d0d10" />
      <circle cx="24" cy="24" r="15" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="4.5" />
      <circle
        cx="24"
        cy="24"
        r="15"
        fill="none"
        [attr.stroke]="'url(#' + gid + ')'"
        stroke-width="4.5"
        stroke-linecap="round"
        stroke-dasharray="84 94.25"
        transform="rotate(-90 24 24)"
      />
      <path
        [attr.fill]="'url(#' + gid + ')'"
        d="M21.2 27.1a2.2 2.2 0 0 0 2.2-2.2c0-1.2-.44-1.76-.88-2.64-.94-1.88-.2-3.56 1.76-5.28.44 2.2 1.76 4.3 3.52 5.72 1.76 1.4 2.64 3.08 2.64 4.84a6.16 6.16 0 1 1-12.32 0c0-1.02.38-2.02.88-2.64a2.2 2.2 0 0 0 2.2 2.2z"
      />
    </svg>
    @if (wordmark()) {
      <span class="word">MyBody<span class="flame-text">365</span></span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .mark {
      flex: none;
      border-radius: 28%;
    }
    .word {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: -0.03em;
    }
  `,
})
export class LogoComponent {
  readonly size = input(34);
  readonly wordmark = input(true);
  protected readonly gid = `mb-logo-${++uid}`;
}
