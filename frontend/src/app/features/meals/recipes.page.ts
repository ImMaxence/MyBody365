import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Recipe, RecipeType } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { SegDirective } from '../../shared/seg.directive';

export const RECIPE_TYPES: RecipeType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'DESSERT', 'DRINK'];
export const TYPE_EMOJI: Record<RecipeType, string> = { BREAKFAST: '🥣', LUNCH: '🥗', DINNER: '🍲', SNACK: '🍎', DESSERT: '🍰', DRINK: '🥤' };

/** My recipes, my friends' recipes, and the community's (best first or newest, by type). */
@Component({
  selector: 'app-recipes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.recipe.listTitle' | t }}</h1>
        <span class="spacer"></span>
        <a routerLink="/app/meals/recipes/new" [queryParams]="{ import: '' }" class="icon-btn" [attr.aria-label]="'meals.recipe.import.title' | t"><app-icon name="link" /></a>
        <a routerLink="/app/meals/recipes/new" class="btn btn-primary btn-s"><app-icon name="plus" [size]="18" /> {{ 'meals.recipe.new' | t }}</a>
      </header>

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
          <div class="cards">
            @for (r of recipes; track r.id; let i = $index) {
              <a class="rcard" [routerLink]="['/app/meals/recipes', r.id]" [style.--i]="i">
                <span class="pic">
                  @if (r.thumbUrl) {
                    <img [src]="r.thumbUrl" alt="" loading="lazy" />
                  } @else {
                    <span class="emoji" aria-hidden="true">{{ emoji[r.type] }}</span>
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
                      <span>{{ 'meals.recipe.types.' + r.type | t }}</span>
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
        } @else {
          <div class="empty">
            <span class="empty-icon"><app-icon name="book" /></span>
            <p class="small">{{ 'meals.recipe.empty.' + tab() | t }}</p>
          </div>
        }
      } @else {
        <div class="cards">
          @for (i of [0, 1, 2, 3]; track i) {
            <div class="rcard skeleton" style="height: 210px"></div>
          }
        </div>
      }
    </main>
  `,
  styles: `
    .spacer {
      flex: 1;
    }
    .filters {
      display: grid;
      gap: var(--space-3);
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
      animation: card-in 420ms var(--ease-out) both;
      animation-delay: calc(min(var(--i, 0), 10) * 40ms);
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
    .pic {
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      background: var(--accent-soft);
    }
    .pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .emoji {
      font-size: 2.6rem;
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
  private readonly api = inject(MealsApi);
  protected readonly i18n = inject(I18nService);
  protected readonly types = RECIPE_TYPES;
  protected readonly emoji = TYPE_EMOJI;
  protected readonly tab = signal<'mine' | 'friends' | 'community'>('mine');
  protected readonly type = signal<RecipeType | null>(null);
  protected readonly sort = signal<'top' | 'new'>('top');
  protected readonly list = signal<Recipe[] | null>(null);

  constructor() {
    effect(() => {
      const tab = this.tab();
      const type = this.type();
      const sort = this.sort();
      this.list.set(null);
      const load = tab === 'mine' ? this.api.myRecipes() : tab === 'friends' ? this.api.friendsRecipes(type) : this.api.community(type, sort);
      load.then((r) => this.list.set(r)).catch(() => this.list.set([]));
    });
  }
}
