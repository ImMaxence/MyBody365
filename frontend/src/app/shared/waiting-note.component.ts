import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { Outbox } from '../core/offline/outbox';
import { IconComponent } from './icon.component';

/** what waits: a thing added, changed, deleted, a photo (the words differ) */
export type WaitingKind = 'add' | 'edit' | 'delete' | 'photo';

/**
 * 1.17: the line under something done without network: « Sera envoyé plus tard » with a cloud, then, once the network is
 * back and it is on its way (`sending`, or the outbox's id being sent), a small spinner and « Envoi… ». The thing itself is
 * greyed by its screen (class is-waiting), and loses its grey when it arrives (class is-arrived).
 */
@Component({
  selector: 'app-waiting-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  host: { class: 'waiting-note', '[class.sending]': 'busy()', role: 'status' },
  template: `
    @if (busy()) {
      <span class="spin" aria-hidden="true"></span> {{ 'offline.sending' | t }}
    } @else {
      <app-icon name="cloud" [size]="13" /> {{ 'offline.later.' + kind() | t }}
    }
  `,
})
export class WaitingNoteComponent {
  /** the outbox id of what waits (its spinner shows when this one is being sent) */
  readonly waitId = input<string | null | undefined>(null);
  readonly kind = input<WaitingKind>('add');
  /** sent by something else than the outbox (a photo) */
  readonly sending = input(false);
  private readonly outbox = inject(Outbox);
  protected readonly busy = computed(() => this.sending() || (!!this.waitId() && this.outbox.sending() === this.waitId()));
}
