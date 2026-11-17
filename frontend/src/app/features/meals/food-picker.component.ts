import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Food, RecentItem, Recipe } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { DISHES } from '../../core/meals/fast-food';
import { IconComponent } from '../../shared/icon.component';
import { NutriscoreComponent } from '../../shared/nutriscore.component';

export type Picked = { kind: 'FOOD'; food: Food } | { kind: 'RECIPE'; recipe: Recipe } | { kind: 'RECENT'; item: RecentItem };

/**
 * Search box and results: the account's foods and Ciqual at once, Open Food Facts a moment later.
 * Empty, it shows what was logged lately and the account's recipes (when asked to).
 */
@Component({
  selector: 'app-food-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, IconComponent, NutriscoreComponent],
  template: `
    <div class="search">
      <app-icon name="search" [size]="20" />
      <input
        class="input"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        [attr.aria-label]="'meals.search.label' | t"
        [placeholder]="'meals.search.placeholder' | t"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
      @if (scanLink()) {
        <a class="icon-btn scan" [routerLink]="scanLink()" [queryParams]="scanParams()" [attr.aria-label]="'meals.search.scan' | t">
          <app-icon name="barcode" />
        </a>
      }
    </div>

    @if (words() < 2) {
      @if (withExtras()) {
        <button type="button" class="card list-row quick" (click)="quick.emit('')">
          <span class="list-icon quick-ico"><app-icon name="zap" /></span>
          <span class="list-body">
            <span class="list-title">{{ 'meals.quick.cta' | t }}</span>
            <span class="list-sub">{{ 'meals.quick.ctaSub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </button>
        <h2 class="section-title">{{ 'meals.quick.restaurant' | t }}</h2>
        <div class="slide-chips" role="group" [attr.aria-label]="'meals.quick.restaurant' | t">
          @for (c of restaurant; track c.q) {
            <button type="button" (click)="dish.emit(c.key)"><span aria-hidden="true">{{ c.emoji }}</span> {{ 'meals.quick.dishes.' + c.key | t }}</button>
          }
        </div>
      }
      @if (withExtras() && recent().length) {
        <h2 class="section-title">{{ 'meals.search.recent' | t }}</h2>
        <div class="list">
          @for (r of recent(); track r.kind + (r.id ?? r.name)) {
            <button type="button" class="list-item" (click)="picked.emit({ kind: 'RECENT', item: r })">
              <span class="list-icon"><app-icon [name]="r.kind === 'RECIPE' ? 'book' : r.kind === 'QUICK' ? 'zap' : 'clock'" /></span>
              <span class="list-body">
                <span class="list-title">{{ r.name }}</span>
                <span class="list-sub">{{ recentAmount(r) }} · {{ i18n.number(r.kcal) }} kcal</span>
              </span>
              @if (r.nutriscore) {
                <app-nutriscore [grade]="r.nutriscore" />
              }
            </button>
          }
        </div>
      }
      @if (withExtras() && recipes().length) {
        <h2 class="section-title">{{ 'meals.search.myRecipes' | t }}</h2>
        <div class="list">
          @for (r of recipes(); track r.id) {
            <button type="button" class="list-item" (click)="picked.emit({ kind: 'RECIPE', recipe: r })">
              <span class="list-icon"><app-icon name="book" /></span>
              <span class="list-body">
                <span class="list-title">{{ r.name }}</span>
                <span class="list-sub">{{ i18n.number(r.perServing.kcal) }} kcal {{ 'meals.perServing' | t }}</span>
              </span>
              @if (r.nutriscore) {
                <app-nutriscore [grade]="r.nutriscore" [estimated]="true" />
              }
            </button>
          }
        </div>
      }
    } @else {
      @if (matchingRecipes().length) {
        <h2 class="section-title">{{ 'meals.search.myRecipes' | t }}</h2>
        <div class="list">
          @for (r of matchingRecipes(); track r.id) {
            <button type="button" class="list-item" (click)="picked.emit({ kind: 'RECIPE', recipe: r })">
              <span class="list-icon"><app-icon name="book" /></span>
              <span class="list-body">
                <span class="list-title">{{ r.name }}</span>
                <span class="list-sub">{{ i18n.number(r.perServing.kcal) }} kcal {{ 'meals.perServing' | t }}</span>
              </span>
            </button>
          }
        </div>
      }
      <h2 class="section-title">{{ 'meals.search.local' | t }}</h2>
      @if (local(); as list) {
        @if (list.length) {
          <div class="list">
            @for (f of list; track f.id) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: f }" />
            }
          </div>
        } @else {
          <p class="small muted none">{{ 'meals.search.none' | t }}</p>
        }
      } @else {
        <div class="skeleton" style="height: 64px; border-radius: 18px"></div>
      }
      <h2 class="section-title">{{ 'meals.search.off' | t }}</h2>
      @switch (offState()) {
        @case ('loading') {
          <p class="small muted none"><span class="spinner" aria-hidden="true"></span> {{ 'meals.search.offLoading' | t }}</p>
        }
        @case ('error') {
          <p class="small muted none">{{ i18n.error(offError()) }}</p>
        }
        @default {
          @if (off().length) {
            <div class="list">
              @for (f of off(); track f.id) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: f }" />
              }
            </div>
          } @else {
            <p class="small muted none">{{ 'meals.search.offNone' | t }}</p>
          }
        }
      }
    }

    @if (withExtras() && words() >= 2) {
      <button type="button" class="card list-row quick" (click)="quick.emit(query().trim())">
        <span class="list-icon quick-ico"><app-icon name="zap" /></span>
        <span class="list-body">
          <span class="list-title">{{ 'meals.quick.notFound' | t }}</span>
          <span class="list-sub">{{ 'meals.quick.notFoundSub' | t: { name: query().trim() } }}</span>
        </span>
        <app-icon name="chevronRight" />
      </button>
    }

    @if (createLink()) {
      <a class="create card list-row" [routerLink]="createLink()" [queryParams]="createParams()">
        <span class="list-icon"><app-icon name="plusSquare" /></span>
        <span class="list-body">
          <span class="list-title">{{ 'meals.search.create' | t }}</span>
          <span class="list-sub">{{ 'meals.search.createHint' | t }}</span>
        </span>
        <app-icon name="chevronRight" />
      </a>
    }

    <ng-template #row let-f>
      <button type="button" class="list-item" (click)="picked.emit({ kind: 'FOOD', food: f })">
        <span class="list-body">
          <span class="list-title">{{ f.name }}</span>
          <span class="list-sub">{{ f.brand || f.category || ('meals.search.sources.' + f.source | t) }} · {{ i18n.number(f.per100.kcal) }} kcal / 100 g</span>
        </span>
        @if (f.nutriscore) {
          <app-nutriscore [grade]="f.nutriscore" [estimated]="f.nutriscoreEstimated" />
        }
      </button>
    </ng-template>
  `,
  styles: `
    .quick {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin: var(--space-3) 0;
      padding: var(--space-3) var(--space-4);
      width: 100%;
      text-align: left;
      color: inherit;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .quick:active {
      transform: scale(0.98);
    }
    .quick-ico {
      background: var(--accent-soft) !important;
      color: var(--accent-text) !important;
    }
    .slide-chips {
      margin-bottom: var(--space-2);
    }
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .search {
      position: sticky;
      top: calc(var(--safe-top) + 4px);
      z-index: 3;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px 4px 14px;
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--line-strong);
      box-shadow: var(--shadow-1);
    }
    .search .input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      box-shadow: none;
      padding-inline: 0;
    }
    .search .input:focus {
      outline: none;
    }
    .search:focus-within {
      border-color: var(--accent);
    }
    .scan {
      color: var(--accent-text);
    }
    .section-title {
      margin: var(--space-2) 0 0;
    }
    .none {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 4px 8px;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid var(--line-strong);
      border-top-color: var(--accent);
      animation: spin 800ms linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .create {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: var(--space-3) var(--space-4);
      color: inherit;
      text-decoration: none;
      margin-top: var(--space-2);
    }
  `,
})
export class FoodPickerComponent {
  private readonly api = inject(MealsApi);
  protected readonly i18n = inject(I18nService);

  /** recents and recipes when the box is empty (the add screen), foods only otherwise (recipe ingredients) */
  readonly withExtras = input(true);
  readonly recent = input<RecentItem[]>([]);
  readonly recipes = input<Recipe[]>([]);
  readonly scanLink = input<string | null>(null);
  readonly scanParams = input<Record<string, string>>({});
  readonly createLink = input<string | null>(null);
  readonly createParams = input<Record<string, string>>({});
  readonly picked = output<Picked>();
  /** the quick add (name and calories only), with what was typed as its name */
  readonly quick = output<string>();
  /** a fast-food or restaurant dish to estimate (core/meals/fast-food.ts) */
  readonly dish = output<string>();
  protected readonly restaurant = DISHES.map((d) => ({ key: d.key, q: d.key, emoji: d.emoji }));

  protected readonly query = signal('');
  protected readonly local = signal<Food[] | null>(null);
  protected readonly off = signal<Food[]>([]);
  protected readonly offState = signal<'idle' | 'loading' | 'error'>('idle');
  protected readonly offError = signal('generic');
  protected readonly words = computed(() => this.query().trim().length);
  protected readonly matchingRecipes = computed(() => {
    const q = normalize(this.query());
    if (!this.withExtras() || q.length < 2) return [];
    return this.recipes().filter((r) => normalize(r.name).includes(q)).slice(0, 5);
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor() {
    effect(() => {
      const q = this.query().trim();
      if (this.timer) clearTimeout(this.timer);
      if (q.length < 2) return;
      this.timer = setTimeout(() => void this.run(q), 250);
    });
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  private async run(q: string): Promise<void> {
    const n = ++this.seq;
    this.local.set(null);
    this.offState.set('loading');
    this.api
      .search(q, 'local')
      .then((list) => n === this.seq && this.local.set(list))
      .catch(() => n === this.seq && this.local.set([]));
    try {
      const list = await this.api.search(q, 'off');
      if (n !== this.seq) return;
      // already listed above (a product found before) appear once
      const known = new Set((this.local() ?? []).map((f) => f.id));
      this.off.set(list.filter((f) => !known.has(f.id)));
      this.offState.set('idle');
    } catch (e) {
      if (n !== this.seq) return;
      this.offError.set(errorCode(e));
      this.offState.set('error');
    }
  }

  protected recentAmount(r: RecentItem): string {
    if (r.grams != null) return this.i18n.t('meals.grams', { g: this.i18n.number(r.grams) });
    return this.i18n.t('meals.servings', { n: this.i18n.number(r.servings ?? 1, (r.servings ?? 1) % 1 ? 1 : 0) });
  }
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim();
}
