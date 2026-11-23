import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Recipe, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { MealsStore, scaled, slotNow } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { MicrosListComponent } from './micros-list.component';
import { ReportSheetComponent } from '../../shared/report-sheet.component';
import { FavoritesStore } from '../../core/meals/favorites.store';
import { HapticDirective } from '../../core/ui/haptics';
import { QuantitySheetComponent } from './quantity-sheet.component';
import { SendRecipeSheetComponent } from './send-recipe-sheet.component';
import { PlanWhenSheetComponent } from './plan-when-sheet.component';
import { PlanStore } from '../../core/meals/plan.store';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { ShoppingStore } from '../../core/meals/shopping.store';
import { closeSheet } from '../../core/ui/sheets';
import { TYPE_EMOJI } from './recipes.page';
import { SessionStore } from '../../core/auth/session.store';

/** A recipe: its picture, nutrients per serving, ingredients, votes, and what can be done with it. */
@Component({
  selector: 'app-recipe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent, HealthScoreComponent, QuantitySheetComponent, ReportSheetComponent, HapticDirective, NumberStepperComponent, MicrosListComponent, SendRecipeSheetComponent, PlanWhenSheetComponent],
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
            <!-- 1.11: a free photo of Wikimedia Commons, credited as its licence asks -->
            @if (r.imageSource) {
              <figcaption class="credit">
                <a [href]="r.imageSource" target="_blank" rel="noopener noreferrer nofollow">
                  {{ 'meals.recipe.photoCredit' | t: { author: r.imageCredit || 'Wikimedia Commons', license: r.imageLicense ?? '' } }}
                </a>
              </figcaption>
            }
          } @else {
            <span class="emoji" aria-hidden="true">{{ emoji[r.type] }}</span>
          }
        </figure>
        <div class="meta">
          @for (t of r.types?.length ? r.types : [r.type]; track t) {
            <span class="chip">{{ emoji[t] }} {{ 'meals.recipe.types.' + t | t }}</span>
          }
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

        <!-- imported: everyone sees what it is based on, and can open the original -->
        @if (r.sourceUrl && r.sourceName) {
          <a class="source card" [href]="r.sourceUrl" target="_blank" rel="noopener noreferrer nofollow">
            <span class="source-ico"><app-icon name="link" [size]="18" /></span>
            <span class="source-body">
              <b>{{ 'meals.recipe.source.title' | t: { site: r.sourceName } }}</b>
              <span class="source-url small">{{ shortUrl(r.sourceUrl) }}</span>
              <span class="tiny muted">{{ (r.manualNutrition ? 'meals.recipe.source.byHand' : 'meals.recipe.source.computed') | t }}</span>
            </span>
            <app-icon name="arrowRight" [size]="18" />
          </a>
        }

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
            @if (r.health) {
              <app-health-score [score]="r.health.score" size="full" />
            }
          </div>
          @if (r.health && (r.health.pros.length || r.health.cons.length)) {
            <ul class="reasons" role="list">
              @for (p of r.health.pros; track p) {
                <li class="pro"><app-icon name="check" [size]="13" [stroke]="3" /> {{ 'meals.health.pros.' + p | t }}</li>
              }
              @for (c of r.health.cons; track c) {
                <li class="con"><app-icon name="minus" [size]="13" [stroke]="3" /> {{ 'meals.health.cons.' + c | t }}</li>
              }
            </ul>
          }
          <div class="kcal num">{{ i18n.number(r.perServing.kcal) }} <small>kcal</small></div>
          <!-- 1.18: how big a part is -->
          @if (r.plateG) {
            <p class="plate small"><app-icon name="weight" [size]="15" /> <span>{{ 'meals.serving.plate' | t: { g: i18n.number(r.plateG), n: r.servings } }}</span></p>
            <p class="tiny muted plate-how">{{ 'meals.serving.how' | t }}</p>
          } @else if (r.servings > 1) {
            <p class="plate small"><app-icon name="weight" [size]="15" /> <span>{{ 'meals.serving.shareLong' | t: { n: r.servings } }}</span></p>
          }
          <dl>
            <div><dt>{{ 'meals.protein' | t }}</dt><dd class="num">{{ g(r.perServing.proteinG) }}</dd></div>
            <div><dt>{{ 'meals.carbs' | t }}</dt><dd class="num">{{ g(r.perServing.carbsG) }}</dd></div>
            <div><dt>{{ 'meals.fat' | t }}</dt><dd class="num">{{ g(r.perServing.fatG) }}</dd></div>
            <div><dt>{{ 'meals.fiber' | t }}</dt><dd class="num">{{ g(r.perServing.fiberG) }}</dd></div>
          </dl>
        </section>

        <!-- 1.14: the vitamins and minerals of a serving, all those known, against the reference of a day -->
        @if (hasMicros(r)) {
          <h2 class="section-title">{{ 'meals.micros.perServing' | t }}</h2>
          <section class="card micros-card">
            <app-micros-list [micros]="r.micros" />
            <p class="tiny muted">{{ 'meals.micros.perServingNote' | t }}</p>
          </section>
        }

        <div class="main-actions">
          <button type="button" class="btn btn-primary grow" (click)="openAdd(r)"><app-icon [name]="planDay() ? 'calendar' : 'plus'" /> {{ addLabel() }}</button>
          <!-- 1.20: planned for a day of the next two weeks (« Mon planning ») -->
          @if (!planDay()) {
            <button type="button" class="btn btn-secondary fav" [attr.aria-label]="'plan.planShort' | t" (click)="planSheet().open(r, planSlot(r))">
              <app-icon name="calendar" />
            </button>
          }
          <span class="haptic">
            <button type="button" class="btn btn-secondary fav" [class.on]="favorite()" [attr.aria-pressed]="favorite()"
              [attr.aria-label]="(favorite() ? 'meals.favorites.remove' : 'meals.favorites.add') | t" (click)="toggleFavorite(r)">
              <app-icon name="heart" />
            </button><input appHaptic="success" />
          </span>
        </div>

        <!-- 1.9: shown to the friends in one tap, without opening the editor -->
        @if (r.mine && r.visibility !== 'PUBLIC') {
          <section class="card share" [class.on]="r.visibility === 'FRIENDS'">
            <span class="share-ico"><app-icon name="users" /></span>
            <div class="share-copy">
              <b class="small">{{ (r.visibility === 'FRIENDS' ? 'meals.recipe.shareFriends.on' : 'meals.recipe.shareFriends.title') | t }}</b>
              <span class="tiny muted">{{ (r.visibility === 'FRIENDS' ? 'meals.recipe.shareFriends.onHint' : 'meals.recipe.shareFriends.hint') | t }}</span>
            </div>
            @if (r.visibility === 'FRIENDS') {
              <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="setShared(r, false)">{{ 'meals.recipe.shareFriends.stop' | t }}</button>
            } @else {
              <button type="button" class="btn btn-primary btn-s" [disabled]="busy()" (click)="setShared(r, true)"><app-icon name="share" [size]="16" /> {{ 'meals.recipe.shareFriends.cta' | t }}</button>
            }
          </section>
        }
        <!-- 1.19: to a friend of the app (a notification that opens it in their app), or by message -->
        @if (r.visibility !== 'PRIVATE' && !r.hidden) {
          <button type="button" class="btn btn-ghost btn-block send" (click)="sendSheet().open(r)"><app-icon name="send" [size]="18" /> {{ 'meals.recipe.shareFriends.send' | t }}</button>
        }

        <h2 class="section-title">{{ 'meals.recipe.ingredients' | t }} · {{ 'meals.servings' | t: { n: r.servings } }}</h2>
        <ul class="ingredients card" role="list">
          @for (ing of r.ingredients ?? []; track $index) {
            <!-- 1.14: its score out of 10, its name on as many lines as it needs, the amount and the calories in their own column -->
            <li class="ing">
              @if (ing.health != null) {
                <app-health-score class="ing-score" [score]="ing.health" />
              } @else {
                <span class="ing-score none" aria-hidden="true"></span>
              }
              <span class="ing-name">{{ ing.name }}</span>
              <span class="ing-amount num"><b>{{ i18n.number(ing.grams) }} g</b><small class="muted">{{ ing.kcal }} kcal</small></span>
            </li>
          }
          @for (line of r.ingredientLines ?? []; track $index) {
            <li><span>{{ line }}</span></li>
          }
        </ul>
        <!-- 1.11: its ingredients on the shopping list, for as many as wanted -->
        <button type="button" class="btn btn-secondary btn-block" (click)="openPortions(r, 'shop')"><app-icon name="cart" [size]="18" /> {{ 'shopping.addRecipe' | t }}</button>
        @if (r.notes) {
          <h2 class="section-title">{{ 'meals.recipe.notes' | t }}</h2>
          <p class="notes card">{{ r.notes }}</p>
          <!-- 1.19: the steps one by one, the screen kept on, the timers in one tap -->
          <!-- 1.20.5: how many portions first, the amounts of each step follow -->
          <button type="button" class="btn btn-secondary btn-block" (click)="openPortions(r, 'cook')"><app-icon name="play" [size]="18" /> {{ 'cook.open' | t }}</button>
        }

        <div class="actions">
          @if (r.mine) {
            <a class="btn btn-secondary" [routerLink]="['/app/meals/recipes', r.id, 'edit']"><app-icon name="pencil" /> {{ 'meals.recipe.edit' | t }}</a>
            <button type="button" class="btn btn-ghost danger" (click)="confirm.showModal()"><app-icon name="trash" /> {{ 'meals.recipe.deleteShort' | t }}</button>
          } @else {
            <!-- 1.14: an admin changes a community recipe in the same editor -->
            @if (isAdmin() && r.visibility === 'PUBLIC') {
              <a class="btn btn-secondary wide" [routerLink]="['/app/meals/recipes', r.id, 'edit']"><app-icon name="pencil" /> {{ 'meals.recipe.editCommunity' | t }}</a>
            }
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
      <!-- 1.20.5: how many portions, before cooking or the shopping list -->
      <dialog class="sheet" #shopSheet [attr.aria-label]="(portionsFor() === 'cook' ? 'cook.open' : 'shopping.addRecipe') | t">
        <div class="sheet-grip"></div>
        <div class="stack">
          <div>
            <h2 class="h3">{{ (portionsFor() === 'cook' ? 'cook.open' : 'shopping.addRecipe') | t }}</h2>
            <p class="small muted">{{ (portionsFor() === 'cook' ? 'cook.cookText' : 'shopping.addRecipeText') | t }}</p>
          </div>
          <p class="question">{{ 'cook.question' | t }}</p>
          <app-number-stepper [(value)]="shopServings" [step]="1" [min]="1" [max]="50" [decimals]="0" [label]="'cook.portions' | t" />
          @if (recipe(); as r) {
            <p class="tiny muted base">{{ 'cook.base' | t: { n: ('meals.servings' | t: { n: r.servings }) } }}</p>
          }
          @if (portionsFor() === 'cook') {
            <button type="button" class="btn btn-primary btn-block" (click)="cook()"><app-icon name="play" /> {{ 'cook.start' | t }}</button>
          } @else {
            <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="addToShopping()"><app-icon name="cart" /> {{ 'shopping.addConfirm' | t }}</button>
          }
        </div>
      </dialog>
      <app-quantity-sheet (confirm)="add($event)" />
      <app-send-recipe-sheet />
      <app-plan-when-sheet />
      <app-report-sheet />
    </main>
  `,
  styles: `
    /* 1.20.5: how many portions */
    .question {
      margin: 0;
      font-weight: 650;
    }
    .base {
      margin: -4px 0 0;
      text-align: center;
    }
    .micros-card {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .micros-card p {
      margin: 0;
    }
    /* 1.13: what makes the dish good, what costs it points */
    .reasons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0 0 var(--space-2);
      padding: 0;
      list-style: none;
    }
    .reasons li {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px 4px 7px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 650;
    }
    .reasons .pro {
      background: color-mix(in srgb, var(--success, #1f9d55) 13%, transparent);
      color: color-mix(in srgb, var(--success, #1f9d55) 55%, var(--fg));
    }
    .reasons .con {
      background: color-mix(in srgb, #e2711d 13%, transparent);
      color: color-mix(in srgb, #e2711d 50%, var(--fg));
    }
    .hero {
      position: relative;
      margin: 0;
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: var(--accent-soft);
      animation: zoom-in 380ms var(--ease-out);
    }
    /* the frame sets the size, never the photo (a tall one would stretch it on Safari) */
    .hero img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .emoji {
      font-size: 4.5rem;
    }
    .credit {
      position: absolute;
      right: 8px;
      bottom: 8px;
      max-width: calc(100% - 16px);
    }
    .credit a {
      display: block;
      padding: 4px 9px;
      border-radius: var(--radius-pill);
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .vote.is-pressed {
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
    /* 1.18: how big a part is, and how it is estimated */
    .plate {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: -6px 0 0;
      font-weight: 650;
      color: var(--fg-2);
    }
    .plate-how {
      margin: -8px 0 0;
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
    .source {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      color: inherit;
      text-decoration: none;
    }
    .source-ico {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex: none;
      border-radius: 12px;
      background: var(--cool-soft);
      color: var(--cool);
    }
    .source-body {
      display: grid;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .source-url {
      overflow: hidden;
      color: var(--accent-text);
      font-weight: 650;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .ingredients li.ing {
      display: grid;
      /* the score column keeps one width (« 10/10 » or « 6,5/10 »): the names line up */
      grid-template-columns: 3.7rem minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-3);
    }
    .ing-score {
      justify-self: start;
    }
    .ing-score.none {
      display: block;
    }
    .ing-name {
      overflow-wrap: anywhere;
      line-height: 1.3;
    }
    .ing-amount {
      display: grid;
      justify-items: end;
      gap: 1px;
      white-space: nowrap;
      text-align: right;
    }
    .ing-amount b {
      font-weight: 650;
    }
    .ing-amount small {
      font-size: 12px;
    }
    .notes {
      padding: var(--space-4);
      white-space: pre-line;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }
    .actions .btn {
      min-width: 0;
    }
    .main-actions {
      display: flex;
      gap: var(--space-2);
    }
    .main-actions .grow {
      flex: 1;
      min-width: 0;
    }
    .fav {
      width: 52px;
      padding: 0;
      color: var(--fg-2);
    }
    .fav.on {
      color: #e5484d;
    }
    .fav.on ::ng-deep svg {
      fill: currentColor;
      animation: heart 420ms var(--ease-out);
    }
    @keyframes heart {
      40% {
        transform: scale(1.3);
      }
    }
    .share {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: var(--space-2) var(--space-3);
      padding: var(--space-3) var(--space-4);
      transition: border-color var(--dur-2);
    }
    .share .btn {
      grid-column: 1 / -1;
      justify-self: stretch;
    }
    .share.on {
      border-color: color-mix(in srgb, var(--cool) 40%, var(--line));
    }
    .share-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: var(--cool-soft);
      color: var(--cool);
    }
    .share-copy {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .send {
      margin-top: calc(var(--space-2) * -1);
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
  /** opened from « Ajouter au déjeuner »: the recipe goes to that meal (else the one of the hour, today) */
  readonly slotParam = input<string | undefined>(undefined, { alias: 'slot' });
  readonly dayParam = input<string | undefined>(undefined, { alias: 'day' });
  /** 1.20: opened from « Mon planning » (through the recipes): the recipe is planned for that day, not noted */
  readonly planParam = input<string | undefined>(undefined, { alias: 'plan' });
  protected readonly planDay = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(this.planParam() ?? '') ? this.planParam()! : null));
  protected readonly planSheet = viewChild.required(PlanWhenSheetComponent);
  private readonly plans = inject(PlanStore);
  private readonly slot = computed<Slot>(() =>
    (['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as string[]).includes(this.slotParam() ?? '') ? (this.slotParam() as Slot) : slotNow(),
  );
  private readonly day = computed(() => (this.dayParam() && /^\d{4}-\d{2}-\d{2}$/.test(this.dayParam()!) ? this.dayParam()! : localDay()));
  private readonly api = inject(MealsApi);
  protected readonly isAdmin = inject(SessionStore).isAdmin;

  protected hasMicros(r: Recipe): boolean {
    return !!r.micros && Object.keys(r.micros).length > 0;
  }
  private readonly meals = inject(MealsStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);
  /** « Ajouter au déjeuner » when opened from that meal, « Ajouter à un repas » otherwise */
  protected readonly addLabel = computed(() => {
    const plan = this.planDay();
    if (plan) {
      const day = this.i18n.date(plan, { weekday: 'long', day: 'numeric' });
      return this.i18n.t('plan.planFor', { day, slot: this.i18n.t('meals.slots.' + this.slot()).toLowerCase() });
    }
    if (!this.slotParam()) return this.i18n.t('meals.recipe.addToMeal');
    const to = this.i18n.t('meals.addTo.' + this.slot());
    return this.i18n.t('meals.estimate.add', { slot: to.charAt(0).toLowerCase() + to.slice(1) });
  });
  private readonly sheet = viewChild.required(QuantitySheetComponent);
  protected readonly reportSheet = viewChild.required(ReportSheetComponent);
  private readonly confirmDialog = viewChild<ElementRef<HTMLDialogElement>>('confirm');

  protected readonly emoji = TYPE_EMOJI;
  private readonly favorites = inject(FavoritesStore);
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  protected readonly recipe = signal<Recipe | null>(null);
  protected readonly favorite = computed(() => this.favorites.isRecipe(this.recipe()?.id));

  // ── 1.11: the ingredients on the shopping list ──────────────────────────
  private readonly shopSheet = viewChild.required<ElementRef<HTMLDialogElement>>('shopSheet');
  private readonly shopping = inject(ShoppingStore);
  protected readonly shopServings = signal(2);
  /** 1.20.5: what the portions are asked for */
  protected readonly portionsFor = signal<'shop' | 'cook'>('shop');

  protected openPortions(r: Recipe, what: 'shop' | 'cook'): void {
    this.portionsFor.set(what);
    this.shopServings.set(r.servings);
    this.shopSheet().nativeElement.showModal();
  }

  /** 1.20.5: the steps one by one, the amounts for the portions chosen */
  protected cook(): void {
    const r = this.recipe();
    if (!r) return;
    this.shopSheet().nativeElement.close();
    void this.router.navigate(['/app/meals/recipes', r.id, 'cook'], { queryParams: { portions: this.shopServings() } });
  }

  protected async addToShopping(): Promise<void> {
    const r = this.recipe();
    if (!r) return;
    this.busy.set(true);
    try {
      this.shopping.set(await this.api.addRecipeToShopping(r.id, this.shopServings()));
      closeSheet(this.shopSheet().nativeElement);
      this.toast.show(this.i18n.t('shopping.added'), 'info', 4200, {
        label: this.i18n.t('shopping.see'),
        run: () => void this.router.navigate(['/app/meals/shopping']),
      });
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleFavorite(r: Recipe): Promise<void> {
    try {
      const on = await this.favorites.toggleRecipe(r);
      this.toast.show(this.i18n.t(on ? 'meals.favorites.added' : 'meals.favorites.removed', { name: r.name }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  /** shown to my friends (they are told the first time), or back to me only */
  protected async setShared(r: Recipe, on: boolean): Promise<void> {
    this.busy.set(true);
    try {
      this.recipe.set(await this.api.setVisibility(r.id, on ? 'FRIENDS' : 'PRIVATE'));
      this.toast.show(this.i18n.t(on ? 'meals.recipe.shareFriends.done' : 'meals.recipe.shareFriends.stopped'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected readonly sendSheet = viewChild.required(SendRecipeSheetComponent);
  protected readonly missing = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    void this.favorites.ensure();
    effect(() => {
      const id = this.id();
      this.api
        .recipe(id)
        .then((r) => this.recipe.set(r))
        .catch(() => this.missing.set(true));
    });
  }

  /** « les-creations-de-yona.fr/recettes/…/bruschetta »: the address without its scheme */
  protected shortUrl(url: string): string {
    return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
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

  /** 1.20: the meal a recipe is planned for at first: the one asked, else its type's (a breakfast, a lunch…), else the dinner */
  protected planSlot(r: Recipe): Slot {
    if (this.slotParam()) return this.slot();
    return r.type === 'BREAKFAST' || r.type === 'LUNCH' || r.type === 'SNACK' ? r.type : r.type === 'DESSERT' || r.type === 'DRINK' || r.type === 'TREAT' ? 'SNACK' : 'DINNER';
  }

  protected openAdd(r: Recipe): void {
    const slot: Slot = this.slot();
    this.sheet().open(
      { name: r.name, detail: this.i18n.t('meals.addTo.' + slot), unit: 'serving', base: r.perServing, recipe: r },
      this.slotParam() || this.planDay() ? this.addLabel() : this.i18n.t('meals.addTo.' + slot),
    );
  }

  protected async add(servings: number): Promise<void> {
    const r = this.recipe();
    if (!r) return;
    this.sheet().busy.set(true);
    const plan = this.planDay();
    if (plan) {
      // 1.20: planned, then back to the plan (past the recipes)
      try {
        await this.plans.add({ day: plan, slot: this.slot(), recipeId: r.id, servings });
        this.sheet().close();
        this.toast.show(this.i18n.t('plan.planned', { name: r.name, day: this.addLabel().replace(/^[^ ]+ [^ ]+ /, '') }));
        this.stack.backTo('/app/meals/plan');
      } catch (e) {
        this.sheet().busy.set(false);
        this.toast.error(this.i18n.error(errorCode(e)));
      }
      return;
    }
    try {
      await this.meals.add({ day: this.day(), slot: this.slot(), recipeId: r.id, servings }, { name: r.name, nutrients: scaled(r.perServing, servings) });
      this.sheet().close();
      this.toast.show(this.i18n.t(this.meals.lastQueued() ? 'offline.queued' : 'meals.search.added', { name: r.name }));
      // added: the recipe is done with, back to the meals (past Recettes and « Ajouter un repas »)
      this.meals.day.set(this.day());
      this.stack.backTo('/app/meals');
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
