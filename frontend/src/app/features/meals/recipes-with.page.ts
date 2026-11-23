import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { FoundRecipe, IngredientFamily } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ServingPipe } from '../../shared/serving.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { ClearableDirective } from '../../shared/clearable.directive';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { TYPE_EMOJI } from './recipes.page';

const MAX = 6;
/** what was chosen, kept while the app is open (back from a recipe: as left) */
const chosenKeys = signal<string[]>([]);
/** the ingredients one can choose, read once per session */
let families: Promise<IngredientFamily[]> | null = null;

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .trim();

/**
 * « Que faire avec ce que j'ai ? » (1.11): the ingredients at hand (up to 6), then the recipes that use them, those with
 * all of them first, then those that need the fewest other things (salt, oil, flour and spices never count).
 */
@Component({
  selector: 'app-recipes-with',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, ServingPipe, IconComponent, BackButtonComponent, HealthScoreComponent, ClearableDirective],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.with.title' | t }}</h1>
      </header>
      <p class="lead small muted">{{ 'meals.with.lead' | t }}</p>

      @if (chosen().length) {
        <div class="chosen" role="group" [attr.aria-label]="'meals.with.chosen' | t">
          @for (f of chosen(); track f.key) {
            <button type="button" class="chip-btn on" [attr.aria-label]="'meals.with.unpick' | t: { name: f.label }" (click)="unpick(f.key)">
              {{ f.label }} <app-icon name="x" [size]="14" [stroke]="2.4" />
            </button>
          }
        </div>
      }

      @if (chosen().length < max) {
        <label class="search">
          <app-icon name="search" [size]="20" />
          <input type="search" class="input" [value]="term()" (input)="term.set($any($event.target).value)" enterkeyhint="search"
            autocomplete="off" autocorrect="off" spellcheck="false"
            [placeholder]="'meals.with.placeholder' | t" [attr.aria-label]="'meals.with.search' | t" />
        </label>
        <div class="suggestions">
          @if (!term().trim()) {
            <span class="tiny muted hint">{{ 'meals.with.common' | t }}</span>
          }
          @for (f of suggestions(); track f.key) {
            <button type="button" class="chip-btn" (click)="pick(f.key)">{{ f.label }}</button>
          } @empty {
            @if (term().trim() && all()) {
              <span class="small muted">{{ 'meals.with.noIngredient' | t: { q: term().trim() } }}</span>
            }
          }
        </div>
      } @else {
        <p class="tiny muted">{{ 'meals.with.max' | t: { n: max } }}</p>
      }

      @if (chosen().length) {
        @if (found(); as list) {
          <h2 class="section-title">{{ (list.length === 1 ? 'meals.with.countOne' : 'meals.with.count') | t: { n: list.length } }}</h2>
          @if (list.length) {
            <div class="list" [class.stale]="loading()">
              @for (f of list; track f.recipe.id) {
                <a class="list-item found" [routerLink]="['/app/meals/recipes', f.recipe.id]">
                  <span class="pic">
                    @if (f.recipe.thumbUrl) {
                      <img [src]="f.recipe.thumbUrl" alt="" loading="lazy" />
                    } @else {
                      <span aria-hidden="true">{{ emoji[f.recipe.type] }}</span>
                    }
                  </span>
                  <span class="list-body">
                    <span class="list-title">{{ f.recipe.name }}</span>
                    <span class="list-sub have" [class.all]="f.have === chosen().length">
                      {{ (f.have === chosen().length ? 'meals.with.haveAll' : 'meals.with.have') | t: { n: f.have, total: chosen().length } }}
                    </span>
                    <span class="list-sub wrap">
                      @if (f.missing === 0) {
                        {{ 'meals.with.nothingElse' | t }}
                      } @else {
                        {{ 'meals.with.missing' | t: { list: missingText(f) } }}
                      }
                    </span>
                    <span class="list-sub">{{ f.recipe | serving }}</span>
                  </span>
                  @if (f.recipe.health) {
                    <app-health-score [score]="f.recipe.health.score" />
                  }
                </a>
              }
            </div>
            <p class="tiny muted center">{{ 'meals.with.pantry' | t }}</p>
          } @else {
            <div class="empty">
              <span class="empty-icon"><app-icon name="basket" /></span>
              <p class="small">{{ 'meals.with.none' | t }}</p>
            </div>
          }
        } @else {
          <div class="skeleton" style="height: 220px; border-radius: 24px"></div>
        }
      } @else {
        <div class="empty">
          <span class="empty-icon"><app-icon name="basket" /></span>
          <p class="small">{{ 'meals.with.start' | t }}</p>
        </div>
      }
    </main>
  `,
  styles: `
    .lead {
      margin-top: calc(-1 * var(--space-2));
    }
    .search {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--line);
      color: var(--fg-3);
    }
    .search:focus-within {
      border-color: var(--accent);
    }
    .search .input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      padding-inline: 0;
      box-shadow: none;
    }
    .chosen,
    .suggestions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .hint {
      width: 100%;
    }
    .chip-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 14px;
      border-radius: var(--radius-pill);
      background: var(--surface-2);
      border: 1px solid var(--line);
      font-size: var(--fs-s);
      font-weight: 600;
      transition:
        transform var(--dur-1) var(--ease-out),
        background-color var(--dur-2);
    }
    .chip-btn.is-pressed {
      transform: scale(0.95);
    }
    .chip-btn.on {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--accent-ink);
    }
    .found {
      align-items: flex-start;
    }
    .pic {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      flex: none;
      border-radius: 16px;
      overflow: hidden;
      background: var(--accent-soft);
      font-size: 1.8rem;
    }
    .pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    /* the name, what it has and what it misses, whole */
    .found .list-title,
    .found .list-sub {
      white-space: normal;
    }
    .have {
      font-weight: 650;
      color: var(--fg);
    }
    .have.all {
      color: var(--success);
    }
    .stale {
      opacity: 0.6;
      transition: opacity var(--dur-2);
    }
    .center {
      text-align: center;
    }
  `,
})
export class RecipesWithPage {
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly emoji = TYPE_EMOJI;
  protected readonly max = MAX;
  protected readonly term = signal('');
  protected readonly all = signal<IngredientFamily[] | null>(null);
  protected readonly found = signal<FoundRecipe[] | null>(null);
  protected readonly loading = signal(false);
  private seq = 0;

  protected readonly chosen = computed(() => {
    const byKey = new Map((this.all() ?? []).map((f) => [f.key, f]));
    return chosenKeys()
      .map((k) => byKey.get(k))
      .filter((f): f is IngredientFamily => !!f);
  });

  /** the most used ones, or those matching what is typed (the start of a word first) */
  protected readonly suggestions = computed(() => {
    const picked = new Set(chosenKeys());
    const list = (this.all() ?? []).filter((f) => !picked.has(f.key));
    const q = plain(this.term());
    if (!q) return list.slice(0, 16);
    const starts = list.filter((f) => plain(f.label).split(/[\s'-]+/).some((w) => w.startsWith(q)));
    const contains = list.filter((f) => !starts.includes(f) && plain(f.label).includes(q));
    return [...starts, ...contains].slice(0, 16);
  });

  constructor() {
    families ??= this.api.ingredientFamilies();
    families
      .then((f) => {
        this.all.set(f);
        if (chosenKeys().length) void this.search();
      })
      .catch((e) => {
        families = null;
        this.toast.error(this.i18n.error(errorCode(e)));
      });
  }

  protected pick(key: string): void {
    if (chosenKeys().length >= MAX || chosenKeys().includes(key)) return;
    chosenKeys.update((k) => [...k, key]);
    this.term.set('');
    void this.search();
  }

  protected unpick(key: string): void {
    chosenKeys.update((k) => k.filter((x) => x !== key));
    void this.search();
  }

  protected missingText(f: FoundRecipe): string {
    const more = f.missing - f.missingLabels.length;
    const names = f.missingLabels.map((l) => l.toLowerCase()).join(', ');
    return more > 0 ? `${names} ${this.i18n.t('meals.with.andMore', { n: more })}` : names;
  }

  private async search(): Promise<void> {
    const keys = chosenKeys();
    const seq = ++this.seq;
    if (!keys.length) {
      this.found.set(null);
      return;
    }
    this.loading.set(true);
    try {
      const list = await this.api.recipesWith(keys);
      if (seq === this.seq) this.found.set(list);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      if (seq === this.seq) this.loading.set(false);
    }
  }
}
