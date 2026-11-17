import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ApiService, errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** a glass is 25 cl */
const GLASS_L = 0.25;

/** a first goal from the weight: about 33 ml per kg, 6 to 12 glasses (8 without a weight) */
export function defaultWaterGoal(kg: number | null | undefined): number {
  return kg ? Math.min(12, Math.max(6, Math.round((kg * 0.033) / GLASS_L))) : 8;
}

/** The glasses of water of the day, on the Today list (only when the tracker is on). */
@Component({
  selector: 'app-water-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  host: { class: 'list-item water', '[class.reached]': 'glasses() >= goal()' },
  template: `
    <span class="list-icon water-ico"><app-icon [name]="glasses() >= goal() ? 'check' : 'droplet'" /></span>
    <span class="list-body">
      <span class="list-title">{{ 'water.title' | t }}</span>
      <span class="glasses" aria-hidden="true">
        @for (s of slots(); track $index) {
          <i [class.on]="$index < glasses()" [style.--i]="$index"></i>
        }
      </span>
      <span class="list-sub" aria-live="polite">{{ 'water.count' | t: { n: glasses(), goal: goal(), l: litres() } }}</span>
    </span>
    <button type="button" class="round" [disabled]="glasses() === 0" [attr.aria-label]="'water.less' | t" (click)="add(-1)">
      <app-icon name="minus" [size]="18" [stroke]="2.4" />
    </button>
    <button type="button" class="round plus" [disabled]="glasses() >= 40" [attr.aria-label]="'water.more' | t" (click)="add(1)">
      <app-icon name="plus" [size]="18" [stroke]="2.4" />
    </button>
  `,
  styles: `
    :host {
      cursor: default;
    }
    .water-ico {
      background: var(--cool-soft) !important;
      color: var(--cool) !important;
      transition: background-color var(--dur-2), color var(--dur-2);
    }
    :host(.reached) .water-ico {
      background: var(--cal-done) !important;
      color: var(--cal-done-ink) !important;
    }
    .glasses {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin: 4px 0 2px;
    }
    .glasses i {
      width: 10px;
      height: 14px;
      border-radius: 2px 2px 4px 4px;
      background: var(--surface-3);
      box-shadow: inset 0 0 0 1px var(--line);
      transition: background-color 260ms var(--ease-out), transform 260ms var(--ease-out);
    }
    .glasses i.on {
      background: var(--cool);
      box-shadow: none;
      animation: fill 320ms var(--ease-out);
    }
    @keyframes fill {
      from {
        transform: scaleY(0.4);
        transform-origin: bottom;
      }
    }
    .round {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--surface-3);
      color: var(--fg);
      transition: transform var(--dur-1) var(--ease-out);
    }
    .round.plus {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .round:active {
      transform: scale(0.88);
    }
    .round:disabled {
      opacity: 0.4;
    }
    @media (prefers-reduced-motion: reduce) {
      .glasses i.on {
        animation: none;
      }
    }
  `,
})
export class WaterRowComponent {
  readonly goal = input.required<number>();
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly glasses = signal(0);
  private readonly day = localDay();
  private saving: Promise<unknown> = Promise.resolve();

  protected readonly slots = computed(() => Array.from({ length: Math.max(this.goal(), this.glasses()) }));
  protected readonly litres = computed(() => this.i18n.number(this.glasses() * GLASS_L, 2));

  constructor() {
    void this.api
      .water(this.day)
      .then((w) => this.glasses.set(w.glasses))
      .catch(() => undefined);
  }

  /** shown at once, saved in order (several quick taps end on the right number) */
  protected add(delta: number): void {
    const before = this.glasses();
    const next = Math.max(0, Math.min(40, before + delta));
    if (next === before) return;
    this.glasses.set(next);
    if (delta > 0 && next === this.goal()) this.toast.show(this.i18n.t('water.reached'));
    this.saving = this.saving
      .then(() => this.api.setWater(this.day, next))
      .catch((e) => {
        this.glasses.set(before);
        this.toast.error(this.i18n.error(errorCode(e)));
      });
  }
}
