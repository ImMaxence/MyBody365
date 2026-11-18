import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { closeSheet } from '../../core/ui/sheets';
import { ShareSheetComponent } from '../../shared/share-sheet.component';
import { IconComponent } from '../../shared/icon.component';

/** A milestone reached by the weigh-in just noted (1.8): a moment of joy, with the reward one promised oneself. */
@Component({
  selector: 'app-milestone-celebration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, ShareSheetComponent, IconComponent],
  template: `
    <dialog class="sheet" #dlg [attr.aria-label]="'progress.milestones.celebrateTitle' | t" (close)="tracking.celebrate.set(null)">
      <div class="sheet-grip"></div>
      @if (tracking.celebrate(); as m) {
        <div class="stack party">
          <span class="medal" aria-hidden="true">🏅</span>
          <h2 class="h2">{{ 'progress.milestones.celebrateTitle' | t }}</h2>
          <p class="kg num">{{ kg(m.targetKg) }} kg</p>
          @if (m.reward) {
            <p class="reward">🎁 {{ 'progress.milestones.celebrateReward' | t: { reward: m.reward } }}</p>
          } @else {
            <p class="small muted">{{ 'progress.milestones.celebrateText' | t }}</p>
          }
          <!-- 1.9: the friends hear of it -->
          <button type="button" class="btn btn-primary btn-block" (click)="shareIt(m.id)"><app-icon name="share" [size]="18" /> {{ 'progress.milestones.share' | t }}</button>
          <a class="btn btn-secondary btn-block" routerLink="/app/progress" (click)="close()">{{ 'progress.milestones.seeAll' | t }}</a>
          <button type="button" class="btn btn-ghost btn-block" (click)="close()">{{ 'progress.milestones.keepGoing' | t }}</button>
        </div>
      }
    </dialog>
    <app-share-sheet #share />
  `,
  styles: `
    .party {
      justify-items: center;
      text-align: center;
    }
    .medal {
      font-size: 4rem;
      line-height: 1;
      animation: pop 600ms var(--ease-out) both;
    }
    @keyframes pop {
      0% {
        transform: scale(0.4) rotate(-12deg);
        opacity: 0;
      }
      70% {
        transform: scale(1.12) rotate(4deg);
        opacity: 1;
      }
    }
    .h2 {
      margin: 0;
    }
    .kg {
      margin: 0;
      font-size: 2rem;
      font-weight: 800;
    }
    .reward {
      margin: 0;
      font-weight: 650;
    }
    @media (prefers-reduced-motion: reduce) {
      .medal {
        animation: none;
      }
    }
  `,
})
export class MilestoneCelebrationComponent {
  protected readonly tracking = inject(TrackingStore);
  protected readonly i18n = inject(I18nService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const m = this.tracking.celebrate();
      untracked(() => {
        const d = this.dlg().nativeElement;
        if (m && !d.open) d.showModal();
      });
    });
  }

  /** « 73 kg », « 72,5 kg » */
  protected kg(v: number): string {
    return this.i18n.number(v, Number.isInteger(v) ? 0 : 1);
  }

  protected close(): void {
    closeSheet(this.dlg().nativeElement);
  }

  private readonly share = viewChild.required(ShareSheetComponent);

  /** the joy closes, the share sheet opens on this milestone */
  protected shareIt(id: string): void {
    this.close();
    this.share().open('MILESTONE', '', id);
  }
}
