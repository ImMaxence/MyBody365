import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { recipeLinkId } from '../../core/meals/recipe-link';
import type { Recipe, RecipeType } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ServingPipe } from '../../shared/serving.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { RecipesView } from '../../core/meals/recipes-view';
import { FavoritesStore } from '../../core/meals/favorites.store';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { ClearableDirective } from '../../shared/clearable.directive';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { SegDirective } from '../../shared/seg.directive';
import { localDay } from '../../core/tracking/tracking.store';

/** 1.13: « Healthy » first, before every other filter */
export const RECIPE_TYPES: RecipeType[] = ['HEALTHY', 'BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'TREAT', 'DRINK'];
export const TYPE_EMOJI: Record<RecipeType, string> = { HEALTHY: '🥑', BREAKFAST: '🥣', LUNCH: '🥗', DINNER: '🍲', SNACK: '🍎', DESSERT: '🍰', TREAT: '🧁', DRINK: '🍹' };

/** My recipes, my friends' recipes, and the community's (best first or newest, by type). */
/** 1.14: the words a search looks for, singular (« salades » → « salade »), without the little words (as the server) */
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'a', 'et', 'en', 'd', 'l', 'un', 'une', 'avec', 'sans', 'pour', 'sur', 'ou']);
function searchWords(q: string): string[] {
  return [...new Set(plain(q).split(' ').filter((w) => w.length >= 2 && !STOP.has(w)).map((w) => (w.length >= 5 && /[sx]$/.test(w) ? w.slice(0, -1) : w)))].slice(0, 6);
}

/** 1.14: the richest servings in a vitamin or a mineral first, those without any of it left out */
function byRich(list: Recipe[], rich: string | null): Recipe[] {
  if (!rich) return list;
  return list.filter((r) => (r.micros?.[rich] ?? 0) > 0).sort((a, b) => (b.micros?.[rich] ?? 0) - (a.micros?.[rich] ?? 0));
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

@Component({
  selector: 'app-recipes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, NgTemplateOutlet, RouterLink, TranslatePipe, ServingPipe, IconComponent, BackButtonComponent, HealthScoreComponent, ClearableDirective],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.recipe.listTitle' | t }}</h1>
      </header>

      <!-- the two ways to add a recipe, side by side at the top -->
      <div class="add">
        <a routerLink="/app/meals/recipes/new" [queryParams]="{ import: '' }" class="btn btn-secondary btn-s"><app-icon name="link" [size]="18" /> {{ 'meals.recipe.importShort' | t }}</a>
        <a routerLink="/app/meals/recipes/new" class="btn btn-secondary btn-s"><app-icon name="plus" [size]="18" /> {{ 'meals.recipe.new' | t }}</a>
      </div>

      <!-- 1.11: the ingredients at hand, then what to cook with them -->
      <a class="with card" routerLink="/app/meals/recipes/with">
        <span class="with-ico"><app-icon name="basket" [size]="22" /></span>
        <span class="with-copy">
          <b>{{ 'meals.with.cta' | t }}</b>
          <span class="small muted">{{ 'meals.with.ctaSub' | t }}</span>
        </span>
        <app-icon name="chevronRight" />
      </a>

      <!-- 1.21: the fruits and vegetables of the month, their vitamins and their recipes -->
      <a class="with card" routerLink="/app/meals/recipes/season">
        <span class="with-ico season-ico"><app-icon name="leaf" [size]="22" /></span>
        <span class="with-copy">
          <b>{{ 'meals.season.cardTitle' | t: { month: seasonMonth() } }}</b>
          <span class="small muted">{{ 'meals.season.cardSub' | t }}</span>
        </span>
        <app-icon name="chevronRight" />
      </a>

      <!-- one search for every recipe (mine, my friends', the community), a moment after the last key -->
      <label class="search">
        <app-icon name="search" [size]="20" />
        <input type="search" class="input" [value]="term()" (input)="search($any($event.target).value)" enterkeyhint="search"
          autocomplete="off" autocorrect="off" spellcheck="false"
          [placeholder]="'meals.recipe.searchPlaceholder' | t" [attr.aria-label]="'meals.recipe.search' | t" />
      </label>

      @if (query()) {
        @if (results(); as res) {
          @if (res.length) {
            @for (g of res; track g.key) {
              <h2 class="group-title">{{ 'meals.recipe.' + g.key | t }} <span class="muted num">{{ g.list.length }}</span></h2>
              <div class="cards" [class.stale]="searching()">
                @for (r of g.list; track r.id; let i = $index) {
                  <ng-container *ngTemplateOutlet="card; context: { $implicit: r, origin: g.key, i: i }" />
                }
              </div>
            }
          } @else {
            <div class="empty">
              <span class="empty-icon"><app-icon name="search" /></span>
              <p class="small">{{ 'meals.recipe.noMatch' | t: { q: query() } }}</p>
            </div>
          }
        } @else {
          <div class="cards" aria-busy="true">
            @for (i of [0, 1]; track i) {
              <div class="rcard skeleton" style="height: 210px"></div>
            }
          </div>
        }
      } @else {
      <div class="seg" role="group" [attr.aria-label]="'meals.recipe.listTitle' | t">
        <button type="button" [attr.aria-pressed]="tab() === 'mine'" (click)="tab.set('mine')">{{ 'meals.recipe.mine' | t }}</button>
        <button type="button" [attr.aria-pressed]="tab() === 'friends'" (click)="tab.set('friends')">{{ 'meals.recipe.friends' | t }}</button>
        <button type="button" [attr.aria-pressed]="tab() === 'community'" (click)="tab.set('community')">{{ 'meals.recipe.community' | t }}</button>
      </div>

      @if (tab() !== 'mine') {
        <div class="filters">
          <div class="slide-chips" role="group" [attr.aria-label]="'meals.recipe.type' | t">
            <button type="button" [attr.aria-pressed]="type() === null" (click)="type.set(null)">{{ 'meals.recipe.allTypes' | t }}</button>
            @for (t of types; track t) {
              <button type="button" [attr.aria-pressed]="type() === t" (click)="type.set(t)"><span class="chip-emoji" aria-hidden="true">{{ emoji[t] }}</span> {{ 'meals.recipe.types.' + t | t }}</button>
            }
          </div>
          <!-- 1.14: the richest servings in a vitamin or a mineral first -->
          <div class="rich-row">
            <span class="tiny muted rich-label">{{ 'meals.micros.sort' | t }}</span>
            <div class="slide-chips" role="group" [attr.aria-label]="'meals.micros.sort' | t">
              <button type="button" [attr.aria-pressed]="rich() === null" (click)="rich.set(null)">{{ 'meals.micros.sortAll' | t }}</button>
              @for (k of richKeys; track k) {
                <button type="button" [attr.aria-pressed]="rich() === k" (click)="rich.set(k)">{{ 'meals.micros.names.' + k | t }}</button>
              }
            </div>
          </div>
          @if (tab() === 'community') {
            <div class="seg small-seg" role="group">
              <button type="button" [attr.aria-pressed]="sort() === 'top'" (click)="sort.set('top')">{{ 'meals.recipe.sortTop' | t }}</button>
              <button type="button" [attr.aria-pressed]="sort() === 'new'" (click)="sort.set('new')">{{ 'meals.recipe.sortNew' | t }}</button>
            </div>
          }
        </div>
      }

      <!-- 1.12: another tab or filter: its recipes come in, from the side of the tab (a filter: from below), one after the other -->
      @for (k of [shownKey()]; track k) {
      <div class="swap" [attr.data-enter]="enter()">
      <!-- 1.9: the favourite recipes (mine, my friends', the community's) above my own -->
      @if (tab() === 'mine' && favs().length) {
        <h2 class="group-title"><span class="heart"><app-icon name="heart" [size]="13" /></span> {{ 'meals.favorites.title' | t }} <span class="muted num">{{ favs().length }}</span></h2>
        <div class="cards">
          @for (r of favs(); track r.id; let i = $index) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: r, origin: r.mine ? 'mine' : r.shared ? 'community' : 'friends', i: i }" />
          }
        </div>
        <h2 class="group-title">{{ 'meals.recipe.mine' | t }}</h2>
      }
      @if (list(); as recipes) {
        @if (recipes.length) {
          <div class="cards" [class.stale]="loading()" [attr.aria-busy]="loading()">
            @for (r of recipes; track r.id; let i = $index) {
              <ng-container *ngTemplateOutlet="card; context: { $implicit: r, origin: tab(), i: i }" />
            }
          </div>
          @if (tab() === 'community' && more()) {
            <button type="button" class="btn btn-ghost btn-block" [disabled]="loadingMore()" (click)="loadMore()">{{ 'meals.recipe.more' | t }}</button>
          }
        } @else {
          <div class="empty">
            <span class="empty-icon"><app-icon name="book" /></span>
            @if (tab() !== 'mine' && rich(); as k) {
              <!-- 1.14: nothing rich in it (or its vitamins not known yet): said as such -->
              <p class="small">{{ 'meals.micros.sortEmpty' | t: { name: richName(k) } }}</p>
              <button type="button" class="btn btn-secondary btn-s" (click)="rich.set(null)">{{ 'meals.micros.sortClear' | t }}</button>
            } @else {
              <p class="small">{{ 'meals.recipe.empty.' + tab() | t }}</p>
            }
          </div>
        }
      } @else if (slow()) {
        <!-- only when the first list takes a while: a fast one appears at once, without a flash -->
        <div class="cards" aria-busy="true">
          @for (i of [0, 1, 2, 3]; track i) {
            <div class="rcard skeleton" style="height: 210px"></div>
          }
        </div>
      }
      </div>
      }
      }

      <ng-template #card let-r let-origin="origin" let-i="i">
        <a class="rcard" [routerLink]="['/app/meals/recipes', r.id]" [queryParams]="mealParams()" [style.--i]="i">
          <span class="pic">
            @if (r.thumbUrl) {
              <img [src]="r.thumbUrl" alt="" loading="lazy" />
            } @else {
              <span class="emoji" aria-hidden="true">{{ emojiOf(r) }}</span>
            }
            @if (r.health) {
              <app-health-score class="grade" [score]="r.health.score" />
            }
          </span>
          <span class="rbody">
            <span class="rname">{{ r.name }}</span>
            <span class="small muted">{{ r | serving }}</span>
            <span class="rmeta tiny">
              @if (origin === 'community') {
                <span>{{ 'meals.recipe.by' | t: { name: r.author ?? '' } }}</span>
                <span class="score"><app-icon name="thumbUp" [size]="13" /> {{ r.score }}</span>
              } @else if (origin === 'friends') {
                <span class="friend-by"><app-icon name="users" [size]="13" /> {{ r.author }}</span>
              } @else {
                <span class="types-line">{{ typesOf(r) }}</span>
                @if (r.visibility !== 'PRIVATE') {
                  <span class="vis-ico" [attr.title]="'meals.recipe.visibility.' + r.visibility | t" [attr.aria-label]="'meals.recipe.visibility.' + r.visibility | t">
                    <app-icon [name]="r.visibility === 'FRIENDS' ? 'users' : 'globe'" [size]="13" />
                  </span>
                }
              }
            </span>
          </span>
        </a>
      </ng-template>
    </main>
  `,
  styles: `
    /* the cards entering from the side of a tab never widen the page (iOS would zoom out) */
    :host {
      display: block;
      overflow-x: clip;
    }
    .add {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }
    .add .btn {
      min-width: 0;
      white-space: nowrap;
    }
    /* another filter loads: the list stays, a touch dimmed only if it takes a while */
    .cards.stale {
      opacity: 0.55;
      transition: opacity 160ms ease 220ms;
    }
    .rich-row {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .rich-label {
      padding-left: 2px;
    }
    .filters {
      display: grid;
      gap: var(--space-3);
    }
    .heart {
      display: inline-flex;
      color: #e5484d;
      vertical-align: -1px;
    }
    .heart ::ng-deep svg {
      fill: currentColor;
    }
    .group-title {
      margin: var(--space-2) 0 calc(var(--space-2) * -1);
      font-size: var(--fs-s);
      font-weight: 750;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--fg-2);
    }
    .with {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 14px var(--space-4);
      color: inherit;
      text-decoration: none;
      transition: transform var(--dur-2) var(--ease-out);
    }
    .with.is-pressed {
      transform: scale(0.98);
    }
    .with-ico {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      flex: none;
      border-radius: 14px;
      background: var(--success-soft);
      color: var(--success);
    }
    .season-ico {
      background: color-mix(in srgb, #e2711d 14%, transparent);
      color: #e2711d;
    }
    .with-copy {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 2px;
    }
    /* one pill: the magnifier and the field side by side (as in the food search) */
    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px 4px 14px;
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--line-strong);
      box-shadow: var(--shadow-1);
      color: var(--fg-3);
    }
    .search:focus-within {
      border-color: var(--accent);
    }
    .search .input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      box-shadow: none;
      padding-inline: 0;
      color: var(--fg);
    }
    .search .input:focus {
      outline: none;
    }
    .chip-emoji {
      font-size: 1.1rem;
      line-height: 1;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .rcard {
      display: grid;
      align-content: start;
      border-radius: var(--radius-l);
      background: var(--surface);
      border: 1px solid var(--line);
      overflow: hidden;
      color: inherit;
      text-decoration: none;
      transition: transform var(--dur-2) var(--ease-out);
    }
    /* 1.14: no press effect: on a phone it played as soon as a finger touched a card to scroll the list */
    @keyframes card-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
    }
    /* the page's own rhythm inside the wrapper */
    .swap {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-5);
    }
    /* 1.12: the cards of the tab just chosen come in one after the other (backwards: the press effect stays theirs) */
    .swap[data-enter] :is(.rcard, .empty, .group-title) {
      animation: card-x 380ms var(--ease-out) backwards;
      animation-delay: calc(min(var(--i, 0), 7) * 32ms);
    }
    .swap[data-enter='right'] {
      --dx: 22px;
      --dy: 0px;
    }
    .swap[data-enter='left'] {
      --dx: -22px;
      --dy: 0px;
    }
    .swap[data-enter='up'] {
      --dx: 0px;
      --dy: 12px;
    }
    @keyframes card-x {
      from {
        opacity: 0;
        transform: translate(var(--dx, 0), var(--dy, 0));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .swap[data-enter] :is(.rcard, .empty, .group-title) {
        animation: none;
      }
    }
    /* the frame sets the size, never the photo: on Safari a tall photo at height 100% would spill over the text */
    .pic {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      overflow: hidden;
      background: var(--accent-soft);
    }
    .pic img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .emoji {
      font-size: 2.6rem;
    }
    /* the Nutri-Score in a corner of the picture, as on a packaging */
    /* 1.13: the health score on the photo, on a solid tint so it reads on any picture */
    .pic .grade {
      position: absolute;
      left: 8px;
      bottom: 8px;
      background: color-mix(in srgb, var(--hs) 20%, var(--surface));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    .rbody {
      display: grid;
      gap: 2px;
      padding: 10px 12px 12px;
    }
    .rname {
      font-weight: 700;
      line-height: 1.25;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .rmeta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-top: 4px;
      color: var(--fg-2);
      font-weight: 600;
    }
    .friend-by {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .vis-ico {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--cool-soft);
      color: var(--cool);
    }
    .score {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--accent-text);
    }
  `,
})
export class RecipesPage {
  /** opened from « Ajouter au déjeuner »: the recipes are added to that meal */
  readonly slotParam = input<string | undefined>(undefined, { alias: 'slot' });
  readonly dayParam = input<string | undefined>(undefined, { alias: 'day' });
  /** 1.20: opened from « Mon planning »: the recipe chosen is planned for that day (YYYY-MM-DD) and meal */
  readonly planParam = input<string | undefined>(undefined, { alias: 'plan' });
  protected readonly mealParams = computed(() =>
    this.planParam() ? { plan: this.planParam(), slot: this.slotParam() ?? null } : this.slotParam() ? { slot: this.slotParam(), day: this.dayParam() ?? null } : {},
  );
  private readonly api = inject(MealsApi);
  private readonly favorites = inject(FavoritesStore);
  protected readonly favs = computed(() => this.favorites.recipes() ?? []);

  protected emojiOf(r: Recipe): string {
    return TYPE_EMOJI[r.type];
  }

  /** « Petit-déj · Collation » */
  protected typesOf(r: Recipe): string {
    return (r.types?.length ? r.types : [r.type]).map((t) => this.i18n.t('meals.recipe.types.' + t)).join(' · ');
  }
  protected readonly i18n = inject(I18nService);
  /** 1.21: « De saison en novembre » */
  protected readonly seasonMonth = computed(() => this.i18n.date(localDay(), { month: 'long' }));
  protected readonly types = RECIPE_TYPES;
  protected readonly emoji = TYPE_EMOJI;
  /** the tab, the filters and the search outlive the screen (back from a recipe: as left) */
  private readonly view = inject(RecipesView);
  protected readonly tab = this.view.tab;
  protected readonly type = this.view.type;
  protected readonly sort = this.view.sort;
  protected readonly rich = this.view.rich;
  /** « vitamine C », « fer »: the name inside a sentence */
  protected richName(k: string): string {
    const name = this.i18n.t('meals.micros.names.' + k);
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  protected readonly richKeys = ['c', 'fe', 'ca', 'a', 'd', 'b9', 'b12', 'mg', 'k', 'zn', 'e', 'b6'];
  /** what is typed in the community search, and what is searched (a moment after the last key) */
  protected readonly term = this.view.term;
  protected readonly query = this.view.query;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** the community comes 30 at a time */
  protected readonly more = signal(false);
  protected readonly loadingMore = signal(false);
  private page = 0;

  /** what was found, by source (only the sources with something) */
  protected readonly results = signal<{ key: 'mine' | 'friends' | 'community'; list: Recipe[] }[] | null>(null);
  protected readonly searching = signal(false);
  private searchSeq = 0;

  /** two letters at least: a single one would find everything */
  private readonly linkRouter = inject(Router);

  protected search(value: string): void {
    // 1.19: a recipe's link pasted here opens the recipe
    const id = recipeLinkId(value);
    if (id) {
      this.term.set('');
      void this.linkRouter.navigate(['/app/meals/recipes', id]);
      return;
    }
    this.term.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.query.set(plain(value).length >= 2 ? value.trim() : ''), 300);
  }

  /** mine and my friends' looked through here, the community on the server (all of it, not a page) */
  private find(q: string): void {
    const n = ++this.searchSeq;
    this.searching.set(true);
    const words = searchWords(q);
    // 1.14: every word counts on its own (« salade tiramisu chocolat »): the recipes holding the most of them first
    const score = (r: Recipe) => {
      const name = plain(r.name);
      return words.filter((w) => name.includes(w)).length;
    };
    const match = (r: Recipe) => score(r) > 0;
    const best = (a: Recipe, b: Recipe) => score(b) - score(a);
    Promise.all([
      this.api.myRecipes().catch(() => [] as Recipe[]),
      this.api.friendsRecipes(null).catch(() => [] as Recipe[]),
      this.api.community(null, 'top', 0, q).catch(() => [] as Recipe[]),
    ])
      .then(([mine, friends, community]) => {
        if (n !== this.searchSeq) return;
        const groups = [
          { key: 'mine' as const, list: mine.filter(match).sort(best) },
          { key: 'friends' as const, list: friends.filter(match).sort(best) },
          { key: 'community' as const, list: community },
        ];
        this.results.set(groups.filter((g) => g.list.length));
      })
      .finally(() => n === this.searchSeq && this.searching.set(false));
  }

  protected async loadMore(): Promise<void> {
    const n = this.seq;
    this.loadingMore.set(true);
    try {
      const next = await this.api.community(this.type(), this.sort(), this.page + 1, '', this.rich());
      if (n !== this.seq) return;
      this.page++;
      this.list.update((l) => [...(l ?? []), ...next.filter((r) => !l?.some((x) => x.id === r.id))]);
      // back from a recipe, the pages already opened are there again (and the screen where it was)
      this.seen.set(this.key(), this.list() ?? []);
      this.more.set(next.length === 30);
    } finally {
      this.loadingMore.set(false);
    }
  }
  protected readonly list = signal<Recipe[] | null>(null);
  /** 1.12: the list on screen (its key), and where the next one comes from: null for the first one (the screen's own transition) */
  protected readonly shownKey = signal<string | null>(null);
  protected readonly enter = signal<'left' | 'right' | 'up' | null>(null);
  private static readonly ORDER: Record<string, number> = { mine: 0, friends: 1, community: 2 };

  private show(key: string): void {
    const prev = this.shownKey();
    if (prev === key) return;
    if (prev !== null) {
      const from = prev.split('|')[0];
      const to = key.split('|')[0];
      this.enter.set(from === to ? 'up' : RecipesPage.ORDER[to] > RecipesPage.ORDER[from] ? 'right' : 'left');
    }
    this.shownKey.set(key);
  }
  protected readonly loading = signal(false);
  /** the first list is still not there after a moment: placeholders, never for a quick one */
  protected readonly slow = signal(false);
  /** the lists already seen: back to a tab or a filter, it shows at once (and is refreshed behind) */
  private readonly seen = this.view.seen;
  private seq = 0;

  /** the list on screen, as kept in RecipesView.seen */
  private key(): string {
    const tab = this.tab();
    return [tab, tab === 'mine' ? null : this.type(), tab === 'community' ? this.sort() : '', tab === 'mine' ? '' : (this.rich() ?? '')].join('|');
  }

  constructor() {
    void this.favorites.ensure();
    // a search: every source at once; cleared: back to the tabs
    effect(() => {
      const q = this.query();
      untracked(() => {
        // back from a search: the tab as it was, without coming in again
        this.enter.set(null);
        if (q) void this.find(q);
        else this.results.set(null);
      });
    });
    effect(() => {
      const tab = this.tab();
      const type = tab === 'mine' ? null : this.type();
      const sort = this.sort();
      const rich = tab === 'mine' ? null : this.rich();
      const key = [tab, type, tab === 'community' ? sort : '', rich ?? ''].join('|');
      const n = ++this.seq;
      const known = this.seen.get(key);
      // the pages of the community already opened stay (« Voir plus »): back from a recipe, nothing shrinks
      this.page = known ? Math.max(0, Math.ceil(known.length / 30) - 1) : 0;
      if (known) {
        this.list.set(known);
        this.show(key);
      }
      this.more.set(tab === 'community' && (known?.length ?? 0) > 0 && (known?.length ?? 0) % 30 === 0);
      this.loading.set(!known);
      // read without tracking: the list it sets must not start it again
      const slow = untracked(this.list) === null ? setTimeout(() => n === this.seq && this.slow.set(true), 450) : null;
      const load =
        tab === 'mine'
          ? this.api.myRecipes()
          : tab === 'friends'
            ? this.api.friendsRecipes(type).then((list) => byRich(list, rich))
            : this.api.community(type, sort, 0, '', rich);
      load
        .then((r) => {
          // the first page again, and the next ones as they were
          const kept = known && known.length > r.length ? [...r, ...known.filter((x) => !r.some((y) => y.id === x.id))] : r;
          this.seen.set(key, kept);
          if (n !== this.seq) return;
          this.list.set(kept);
          this.show(key);
          if (kept === r) this.page = 0;
          this.more.set(tab === 'community' && kept.length > 0 && kept.length % 30 === 0);
        })
        .catch(() => {
          if (n !== this.seq) return;
          this.list.set(this.list() ?? []);
          this.show(key);
        })
        .finally(() => {
          if (slow) clearTimeout(slow);
          if (n !== this.seq) return;
          this.loading.set(false);
          this.slow.set(false);
        });
    });
  }
}
