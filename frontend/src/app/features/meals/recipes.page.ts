import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Recipe, RecipeType } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { NutriscoreComponent } from '../../shared/nutriscore.component';
import { SegDirective } from '../../shared/seg.directive';

export const RECIPE_TYPES: RecipeType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'DRINK'];
export const TYPE_EMOJI: Record<RecipeType, string> = { BREAKFAST: '🥣', LUNCH: '🥗', DINNER: '🍲', SNACK: '🍎', DESSERT: '🍰', DRINK: '🥤' };

/** My recipes, my friends' recipes, and the community's (best first or newest, by type). */
@Component({
  selector: 'app-recipes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, RouterLink, TranslatePipe, IconComponent, BackButtonComponent, NutriscoreComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.recipe.listTitle' | t }}</h1>
      </header>

      <div class="add">
        <a routerLink="/app/meals/recipes/new" [queryParams]="{ import: '' }" class="import-cta">
          <span class="import-ico"><app-icon name="link" [size]="22" /></span>
          <span class="import-copy">
            <b>{{ 'meals.recipe.import.listCta' | t }}</b>
            <span class="small">{{ 'meals.recipe.import.listCtaSub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </a>
        <a routerLink="/app/meals/recipes/new" class="btn btn-secondary btn-block"><app-icon name="plus" [size]="18" /> {{ 'meals.recipe.new' | t }}</a>
      </div>

      <div class="seg" role="group" [attr.aria-label]="'meals.recipe.listTitle' | t">
        <button type="button" [attr.aria-pressed]="tab() === 'mine'" (click)="tab.set('mine')">{{ 'meals.recipe.mine' | t }}</button>
        <button type="button" [attr.aria-pressed]="tab() === 'friends'" (click)="tab.set('friends')">{{ 'meals.recipe.friends' | t }}</button>
        <button type="button" [attr.aria-pressed]="tab() === 'community'" (click)="tab.set('community')">{{ 'meals.recipe.community' | t }}</button>
      </div>

      @if (tab() !== 'mine') {
        <div class="filters">
          @if (tab() === 'community') {
            <label class="search">
              <app-icon name="search" [size]="18" />
              <input type="search" class="input" [value]="term()" (input)="search($any($event.target).value)" enterkeyhint="search"
                [placeholder]="'meals.recipe.searchPlaceholder' | t" [attr.aria-label]="'meals.recipe.search' | t" />
            </label>
          }
          <div class="slide-chips" role="group" [attr.aria-label]="'meals.recipe.type' | t">
            <button type="button" [attr.aria-pressed]="type() === null" (click)="type.set(null)">{{ 'meals.recipe.allTypes' | t }}</button>
            @for (t of types; track t) {
              <button type="button" [attr.aria-pressed]="type() === t" (click)="type.set(t)"><span class="chip-emoji" aria-hidden="true">{{ emoji[t] }}</span> {{ 'meals.recipe.types.' + t | t }}</button>
            }
          </div>
          @if (tab() === 'community') {
            <div class="seg small-seg" role="group">
              <button type="button" [attr.aria-pressed]="sort() === 'top'" (click)="sort.set('top')">{{ 'meals.recipe.sortTop' | t }}</button>
              <button type="button" [attr.aria-pressed]="sort() === 'new'" (click)="sort.set('new')">{{ 'meals.recipe.sortNew' | t }}</button>
            </div>
          }
        </div>
      }

      @if (list(); as recipes) {
        @if (recipes.length) {
          <div class="cards" [class.stale]="loading()" [attr.aria-busy]="loading()">
            @for (r of recipes; track r.id; let i = $index) {
              <a class="rcard" [routerLink]="['/app/meals/recipes', r.id]" [queryParams]="mealParams()" [style.--i]="i">
                <span class="pic">
                  @if (r.thumbUrl) {
                    <img [src]="r.thumbUrl" alt="" loading="lazy" />
                  } @else {
                    <span class="emoji" aria-hidden="true">{{ emoji[r.type] }}</span>
                  }
                  @if (r.nutriscore) {
                    <app-nutriscore class="grade" [grade]="r.nutriscore" [estimated]="true" />
                  }
                </span>
                <span class="rbody">
                  <span class="rname">{{ r.name }}</span>
                  <span class="small muted">{{ i18n.number(r.perServing.kcal) }} kcal {{ 'meals.perServing' | t }}</span>
                  <span class="rmeta tiny">
                    @if (tab() === 'community') {
                      <span>{{ 'meals.recipe.by' | t: { name: r.author ?? '' } }}</span>
                      <span class="score"><app-icon name="thumbUp" [size]="13" /> {{ r.score }}</span>
                    } @else if (tab() === 'friends') {
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
            }
          </div>
          @if (tab() === 'community' && more()) {
            <button type="button" class="btn btn-ghost btn-block" [disabled]="loadingMore()" (click)="loadMore()">{{ 'meals.recipe.more' | t }}</button>
          }
        } @else {
          <div class="empty">
            <span class="empty-icon"><app-icon name="book" /></span>
            <p class="small">{{ tab() === 'community' && query() ? ('meals.recipe.noMatch' | t: { q: query() }) : ('meals.recipe.empty.' + tab() | t) }}</p>
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
    </main>
  `,
  styles: `
    .add {
      display: grid;
      gap: var(--space-2);
    }
    /* the import, put forward: a link is all it takes */
    .import-cta {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--flame-deep);
      color: #fff;
      text-decoration: none;
      box-shadow:
        0 10px 28px -12px var(--accent-glow),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
      transition: transform var(--dur-1) var(--ease-out);
    }
    .import-cta:active {
      transform: scale(0.98);
    }
    .import-ico {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      flex: none;
      border-radius: 14px;
      background: rgb(255 255 255 / 0.2);
    }
    .import-copy {
      display: grid;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .import-copy b {
      font-size: 1.05rem;
    }
    /* another filter loads: the list stays, a touch dimmed only if it takes a while */
    .cards.stale {
      opacity: 0.55;
      transition: opacity 160ms ease 220ms;
    }
    .filters {
      display: grid;
      gap: var(--space-3);
    }
    .search {
      position: relative;
      display: block;
    }
    .search app-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--fg-3);
      pointer-events: none;
    }
    .search .input {
      padding-left: 42px;
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
    .rcard:active {
      transform: scale(0.97);
    }
    @keyframes card-in {
      from {
        opacity: 0;
        transform: translateY(10px);
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
    .pic .grade {
      position: absolute;
      left: 8px;
      bottom: 8px;
      width: 54px;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
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
  protected readonly mealParams = computed(() => (this.slotParam() ? { slot: this.slotParam(), day: this.dayParam() ?? null } : {}));
  private readonly api = inject(MealsApi);

  /** « Petit-déj · Collation » */
  protected typesOf(r: Recipe): string {
    return (r.types?.length ? r.types : [r.type]).map((t) => this.i18n.t('meals.recipe.types.' + t)).join(' · ');
  }
  protected readonly i18n = inject(I18nService);
  protected readonly types = RECIPE_TYPES;
  protected readonly emoji = TYPE_EMOJI;
  protected readonly tab = signal<'mine' | 'friends' | 'community'>('mine');
  protected readonly type = signal<RecipeType | null>(null);
  protected readonly sort = signal<'top' | 'new'>('top');
  /** what is typed in the community search, and what is searched (a moment after the last key) */
  protected readonly term = signal('');
  protected readonly query = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** the community comes 30 at a time */
  protected readonly more = signal(false);
  protected readonly loadingMore = signal(false);
  private page = 0;

  protected search(value: string): void {
    this.term.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.query.set(value.trim()), 300);
  }

  protected async loadMore(): Promise<void> {
    const n = this.seq;
    this.loadingMore.set(true);
    try {
      const next = await this.api.community(this.type(), this.sort(), this.page + 1, this.query());
      if (n !== this.seq) return;
      this.page++;
      this.list.update((l) => [...(l ?? []), ...next.filter((r) => !l?.some((x) => x.id === r.id))]);
      this.more.set(next.length === 30);
    } finally {
      this.loadingMore.set(false);
    }
  }
  protected readonly list = signal<Recipe[] | null>(null);
  protected readonly loading = signal(false);
  /** the first list is still not there after a moment: placeholders, never for a quick one */
  protected readonly slow = signal(false);
  /** the lists already seen: back to a tab or a filter, it shows at once (and is refreshed behind) */
  private readonly seen = new Map<string, Recipe[]>();
  private seq = 0;

  constructor() {
    effect(() => {
      const tab = this.tab();
      const type = tab === 'mine' ? null : this.type();
      const sort = this.sort();
      const query = tab === 'community' ? this.query() : '';
      const key = [tab, type, tab === 'community' ? sort : '', query].join('|');
      this.page = 0;
      const n = ++this.seq;
      const known = this.seen.get(key);
      if (known) this.list.set(known);
      this.more.set(tab === 'community' && (known?.length ?? 0) === 30);
      this.loading.set(!known);
      // read without tracking: the list it sets must not start it again
      const slow = untracked(this.list) === null ? setTimeout(() => n === this.seq && this.slow.set(true), 450) : null;
      const load = tab === 'mine' ? this.api.myRecipes() : tab === 'friends' ? this.api.friendsRecipes(type) : this.api.community(type, sort, 0, query);
      load
        .then((r) => {
          this.seen.set(key, r);
          if (n !== this.seq) return;
          this.list.set(r);
          this.more.set(tab === 'community' && r.length === 30);
        })
        .catch(() => n === this.seq && this.list.set(this.list() ?? []))
        .finally(() => {
          if (slow) clearTimeout(slow);
          if (n !== this.seq) return;
          this.loading.set(false);
          this.slow.set(false);
        });
    });
  }
}
