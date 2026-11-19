import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HOT_DRINKS } from '../../core/meals/hot-drinks';
import { APERO } from '../../core/meals/apero';
import { errorCode } from '../../core/api/api.service';
import type { Food, RecentItem, Recipe } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { FavoritesStore } from '../../core/meals/favorites.store';
import { MealsApi } from '../../core/meals/meals-api';
import { DISHES } from '../../core/meals/fast-food';
import { IconComponent } from '../../shared/icon.component';
import { NutriscoreComponent } from '../../shared/nutriscore.component';
import { FoodThumbComponent } from '../../shared/food-thumb.component';
import { TYPE_EMOJI } from './recipes.page';

export type Picked = { kind: 'FOOD'; food: Food } | { kind: 'RECIPE'; recipe: Recipe } | { kind: 'RECENT'; item: RecentItem };

/** what is searched: everything (« Ajouter un repas »), the Ciqual table and my foods, or Open Food Facts */
export type PickerMode = 'all' | 'ciqual' | 'off';
type Group = 'ciqual' | 'recipes' | 'off';

/** a group's first lines when every group shows (« Tout »), the rest one tap away */
const PREVIEW = 5;

/**
 * The search of foods (1.9): one box for everything at once, the Ciqual table with my own foods, the recipes (mine, my
 * friends', the community's) and the products of Open Food Facts, in three groups that can be narrowed to one. Empty, on
 * « Ajouter un repas », it shows the ways in: the products, the recipes, the raw foods and the quick add, then the dishes
 * of the snack bar, the drinks, the favourites, what was logged lately and my recipes. The pages of a single source
 * (products, raw foods) and the ingredients of a recipe use it with one source, without the extras.
 */
@Component({
  selector: 'app-food-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, IconComponent, NutriscoreComponent, FoodThumbComponent],
  template: `
    <div class="search">
      <app-icon name="search" [size]="20" />
      <input
        class="input"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        [attr.aria-label]="'meals.search.label' | t"
        [placeholder]="placeholder() || ('meals.search.placeholderAll' | t)"
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
        <!-- the ways in, one under the other (1.9) -->
        <nav class="sources" [attr.aria-label]="'meals.sources.title' | t">
          <a class="card list-row src" routerLink="/app/meals/products" [queryParams]="sourceParams()">
            <span class="src-ico logo-off"><img src="/brands/open-food-facts.svg" alt="" width="30" height="30" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'meals.sources.off.title' | t }}</span>
              <span class="list-sub">{{ 'meals.sources.off.sub' | t }}</span>
            </span>
            <app-icon name="chevronRight" />
          </a>
          @if (recipesLink()) {
            <a class="card list-row src" [routerLink]="recipesLink()" [queryParams]="recipesParams()">
              <span class="src-ico recipes-ico"><app-icon name="book" /></span>
              <span class="list-body">
                <span class="list-title">{{ 'meals.sources.recipes.title' | t }}</span>
                <span class="list-sub">{{ 'meals.sources.recipes.sub' | t }}</span>
              </span>
              <app-icon name="chevronRight" />
            </a>
          }
          <a class="card list-row src" routerLink="/app/meals/foods" [queryParams]="sourceParams()">
            <span class="src-ico ciqual-ico"><app-icon name="leaf" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'meals.sources.ciqual.title' | t }}</span>
              <span class="list-sub">{{ 'meals.sources.ciqual.sub' | t }}</span>
            </span>
            <app-icon name="chevronRight" />
          </a>
          <button type="button" class="card list-row src" (click)="quick.emit('')">
            <span class="src-ico quick-ico"><app-icon name="zap" /></span>
            <span class="list-body">
              <span class="list-title">{{ 'meals.sources.quick.title' | t }}</span>
              <span class="list-sub">{{ 'meals.sources.quick.sub' | t }}</span>
            </span>
            <app-icon name="chevronRight" />
          </button>
        </nav>

        <h2 class="section-title">{{ 'meals.quick.restaurant' | t }}</h2>
        <div class="slide-chips" role="group" [attr.aria-label]="'meals.quick.restaurant' | t">
          @for (c of restaurant; track c.key) {
            <button type="button" (click)="dish.emit(c.key)"><span aria-hidden="true">{{ c.emoji }}</span> {{ 'meals.quick.dishes.' + c.key | t }}</button>
          }
        </div>
        <h2 class="section-title">{{ 'meals.drinks.title' | t }}</h2>
        <div class="slide-chips" role="group" [attr.aria-label]="'meals.drinks.title' | t">
          @for (c of hotDrinks; track c.key) {
            <button type="button" (click)="drink.emit(c.key)"><span aria-hidden="true">{{ c.emoji }}</span> {{ 'meals.drinks.names.' + c.key | t }}</button>
          }
        </div>
        <h2 class="section-title">{{ 'meals.apero.title' | t }}</h2>
        <div class="slide-chips" role="group" [attr.aria-label]="'meals.apero.title' | t">
          @for (c of apero; track c.key) {
            <button type="button" (click)="aperoPicked.emit(c.key)"><span aria-hidden="true">{{ c.emoji }}</span> {{ 'meals.apero.names.' + c.key | t }}</button>
          }
        </div>

        @if (favFoods().length || favRecipes().length) {
          <h2 class="section-title">{{ 'meals.favorites.title' | t }}</h2>
          <div class="list">
            @for (f of favFoods(); track f.id) {
              <ng-container *ngTemplateOutlet="foodRow; context: { $implicit: f, fav: true }" />
            }
            @for (r of favRecipes(); track r.id) {
              <ng-container *ngTemplateOutlet="recipeRow; context: { $implicit: r, fav: true }" />
            }
          </div>
        }
        @if (recent().length) {
          <h2 class="section-title">{{ 'meals.search.recent' | t }}</h2>
          <div class="list">
            @for (r of recent(); track r.kind + (r.id ?? r.name)) {
              <button type="button" class="list-item" (click)="picked.emit({ kind: 'RECENT', item: r })">
                @if (r.kind === 'QUICK') {
                  <span class="list-icon"><app-icon name="zap" /></span>
                } @else {
                  <app-food-thumb class="row-thumb" [url]="r.thumbUrl" [group]="r.group" />
                }
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
        @if (recipes().length) {
          <h2 class="section-title">{{ 'meals.search.myRecipes' | t }}</h2>
          <div class="list">
            @for (r of recipes(); track r.id) {
              <ng-container *ngTemplateOutlet="recipeRow; context: { $implicit: r }" />
            }
          </div>
        }
      } @else {
        <p class="small muted none">{{ 'meals.search.typeMore' | t }}</p>
      }
    } @else {
      @if (groups().length > 1) {
        <div class="slide-chips focus" role="group" [attr.aria-label]="'meals.sources.filter.label' | t">
          <button type="button" [attr.aria-pressed]="focus() === null" (click)="focus.set(null)">{{ 'meals.sources.filter.all' | t }}</button>
          @for (g of groups(); track g) {
            <button type="button" [attr.aria-pressed]="focus() === g" (click)="focus.set(g)">{{ 'meals.sources.filter.' + g | t }}</button>
          }
        </div>
      }

      @for (g of shownGroups(); track g) {
        @switch (g) {
          @case ('ciqual') {
            <h2 class="section-title group"><span class="dot ciqual"></span> {{ 'meals.sources.ciqual.title' | t }}</h2>
            @if (local(); as list) {
              @if (list.length) {
                <div class="list">
                  @for (f of cut(list); track f.id) {
                    <ng-container *ngTemplateOutlet="foodRow; context: { $implicit: f }" />
                  }
                </div>
                <ng-container *ngTemplateOutlet="more; context: { $implicit: g, n: list.length }" />
              } @else {
                <p class="small muted none">{{ 'meals.search.none' | t }}</p>
              }
            } @else {
              <div class="skeleton" style="height: 64px; border-radius: 18px"></div>
            }
          }
          @case ('recipes') {
            <h2 class="section-title group"><span class="dot recipes"></span> {{ 'meals.sources.recipes.title' | t }}</h2>
            @if (foundRecipes(); as list) {
              @if (list.length) {
                <div class="list">
                  @for (r of cut(list); track r.id) {
                    <ng-container *ngTemplateOutlet="recipeRow; context: { $implicit: r }" />
                  }
                </div>
                <ng-container *ngTemplateOutlet="more; context: { $implicit: g, n: list.length }" />
              } @else {
                <p class="small muted none">{{ 'meals.recipe.noMatch' | t: { q: query().trim() } }}</p>
              }
            } @else {
              <div class="skeleton" style="height: 64px; border-radius: 18px"></div>
            }
          }
          @case ('off') {
            <h2 class="section-title group"><span class="dot off"></span> {{ 'meals.sources.off.title' | t }}</h2>
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
                    @for (f of cut(off()); track f.id) {
                      <ng-container *ngTemplateOutlet="foodRow; context: { $implicit: f }" />
                    }
                  </div>
                  <ng-container *ngTemplateOutlet="more; context: { $implicit: g, n: off().length }" />
                } @else {
                  <p class="small muted none">{{ 'meals.search.offNone' | t }}</p>
                }
              }
            }
          }
        }
      }
    }

    @if (withExtras() && words() >= 2) {
      <button type="button" class="card list-row quick" (click)="quick.emit(query().trim())">
        <span class="list-icon quick-ico"><app-icon name="zap" /></span>
        <span class="list-body">
          <span class="list-title">{{ 'meals.sources.quick.title' | t }}</span>
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

    <ng-template #more let-g let-n="n">
      @if (focus() === null && shownGroups().length > 1 && n > preview) {
        <button type="button" class="btn btn-ghost btn-s see-all" (click)="focus.set(g)">{{ 'meals.sources.seeAll' | t: { n: n } }}</button>
      }
    </ng-template>

    <ng-template #foodRow let-f let-fav="fav">
      <button type="button" class="list-item" (click)="picked.emit({ kind: 'FOOD', food: f })">
        @if (fav) {
          <span class="list-icon fav-ico"><app-icon name="heart" /></span>
        } @else {
          <app-food-thumb class="row-thumb" [url]="f.imageUrl" [group]="f.category ?? (f.source === 'OFF' ? 'PRODUCT' : null)" />
        }
        <span class="list-body">
          <span class="list-title">{{ f.name }}</span>
          <span class="list-sub">{{ f.brand || f.category || ('meals.search.sources.' + f.source | t) }} · {{ i18n.number(f.per100.kcal) }} kcal / 100 g</span>
        </span>
        @if (f.nutriscore) {
          <app-nutriscore [grade]="f.nutriscore" [estimated]="f.nutriscoreEstimated" />
        }
      </button>
    </ng-template>

    <ng-template #recipeRow let-r let-fav="fav">
      <button type="button" class="list-item" (click)="picked.emit({ kind: 'RECIPE', recipe: r })">
        <span class="list-icon" [class.fav-ico]="fav">
          @if (fav) {
            <app-icon name="heart" />
          } @else if (r.thumbUrl) {
            <img class="thumb" [src]="r.thumbUrl" alt="" loading="lazy" />
          } @else {
            <span aria-hidden="true">{{ emojiOf(r) }}</span>
          }
        </span>
        <span class="list-body">
          <span class="list-title">{{ r.name }}</span>
          <span class="list-sub">{{ i18n.number(r.perServing.kcal) }} kcal {{ 'meals.perServing' | t }}{{ r.mine ? '' : ' · ' + (r.shared ? ('meals.recipe.community' | t) : (r.author ?? '')) }}</span>
        </span>
        @if (r.nutriscore) {
          <app-nutriscore [grade]="r.nutriscore" [estimated]="true" />
        }
      </button>
    </ng-template>
  `,
  styles: `
    .row-thumb {
      --thumb: 38px;
      --thumb-radius: 12px;
    }
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .sources {
      display: grid;
      gap: var(--space-2);
      margin: var(--space-2) 0 var(--space-1);
    }
    .src,
    .quick {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      padding: var(--space-3) var(--space-4);
      text-align: left;
      color: inherit;
      text-decoration: none;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .src:active,
    .quick:active {
      transform: scale(0.98);
    }
    .src-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 14px;
    }
    /* the Open Food Facts logo on white, in both themes, as its makers show it */
    .logo-off {
      background: #fff;
      border: 1px solid var(--line);
    }
    .ciqual-ico {
      background: color-mix(in srgb, var(--success, #1f9d55) 16%, transparent);
      color: var(--success, #1f9d55);
    }
    .quick-ico {
      background: var(--accent-soft) !important;
      color: var(--accent-text) !important;
    }
    .recipes-ico {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .fav-ico {
      background: color-mix(in srgb, #e5484d 14%, transparent) !important;
      color: #e5484d !important;
    }
    .thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
    }
    .slide-chips {
      margin-bottom: var(--space-2);
    }
    .focus {
      margin: 0;
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
    /* in a sheet, the box sticks to the sheet's own top (the status bar is not there) */
    :host-context(dialog.sheet) .search {
      top: 0;
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
    .group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot.ciqual {
      background: var(--success, #1f9d55);
    }
    .dot.recipes {
      background: var(--cool);
    }
    .dot.off {
      background: var(--flame);
    }
    .see-all {
      justify-self: start;
      margin-top: calc(var(--space-2) * -1);
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
  private readonly favorites = inject(FavoritesStore);

  /** which sources are searched */
  readonly mode = input<PickerMode>('all');
  /** the ways in and the lists when the box is empty, the recipes in the results (the add screen) */
  readonly withExtras = input(true);
  readonly recent = input<RecentItem[]>([]);
  readonly recipes = input<Recipe[]>([]);
  readonly placeholder = input('');
  readonly scanLink = input<string | null>(null);
  readonly scanParams = input<Record<string, string>>({});
  readonly createLink = input<string | null>(null);
  readonly createParams = input<Record<string, string>>({});
  /** the meal the pages of a source add to */
  readonly sourceParams = input<Record<string, string>>({});
  readonly picked = output<Picked>();
  /** the quick add (name and calories only), with what was typed as its name */
  readonly quick = output<string>();
  /** a fast-food or restaurant dish to estimate (core/meals/fast-food.ts) */
  readonly dish = output<string>();
  /** an everyday drink to estimate (core/meals/hot-drinks.ts) */
  readonly drink = output<string>();
  /** a drink at the apéro (core/meals/apero.ts) */
  readonly aperoPicked = output<string>({ alias: 'apero' });
  /** the recipes page (with the meal it adds to) */
  readonly recipesLink = input<string | null>(null);
  readonly recipesParams = input<Record<string, string>>({});
  protected readonly hotDrinks = HOT_DRINKS.map((d) => ({ key: d.key, emoji: d.emoji }));
  protected readonly restaurant = DISHES.map((d) => ({ key: d.key, emoji: d.emoji }));
  protected readonly apero = APERO.map((d) => ({ key: d.key, emoji: d.emoji }));
  protected emojiOf(r: Recipe): string {
    return TYPE_EMOJI[r.type];
  }
  protected readonly preview = PREVIEW;

  /** what the box starts with (an ingredient of an imported recipe to find) */
  readonly start = input('');
  protected readonly query = linkedSignal(() => this.start());
  protected readonly local = signal<Food[] | null>(null);
  protected readonly off = signal<Food[]>([]);
  protected readonly offState = signal<'idle' | 'loading' | 'error'>('idle');
  protected readonly offError = signal('generic');
  protected readonly foundRecipes = signal<Recipe[] | null>(null);
  protected readonly words = computed(() => this.query().trim().length);
  /** one group only, or all of them (null) */
  protected readonly focus = signal<Group | null>(null);
  protected readonly favFoods = computed(() => (this.withExtras() ? (this.favorites.foods() ?? []) : []));
  protected readonly favRecipes = computed(() => (this.withExtras() ? (this.favorites.recipes() ?? []) : []));

  /** the groups this picker searches, in their order */
  protected readonly groups = computed<Group[]>(() => {
    const m = this.mode();
    if (m === 'ciqual') return ['ciqual'];
    if (m === 'off') return ['off'];
    return this.withExtras() ? ['ciqual', 'recipes', 'off'] : ['ciqual', 'off'];
  });
  protected readonly shownGroups = computed(() => {
    const f = this.focus();
    return f && this.groups().includes(f) ? [f] : this.groups();
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  /** my friends' recipes, asked once (searched here) */
  private friendsRecipes: Promise<Recipe[]> | null = null;

  constructor() {
    effect(() => {
      const q = this.query().trim();
      if (this.timer) clearTimeout(this.timer);
      if (q.length < 2) return;
      this.timer = setTimeout(() => void this.run(q), 250);
    });
    effect(() => {
      if (this.withExtras()) void this.favorites.ensure();
    });
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  /** a group's lines: its first ones when all the groups show */
  protected cut<T>(list: T[]): T[] {
    return this.focus() === null && this.shownGroups().length > 1 ? list.slice(0, PREVIEW) : list;
  }

  private async run(q: string): Promise<void> {
    const n = ++this.seq;
    const groups = this.groups();
    if (groups.includes('ciqual')) {
      this.local.set(null);
      this.api
        .search(q, 'ciqual')
        .then((list) => n === this.seq && this.local.set(list))
        .catch(() => n === this.seq && this.local.set([]));
    }
    if (groups.includes('recipes')) {
      this.foundRecipes.set(null);
      void this.findRecipes(q, n);
    }
    if (!groups.includes('off')) return;
    this.offState.set('loading');
    try {
      const list = await this.api.search(q, 'off');
      if (n !== this.seq) return;
      this.off.set(list);
      this.offState.set('idle');
    } catch (e) {
      if (n !== this.seq) return;
      this.offError.set(errorCode(e));
      this.offState.set('error');
    }
  }

  /** mine and my friends' looked through here, the community on the server; mine first, each once */
  private async findRecipes(q: string, n: number): Promise<void> {
    const words = plain(q).split(' ').filter((w) => w.length >= 2);
    const match = (r: Recipe) => words.every((w) => plain(r.name).includes(w));
    this.friendsRecipes ??= this.api.friendsRecipes(null).catch(() => [] as Recipe[]);
    const [friends, community] = await Promise.all([this.friendsRecipes, this.api.community(null, 'top', 0, q).catch(() => [] as Recipe[])]);
    if (n !== this.seq) return;
    const seen = new Set<string>();
    const all = [...this.recipes().filter(match), ...friends.filter(match), ...community].filter((r) => !seen.has(r.id) && !!seen.add(r.id));
    this.foundRecipes.set(all);
  }

  protected recentAmount(r: RecentItem): string {
    if (r.grams != null) return this.i18n.t('meals.grams', { g: this.i18n.number(r.grams) });
    return this.i18n.t('meals.servings', { n: this.i18n.number(r.servings ?? 1, (r.servings ?? 1) % 1 ? 1 : 0) });
  }
}

/** a name as compared by the search: lower case, no accents, words separated by single spaces (as the server) */
function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'o')
    .replace(/æ/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
