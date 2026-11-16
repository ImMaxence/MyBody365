import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Recipe, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { MealsStore, slotNow } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { NutriscoreComponent } from '../../shared/nutriscore.component';
import { ReportSheetComponent } from '../../shared/report-sheet.component';
import { QuantitySheetComponent } from './quantity-sheet.component';
import { TYPE_EMOJI } from './recipes.page';

/** A recipe: its picture, nutrients per serving, ingredients, votes, and what can be done with it. */
@Component({
  selector: 'app-recipe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent, NutriscoreComponent, QuantitySheetComponent, ReportSheetComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ recipe()?.name ?? '' }}</h1>
      </header>
      @if (recipe(); as r) {
        <figure class="hero">
          @if (r.imageUrl) {
            <img [src]="r.imageUrl" alt="" />
          } @else {
            <span class="emoji" aria-hidden="true">{{ emoji[r.type] }}</span>
          }
        </figure>
        <div class="meta">
          <span class="chip">{{ emoji[r.type] }} {{ 'meals.recipe.types.' + r.type | t }}</span>
          @if (!r.mine && r.author) {
            <span class="small muted">{{ 'meals.recipe.by' | t: { name: r.author } }}</span>
          }
          @if (r.mine && r.visibility !== 'PRIVATE') {
            <span class="chip chip-cool"><app-icon [name]="r.visibility === 'FRIENDS' ? 'users' : 'globe'" [size]="13" /> {{ 'meals.recipe.visibility.' + r.visibility | t }}</span>
          }
          @if (r.hidden) {
            <span class="chip chip-warning">{{ 'meals.recipe.hidden' | t }}</span>
          }
        </div>

        @if (r.shared && !r.mine) {
          <div class="votes" role="group" [attr.aria-label]="'meals.recipe.score' | t: { n: r.score }">
            <button type="button" class="vote" [class.on]="r.myVote === 1" [attr.aria-pressed]="r.myVote === 1" [attr.aria-label]="'meals.recipe.upvote' | t" (click)="vote(r, 1)">
              <app-icon name="thumbUp" />
            </button>
            <span class="score num">{{ r.score }}</span>
            <button type="button" class="vote" [class.on]="r.myVote === -1" [attr.aria-pressed]="r.myVote === -1" [attr.aria-label]="'meals.recipe.downvote' | t" (click)="vote(r, -1)">
              <app-icon name="thumbDown" />
            </button>
          </div>
        }

        <section class="card facts">
          <div class="facts-head">
            <h2 class="section-title">
              @if (r.manualNutrition) {
                {{ 'meals.recipe.totals' | t }} · {{ 'meals.recipe.mode.byHand' | t }}
              } @else {
                {{ 'meals.recipe.nutrition' | t: { g: i18n.number(r.servingG ?? 0) } }}
              }
            </h2>
            @if (r.nutriscore) {
              <app-nutriscore [grade]="r.nutriscore" [estimated]="true" />
            }
          </div>
          <div class="kcal num">{{ i18n.number(r.perServing.kcal) }} <small>kcal</small></div>
          <dl>
            <div><dt>{{ 'meals.protein' | t }}</dt><dd class="num">{{ g(r.perServing.proteinG) }}</dd></div>
            <div><dt>{{ 'meals.carbs' | t }}</dt><dd class="num">{{ g(r.perServing.carbsG) }}</dd></div>
            <div><dt>{{ 'meals.fat' | t }}</dt><dd class="num">{{ g(r.perServing.fatG) }}</dd></div>
            <div><dt>{{ 'meals.fiber' | t }}</dt><dd class="num">{{ g(r.perServing.fiberG) }}</dd></div>
          </dl>
        </section>

        <button type="button" class="btn btn-primary btn-block" (click)="openAdd(r)"><app-icon name="plus" /> {{ 'meals.recipe.addToMeal' | t }}</button>

        <h2 class="section-title">{{ 'meals.recipe.ingredients' | t }} · {{ 'meals.servings' | t: { n: r.servings } }}</h2>
        <ul class="ingredients card" role="list">
          @for (ing of r.ingredients ?? []; track $index) {
            <li><span>{{ ing.name }}</span><span class="num muted">{{ i18n.number(ing.grams) }} g · {{ ing.kcal }} kcal</span></li>
          }
          @for (line of r.ingredientLines ?? []; track $index) {
            <li><span>{{ line }}</span></li>
          }
        </ul>
        @if (r.sourceUrl && r.sourceName) {
          <a class="source-link small" [href]="r.sourceUrl" target="_blank" rel="noopener noreferrer nofollow">
            <app-icon name="link" [size]="15" /> {{ 'meals.recipe.import.from' | t: { site: r.sourceName } }}
          </a>
        }
        @if (r.notes) {
          <h2 class="section-title">{{ 'meals.recipe.notes' | t }}</h2>
          <p class="notes card">{{ r.notes }}</p>
        }

        <div class="actions">
          @if (r.mine) {
            <a class="btn btn-secondary" [routerLink]="['/app/meals/recipes', r.id, 'edit']"><app-icon name="pencil" /> {{ 'meals.recipe.edit' | t }}</a>
            <button type="button" class="btn btn-ghost danger" (click)="confirm.showModal()"><app-icon name="trash" /> {{ 'meals.recipe.delete' | t }}</button>
          } @else {
            <button type="button" class="btn btn-secondary wide" [disabled]="busy()" (click)="copy(r)"><app-icon name="copy" /> {{ 'meals.recipe.copy' | t }}</button>
            <button type="button" class="btn btn-ghost wide report" (click)="reportSheet().open('RECIPE', r.id)"><app-icon name="flag" [size]="18" /> {{ 'friends.report.title' | t }}</button>
          }
        </div>

        <dialog class="sheet" #confirm>
          <div class="sheet-grip"></div>
          <div class="stack">
            <p>{{ 'meals.recipe.deleteConfirm' | t }}</p>
            <button type="button" class="btn btn-danger btn-block" [disabled]="busy()" (click)="remove(r)"><app-icon name="trash" /> {{ 'meals.recipe.delete' | t }}</button>
            <button type="button" class="btn btn-ghost btn-block" (click)="confirm.close()">{{ 'common.cancel' | t }}</button>
          </div>
        </dialog>

      } @else if (missing()) {
        <div class="empty"><span class="empty-icon"><app-icon name="book" /></span><p>{{ 'errors.not_found' | t }}</p></div>
      } @else {
        <div class="hero skeleton"></div>
      }
      <app-quantity-sheet (confirm)="add($event)" />
      <app-report-sheet />
    </main>
  `,
  styles: `
    .hero {
      margin: 0;
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: var(--accent-soft);
      animation: zoom-in 380ms var(--ease-out);
    }
    .hero img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .emoji {
      font-size: 4.5rem;
    }
    @keyframes zoom-in {
      from {
        opacity: 0;
        transform: scale(0.96);
      }
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .votes {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-4);
    }
    .vote {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--surface-3);
      color: var(--fg-2);
      transition: background-color var(--dur-2), color var(--dur-2), transform var(--dur-2) var(--ease-out);
    }
    .vote:active {
      transform: scale(0.9);
    }
    .vote.on {
      background: var(--accent);
      color: var(--accent-ink);
    }
    .score {
      min-width: 3ch;
      text-align: center;
      font-weight: 850;
      font-size: 1.4rem;
    }
    .facts {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
    }
    .facts-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .facts-head .section-title {
      margin: 0;
    }
    .kcal {
      font-weight: 850;
      font-size: 2rem;
      letter-spacing: -0.02em;
    }
    .kcal small {
      font-size: 1rem;
      color: var(--fg-2);
    }
    dl {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin: 0;
    }
    dl div {
      display: grid;
      gap: 2px;
    }
    dt {
      font-size: var(--fs-xs);
      color: var(--fg-2);
      font-weight: 600;
    }
    dd {
      margin: 0;
      font-weight: 750;
    }
    .source-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      justify-self: start;
      color: var(--accent-text);
      font-weight: 650;
    }
    .ingredients {
      display: grid;
      margin: 0;
      padding: var(--space-2) var(--space-4);
      list-style: none;
    }
    .ingredients li {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
      padding: 10px 0;
      border-top: 1px solid var(--line);
    }
    .ingredients li:first-child {
      border-top: 0;
    }
    .notes {
      padding: var(--space-4);
      white-space: pre-line;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .actions .wide {
      grid-column: 1 / -1;
    }
    .danger {
      color: var(--danger);
    }
    .report {
      color: var(--fg-2);
    }
  `,
})
export class RecipePage {
  readonly id = input.required<string>();
  private readonly api = inject(MealsApi);
  private readonly meals = inject(MealsStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);
  private readonly sheet = viewChild.required(QuantitySheetComponent);
  protected readonly reportSheet = viewChild.required(ReportSheetComponent);
  private readonly confirmDialog = viewChild<ElementRef<HTMLDialogElement>>('confirm');

  protected readonly emoji = TYPE_EMOJI;
  protected readonly recipe = signal<Recipe | null>(null);
  protected readonly missing = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const id = this.id();
      this.api
        .recipe(id)
        .then((r) => this.recipe.set(r))
        .catch(() => this.missing.set(true));
    });
  }

  protected g(v?: number): string {
    return v == null ? '–' : `${this.i18n.number(v, v < 10 ? 1 : 0)} g`;
  }

  protected async vote(r: Recipe, value: 1 | -1): Promise<void> {
    try {
      this.recipe.set(await this.api.vote(r.id, r.myVote === value ? 0 : value));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected openAdd(r: Recipe): void {
    const slot: Slot = slotNow();
    this.sheet().open(
      { name: r.name, detail: this.i18n.t('meals.addTo.' + slot), unit: 'serving', base: r.perServing, nutriscore: r.nutriscore, estimated: true },
      this.i18n.t('meals.addTo.' + slot),
    );
  }

  protected async add(servings: number): Promise<void> {
    const r = this.recipe();
    if (!r) return;
    this.sheet().busy.set(true);
    try {
      await this.meals.add({ day: localDay(), slot: slotNow(), recipeId: r.id, servings });
      this.sheet().close();
      this.toast.show(this.i18n.t('meals.search.added', { name: r.name }));
    } catch (e) {
      this.sheet().busy.set(false);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async copy(r: Recipe): Promise<void> {
    this.busy.set(true);
    try {
      const copy = await this.api.copyRecipe(r.id);
      this.toast.show(this.i18n.t('meals.recipe.copiedToast'));
      await this.router.navigate(['/app/meals/recipes', copy.id], { replaceUrl: true });
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(r: Recipe): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.deleteRecipe(r.id);
      this.confirmDialog()?.nativeElement.close();
      this.toast.show(this.i18n.t('meals.recipe.deleted'));
      this.stack.back('/app/meals/recipes');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
