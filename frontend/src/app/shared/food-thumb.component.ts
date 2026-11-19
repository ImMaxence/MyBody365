import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { groupEmoji } from '../core/meals/food-emoji';

/**
 * 1.12: the small picture of a food or a recipe in a list: its photo (the recipe's, the product's from Open Food Facts),
 * else an emoji of what it is. A picture that cannot load (a recipe no longer shared) falls back to the emoji.
 */
@Component({
  selector: 'app-food-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a product's picture (a pack on white): whole, on white; a dish: filling the square
  host: { '[class.product]': 'product()' },
  template: `
    @if (url() && !failed()) {
      <img [src]="url()" alt="" loading="lazy" decoding="async" [class.loaded]="loaded()" (load)="loaded.set(true)" (error)="failed.set(true)" />
    } @else {
      <span class="emoji" aria-hidden="true">{{ emoji() }}</span>
    }
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      flex: none;
      width: var(--thumb, 44px);
      height: var(--thumb, 44px);
      border-radius: var(--thumb-radius, 12px);
      background: var(--surface-3);
      overflow: hidden;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity var(--dur-2);
    }
    :host(.product) {
      background: #fff;
    }
    :host(.product) img {
      object-fit: contain;
      padding: 3px;
    }
    img.loaded {
      opacity: 1;
    }
    .emoji {
      font-size: calc(var(--thumb, 44px) * 0.5);
      line-height: 1;
    }
  `,
})
export class FoodThumbComponent {
  readonly url = input<string | null | undefined>(null);
  readonly group = input<string | null | undefined>(null);
  protected readonly failed = signal(false);
  protected readonly loaded = signal(false);
  protected readonly emoji = computed(() => groupEmoji(this.group()));
  protected readonly product = computed(() => !!this.url()?.startsWith('/api/foods/') && !this.failed());
}
