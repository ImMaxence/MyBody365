import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import type { MealDay } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';

type Item = 'kcalKg' | 'satFat' | 'cholesterol' | 'sugars' | 'salt' | 'ultra';
const ITEMS: Item[] = ['satFat', 'cholesterol', 'sugars', 'kcalKg', 'salt', 'ultra'];
const ICON: Record<Item, string> = { kcalKg: 'weight', satFat: 'alert', cholesterol: 'activity', sugars: 'droplet', salt: 'info', ultra: 'layers' };

/**
 * 1.13: « Bon à savoir », on the Meals tab: one thing worth knowing to eat well, the one the day calls for (too much
 * saturated fat, sugar or salt already), else one a day in turn; « Tous les repères » opens them all: saturated fat and
 * the bad cholesterol, sugar, salt, ultra-processed products, and 1 kg of fat ≈ 7 700 kcal.
 */
@Component({
  selector: 'app-know-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <section class="card know">
      <p class="label"><app-icon name="bulb" [size]="15" /> {{ 'meals.know.title' | t }}</p>
      <h2 class="h3 k-title">{{ 'meals.know.items.' + item() + '.title' | t }}</h2>
      <p class="small k-text">{{ textOf(item()) }}</p>
      <button type="button" class="btn btn-ghost btn-s more" (click)="open()">{{ 'meals.know.more' | t }} <app-icon name="chevronRight" [size]="16" /></button>
    </section>

    <dialog class="sheet" #dlg [attr.aria-label]="'meals.know.title' | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div>
          <h2 class="h3">{{ 'meals.know.title' | t }}</h2>
          <p class="small muted">{{ 'meals.know.sheetText' | t }}</p>
        </div>
        <ul class="items" role="list">
          @for (k of items; track k) {
            <li>
              <span class="i-ico" [attr.data-k]="k"><app-icon [name]="icon[k]" [size]="18" /></span>
              <span class="i-body">
                <b>{{ 'meals.know.items.' + k + '.title' | t }}</b>
                <span class="small">{{ textOf(k) }}</span>
              </span>
            </li>
          }
        </ul>
        <p class="tiny muted">{{ 'meals.know.source' | t }}</p>
      </div>
    </dialog>
  `,
  styles: `
    .know {
      display: grid;
      gap: 6px;
      padding: var(--space-4);
    }
    .label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent-text);
    }
    .k-title,
    .k-text {
      margin: 0;
    }
    .k-text {
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
      color: var(--fg-2);
    }
    .more {
      justify-self: start;
      margin-left: calc(var(--space-2) * -1);
    }
    .items {
      display: grid;
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .items li {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
    }
    .i-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 12px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .i-ico[data-k='satFat'],
    .i-ico[data-k='cholesterol'] {
      background: color-mix(in srgb, #e2711d 14%, transparent);
      color: #e2711d;
    }
    .i-ico[data-k='sugars'] {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .i-body {
      display: grid;
      gap: 3px;
    }
  `,
})
export class KnowCardComponent {
  readonly day = input<MealDay | null>(null);
  /** the day's target: the saturated fat guide in grams (10 % of it) */
  readonly kcal = input(2000);
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly items = ITEMS;
  protected readonly icon = ICON;

  /** what the day calls for, else one a day in turn */
  protected readonly item = computed<Item>(() => {
    const t = this.day()?.totals;
    if (t?.satFatG != null && t.kcal > 0 && t.satFatG * 9 > Math.max(t.kcal, this.kcal() * 0.5) * 0.1) return 'satFat';
    if (t?.sugarsG != null && t.sugarsG > 50) return 'sugars';
    if (t?.saltG != null && t.saltG > 5) return 'salt';
    const d = this.day()?.day ?? new Date().toISOString().slice(0, 10);
    const n = Math.floor(Date.parse(d + 'T12:00:00Z') / 86_400_000);
    return ITEMS[((n % ITEMS.length) + ITEMS.length) % ITEMS.length];
  });

  protected textOf(k: Item): string {
    return this.i18n.t('meals.know.items.' + k + '.text', { g: Math.round((this.kcal() * 0.1) / 9) });
  }

  open(): void {
    this.dialog().nativeElement.showModal();
  }
}
