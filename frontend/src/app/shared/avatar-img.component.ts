import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * What goes inside an `.avatar` circle: the picture, or the first letter of the name when there is none or
 * when it fails to load (never the browser's broken-image icon, a "?" on iPhone).
 */
@Component({
  selector: 'app-avatar-img',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:contents' },
  template: `
    @if (shown(); as url) {
      <img [src]="url" alt="" referrerpolicy="no-referrer" decoding="async" [width]="size()" [height]="size()" (error)="failed.set(url)" />
    } @else {
      {{ initial() }}
    }
  `,
})
export class AvatarImgComponent {
  readonly src = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>('');
  readonly size = input(40);
  /** the last address that did not load */
  protected readonly failed = signal<string | null>(null);
  protected readonly shown = computed(() => {
    const url = this.src();
    return url && url !== this.failed() ? url : null;
  });
  protected readonly initial = computed(() => (this.name() ?? '').trim().charAt(0).toUpperCase() || '•');
}
