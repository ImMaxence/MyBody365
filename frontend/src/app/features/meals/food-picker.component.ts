import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HOT_DRINKS } from '../../core/meals/hot-drinks';
import { APERO } from '../../core/meals/apero';
import { SWEET_CHIPS } from '../../core/meals/sweets';
import { errorCode } from '../../core/api/api.service';
import type { Food, RecentItem, Recipe } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { FavoritesStore } from '../../core/meals/favorites.store';
import { MealsApi } from '../../core/meals/meals-api';
import { DISHES } from '../../core/meals/fast-food';
import { IconComponent } from '../../shared/icon.component';
import { ClearableDirective } from '../../shared/clearable.directive';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { kindKey } from '../../core/meals/products';
import { FoodThumbComponent } from '../../shared/food-thumb.component';
import { TYPE_EMOJI } from './recipes.page';
import { Network } from '../../core/offline/network';
import { ServingPipe } from '../../shared/serving.pipe';

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
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, IconComponent, HealthScoreComponent, FoodThumbComponent, ClearableDirective, ServingPipe],
  template: `
    <!-- 1.13: a search form (role="search", name="q"): iOS offers no contact to fill in, Enter closes the keyboard -->
    <form class="search" role="search" action="" (submit)="$event.preventDefault(); blur($event)">
      <app-icon name="search" [size]="20" />
      <input
        class="input"
        type="search"
        name="q"
        enterkeyhint="search"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
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
    </form>

    <!-- 1.18: without network, the searches already made answer from the phone, the others find nothing -->
    @if (offline() && words() >= 2) {
      <p class="small off-note" role="status"><app-icon name="cloudOff" [size]="16" /> {{ 'offline.searchOff' | t }}</p>
    }

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
        <!-- 1.18: the bakery's window, the chocolates, the sweets -->
        <h2 class="section-title">{{ 'meals.sweets.title' | t }}</h2>
        <div class="slide-chips" role="group" [attr.aria-label]="'meals.sweets.title' | t">
          @for (c of sweets; track c.key) {
            <button type="button" (click)="sweet.emit(c.key)"><span aria-hidden="true">{{ c.emoji }}</span> {{ 'meals.sweets.groups.' + c.key | t }}</button>
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
                @if (r.health != null) {
                  <app-health-score [score]="r.health" />
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
            <h2 class="section-title group"><span class="dot ciqual"></span> {{ 'meals.sources.ciqual.title' | t }}
              @if (localBusy()) {
                <span class="spinner" aria-hidden="true"></span>
              }
            </h2>
            @if (local(); as list) {
              @if (list.length) {
                <div class="list" [class.stale]="localBusy()">
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
            <h2 class="section-title group"><span class="dot off"></span> {{ 'meals.sources.off.title' | t }}
              @if (offState() === 'loading' && offDone()) {
                <span class="spinner" aria-hidden="true"></span>
              }
            </h2>
            @if (offState() === 'error') {
              <p class="small muted none">{{ i18n.error(offError()) }}</p>
            } @else if (offState() === 'loading' && !offDone()) {
              <p class="small muted none"><span class="spinner" aria-hidden="true"></span> {{ 'meals.search.offLoading' | t }}</p>
            } @else {
              <!-- 1.13: the brands of the products found, the one typed in the search picked by itself -->
              @if (brandsShown() && brands().length > 1) {
                <div class="slide-chips brands" role="group" [attr.aria-label]="'meals.search.brands' | t">
                  <button type="button" [attr.aria-pressed]="brand() === null" (click)="brand.set(null)">{{ 'meals.search.allBrands' | t }}</button>
                  @for (b of brands(); track b.key) {
                    <button type="button" [attr.aria-pressed]="brand() === b.key" (click)="brand.set(b.key)">{{ b.name }} <span class="n">{{ b.n }}</span></button>
                  }
                </div>
                @if (detected(); as d) {
                  @if (brand() === d.key) {
                    <p class="tiny muted found"><app-icon name="check" [size]="13" /> {{ 'meals.search.brandFound' | t: { brand: d.name } }}</p>
                  }
                }
              }
              @if (offShown().length) {
                <div class="list" [class.stale]="offState() === 'loading'">
                  @for (f of cut(offShown()); track f.id) {
                    <ng-container *ngTemplateOutlet="foodRow; context: { $implicit: f }" />
                  }
                </div>
                <ng-container *ngTemplateOutlet="more; context: { $implicit: g, n: offShown().length }" />
              } @else {
                <p class="small muted none">{{ 'meals.search.offNone' | t }}</p>
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
          @if (f.brand && f.source === 'OFF') {
            <span class="brand">{{ f.brand }}</span>
          }
          <span class="list-title">{{ f.name }}</span>
          <span class="list-sub food-sub">{{ subOf(f) }}</span>
        </span>
        @if (f.health) {
          <app-health-score [score]="f.health.score" />
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
          <span class="list-sub">{{ r | serving }}{{ r.mine ? '' : ' · ' + (r.shared ? ('meals.recipe.community' | t) : (r.author ?? '')) }}</span>
        </span>
        @if (r.health) {
          <app-health-score [score]="r.health.score" />
        }
      </button>
    </ng-template>
  `,
  styles: `
    .off-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      color: var(--fg-2);
    }
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
    /* 1.13: what tells a food apart, on two lines when it needs them (the calories never cut off) */
    .food-sub {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: normal;
    }
    /* 1.13: the brand above the name, the way a shelf shows it */
    .brand {
      display: block;
      overflow: hidden;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent-text);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .brands {
      margin: 0;
    }
    .brands .n {
      margin-left: 2px;
      font-size: 11px;
      opacity: 0.6;
    }
    .found {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: calc(var(--space-2) * -1) 0 0;
      color: var(--success, #1f9d55);
    }
    /* the list stays while the next search runs, a touch dimmed */
    .list.stale {
      opacity: 0.6;
      transition: opacity var(--dur-2) var(--ease-out) 150ms;
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
    .group .spinner {
      width: 13px;
      height: 13px;
      margin-left: 4px;
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
  private readonly network = inject(Network);
  protected readonly offline = computed(() => !this.network.online());

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
  /** 1.18: a group of « Pâtisseries et chocolats » (core/meals/sweets.ts) */
  readonly sweet = output<string>();
  /** the recipes page (with the meal it adds to) */
  readonly recipesLink = input<string | null>(null);
  readonly recipesParams = input<Record<string, string>>({});
  protected readonly hotDrinks = HOT_DRINKS.map((d) => ({ key: d.key, emoji: d.emoji }));
  protected readonly restaurant = DISHES.map((d) => ({ key: d.key, emoji: d.emoji }));
  protected readonly apero = APERO.map((d) => ({ key: d.key, emoji: d.emoji }));
  protected readonly sweets = SWEET_CHIPS;
  protected emojiOf(r: Recipe): string {
    return TYPE_EMOJI[r.type];
  }
  protected readonly preview = PREVIEW;

  /** what the box starts with (an ingredient of an imported recipe to find) */
  readonly start = input('');
  protected readonly query = linkedSignal(() => this.start());
  protected readonly local = signal<Food[] | null>(null);
  protected readonly localBusy = signal(false);
  protected readonly off = signal<Food[]>([]);
  protected readonly offState = signal<'idle' | 'loading' | 'error'>('idle');
  /** a first search of products came back (the next ones keep its list in view while they run) */
  protected readonly offDone = signal(false);

  /** 1.13: the brands of the products found, the most frequent first */
  protected readonly brands = computed(() => {
    const by = new Map<string, { key: string; name: string; n: number }>();
    for (const f of this.off()) {
      if (!f.brand) continue;
      const key = plain(f.brand);
      const b = by.get(key);
      if (b) b.n++;
      else by.set(key, { key, name: f.brand, n: 1 });
    }
    return [...by.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  });
  /**
   * a brand typed in the search with more words (« lotus biscoff »): picked by itself. A search that is only a brand's name
   * (« biscoff ») is the product's name too: every brand stays in view
   */
  protected readonly detected = computed(() => {
    const words = plain(this.query()).split(' ').filter(Boolean);
    return (
      this.brands().find((b) => {
        const bw = b.key.split(' ');
        return bw.every((w) => words.includes(w)) && words.length > bw.length;
      }) ?? null
    );
  });
  /** the brand the products are narrowed to (null: all); a new search picks the brand it names, if any */
  protected readonly brand = linkedSignal<string | null>(() => this.detected()?.key ?? null);
  /** the brands show when the products are the only group in view */
  protected readonly brandsShown = computed(() => this.shownGroups().length === 1 && this.shownGroups()[0] === 'off');
  protected readonly offShown = computed(() => {
    const b = this.brand();
    return b && this.brandsShown() ? this.off().filter((f) => f.brand && plain(f.brand) === b) : this.off();
  });
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
      // the list in view stays until the next one is there: the page keeps its height while typing
      this.localBusy.set(true);
      this.api
        .search(q, 'ciqual')
        .then((list) => n === this.seq && this.local.set(list))
        .catch(() => n === this.seq && this.local.set([]))
        .finally(() => n === this.seq && this.localBusy.set(false));
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
      this.offDone.set(true);
      this.offState.set('idle');
    } catch (e) {
      if (n !== this.seq) return;
      this.offError.set(errorCode(e));
      this.offState.set('error');
    }
  }

  /** mine and my friends' looked through here, the community on the server; mine first, each once */
  private async findRecipes(q: string, n: number): Promise<void> {
    // 1.14: every word counts on its own, the recipes holding the most of them first (as the community on the server)
    const words = plain(q)
      .split(' ')
      .filter((w) => w.length >= 2 && !['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'en', 'avec', 'sans'].includes(w))
      .map((w) => (w.length >= 5 && /[sx]$/.test(w) ? w.slice(0, -1) : w));
    const hits = (r: Recipe) => words.filter((w) => plain(r.name).includes(w)).length;
    const match = (r: Recipe) => hits(r) > 0;
    this.friendsRecipes ??= this.api.friendsRecipes(null).catch(() => [] as Recipe[]);
    const [friends, community] = await Promise.all([this.friendsRecipes, this.api.community(null, 'top', 0, q).catch(() => [] as Recipe[])]);
    if (n !== this.seq) return;
    const seen = new Set<string>();
    const all = [
      ...this.recipes().filter(match).sort((a, b) => hits(b) - hits(a)),
      ...friends.filter(match).sort((a, b) => hits(b) - hits(a)),
      ...community,
    ].filter((r) => !seen.has(r.id) && !!seen.add(r.id));
    this.foundRecipes.set(all);
  }

  /**
   * 1.13: what tells a food apart under its name: what it is (its generic name, else its food group, else its Ciqual
   * group), its size on the shelf, its calories per 100 g (100 ml for a drink)
   */
  protected subOf(f: Food): string {
    const kind = f.genericName && f.genericName.length <= 40 ? f.genericName : this.kindLabel(f) ?? f.category;
    const parts = [kind, f.quantity].filter((x): x is string => !!x);
    if (!parts.length) parts.push(f.brand && f.source !== 'OFF' ? f.brand : this.i18n.t('meals.search.sources.' + f.source));
    parts.push(this.i18n.t('meals.search.per100', { kcal: this.i18n.number(f.per100.kcal), u: f.liquid ? 'ml' : 'g' }));
    return parts.join(' · ');
  }

  private kindLabel(f: Food): string | null {
    const k = kindKey(f.kind);
    return k ? this.i18n.t('meals.kinds.' + k) : null;
  }

  /** Enter closes the keyboard (the search runs as one types) */
  protected blur(e: Event): void {
    ((e.target as HTMLFormElement).querySelector('input') as HTMLInputElement | null)?.blur();
  }

  protected recentAmount(r: RecentItem): string {
    if (r.grams != null && r.liquid) return this.i18n.t('meals.ml', { ml: this.i18n.number(r.grams) });
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
