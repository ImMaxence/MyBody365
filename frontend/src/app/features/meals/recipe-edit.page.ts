import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Lookalike, Nutrients, RecipeDraft, RecipeType, RecipeVisibility } from '../../core/api/models';
import { closeSheet } from '../../core/ui/sheets';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SessionStore } from '../../core/auth/session.store';
import { MealsApi } from '../../core/meals/meals-api';
import { scaled } from '../../core/meals/meals.store';
import { isFruitVeg, recipeGrade } from '../../core/meals/nutriscore';
import { NutriscoreComponent } from '../../shared/nutriscore.component';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { prepareImage } from '../../core/photos/image-tools';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { FoodPickerComponent, Picked } from './food-picker.component';
import { RecipeImportSheetComponent, firstLink } from './recipe-import-sheet.component';
import { RECIPE_TYPES, TYPE_EMOJI } from './recipes.page';
import { SegDirective } from '../../shared/seg.directive';

const VISIBILITY_ICON: Record<RecipeVisibility, string> = { PRIVATE: 'lock', FRIENDS: 'users', PUBLIC: 'globe' };

/** a new recipe left for a moment (to open one that looks like it): found again on coming back */
interface Parked {
  name: string;
  notes: string;
  picked: RecipeType[];
  servings: number;
  visibility: RecipeVisibility;
  mode: 'computed' | 'manual';
  lines: Line[];
  unmatched: string[];
  ingredientText: string;
  kcal: string;
  macros: Record<'proteinG' | 'carbsG' | 'fatG', string>;
  source: { url: string; name: string } | null;
  image: Blob | null;
}
let parked: Parked | null = null;

interface Line {
  foodId: string;
  name: string;
  grams: number;
  /** per 100 g, for the live totals and the Nutri-Score */
  per100: Nutrients;
  /** a fruit, a vegetable or a legume: its share lifts the Nutri-Score */
  fruitVeg?: boolean;
  /** the line as the imported recipe wrote it, to check the food found for it */
  from?: string;
}

/**
 * A recipe of one's own: name, type, servings, picture, ingredients with their weights (calories computed)
 * or as written with the calories entered by hand (an imported recipe), method, who sees it.
 */
@Component({
  selector: 'app-recipe-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RecipeImportSheetComponent, SegDirective, FormsModule, TranslatePipe, IconComponent, BackButtonComponent, NumberStepperComponent, FoodPickerComponent, NutriscoreComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ (id() ? 'meals.recipe.editTitle' : 'meals.recipe.newTitle') | t }}</h1>
      </header>

      @if (!id()) {
        <button type="button" class="card import-cta" (click)="openImport()">
          <span class="import-ico"><app-icon name="link" [size]="20" /></span>
          <span class="import-copy">
            <b>{{ 'meals.recipe.import.cta' | t }}</b>
            <span class="small muted">{{ 'meals.recipe.import.ctaSub' | t }}</span>
          </span>
          <app-icon name="chevronRight" />
        </button>
      }

      <form class="stack" (ngSubmit)="save()">
        @if (source(); as src) {
          <div class="source">
            <app-icon name="link" [size]="16" />
            <span class="small">{{ 'meals.recipe.import.from' | t: { site: src.name } }}</span>
            <button type="button" class="icon-btn mini" [attr.aria-label]="'meals.recipe.import.forget' | t" (click)="source.set(null)"><app-icon name="x" [size]="16" /></button>
          </div>
        }
        <label class="photo" [class.has]="preview()">
          @if (preview()) {
            <img [src]="preview()" alt="" />
          } @else {
            <span class="photo-empty"><app-icon name="camera" [size]="26" /> {{ 'meals.recipe.photoAdd' | t }}</span>
          }
          <input type="file" accept="image/*" (change)="pickImage($event)" [attr.aria-label]="(preview() ? 'meals.recipe.photoChange' : 'meals.recipe.photoAdd') | t" />
        </label>
        @if (preview()) {
          <button type="button" class="btn btn-ghost btn-s remove-photo" (click)="clearImage()"><app-icon name="trash" [size]="16" /> {{ 'meals.recipe.photoRemove' | t }}</button>
        }

        <div class="field">
          <label class="label" for="r-name">{{ 'meals.recipe.name' | t }}</label>
          <input class="input" id="r-name" name="name" required maxlength="120" [(ngModel)]="name" />
        </div>

        <span class="label" id="r-types">{{ 'meals.recipe.type' | t }}</span>
        <div class="types" role="group" aria-labelledby="r-types">
          @for (t of types; track t) {
            <button type="button" class="chip" [class.chip-accent]="picked().includes(t)" [attr.aria-pressed]="picked().includes(t)" (click)="toggleType(t)">
              {{ emoji[t] }} {{ 'meals.recipe.types.' + t | t }}
            </button>
          }
        </div>
        <p class="tiny muted types-hint">{{ 'meals.recipe.typesHint' | t }}</p>

        <span class="label">{{ 'meals.recipe.servingsLabel' | t }}</span>
        <app-number-stepper [(value)]="servings" [step]="1" [min]="1" [max]="50" [decimals]="0" [label]="'meals.recipe.servingsLabel' | t" />

        <h2 class="section-title">{{ 'meals.recipe.ingredients' | t }}</h2>
        <div class="seg" role="radiogroup" [attr.aria-label]="'meals.recipe.mode.title' | t">
          <button type="button" role="radio" [attr.aria-checked]="mode() === 'computed'" (click)="mode.set('computed')"><app-icon name="search" [size]="16" /> {{ 'meals.recipe.mode.computed' | t }}</button>
          <button type="button" role="radio" [attr.aria-checked]="mode() === 'manual'" (click)="mode.set('manual')"><app-icon name="pencil" [size]="16" /> {{ 'meals.recipe.mode.manual' | t }}</button>
        </div>
        @if (mode() === 'manual') {
          <div class="manual">
            <!-- 1.9: by hand, the recipe has no Nutri-Score and half its nutrients: said in red, with the way back -->
            <div class="manual-warn" role="note">
              <app-icon name="alert" [size]="20" />
              <div>
                <p class="small"><b>{{ 'meals.recipe.mode.warnTitle' | t }}</b></p>
                <p class="small">{{ 'meals.recipe.mode.warn' | t }}</p>
                <button type="button" class="btn btn-s warn-btn" (click)="mode.set('computed')"><app-icon name="search" [size]="16" /> {{ 'meals.recipe.mode.useFoods' | t }}</button>
              </div>
            </div>
            <div class="field">
              <label class="label" for="r-lines">{{ 'meals.recipe.mode.lines' | t }}</label>
              <textarea class="textarea" id="r-lines" name="lines" rows="6" maxlength="8000" [placeholder]="'meals.recipe.mode.linesPlaceholder' | t" [(ngModel)]="ingredientText"></textarea>
            </div>
            <div class="kcal-row">
              <div class="field">
                <label class="label" for="r-kcal">{{ 'meals.recipe.mode.kcal' | t }}</label>
                <div class="with-unit"><input class="input" id="r-kcal" name="kcal" type="text" inputmode="decimal" required [(ngModel)]="kcal" /><span>kcal</span></div>
              </div>
            </div>
            <div class="macro-row">
              @for (m of macroFields; track m.key) {
                <div class="field">
                  <label class="label tiny" [for]="'r-' + m.key">{{ m.label | t }}</label>
                  <div class="with-unit"><input class="input" [id]="'r-' + m.key" [name]="m.key" type="text" inputmode="decimal" [(ngModel)]="macros[m.key]" /><span>g</span></div>
                </div>
              }
            </div>
            <p class="tiny muted">{{ 'meals.recipe.mode.hint' | t }}</p>
          </div>
        } @else {
        @if (fromImport()) {
          <p class="small muted import-hint"><app-icon name="info" [size]="16" /> {{ 'meals.recipe.import.checkHint' | t }}</p>
        }
        @if (lines().length) {
          <ul class="lines" role="list">
            @for (l of lines(); track $index; let i = $index) {
              <li class="line">
                <span class="line-name">
                  <span class="line-food">{{ l.name }}</span>
                  @if (l.from) {
                    <small class="line-from">{{ l.from }}</small>
                  }
                  <button type="button" class="line-change" [attr.aria-label]="'meals.recipe.changeFoodOf' | t: { name: l.name }" (click)="changeLine(i)">
                    {{ 'meals.recipe.changeFood' | t }}
                  </button>
                </span>
                <input class="input grams" type="text" inputmode="decimal" [name]="'g' + i" [ngModel]="l.grams" (ngModelChange)="setGrams(i, $event)"
                  [attr.aria-label]="'meals.recipe.ingredientGrams' | t: { name: l.name }" />
                <span class="unit">g</span>
                <button type="button" class="icon-btn" [attr.aria-label]="'meals.recipe.removeIngredient' | t: { name: l.name }" (click)="removeLine(i)"><app-icon name="x" [size]="18" /></button>
              </li>
            }
          </ul>
          <div class="totals-row">
            @if (grade(); as g) {
              <span class="grade">
                <app-nutriscore [grade]="g" [estimated]="true" />
                <span class="tiny muted">{{ 'meals.recipe.gradeHint' | t }}</span>
              </span>
            }
            <p class="totals small"><b class="num">{{ i18n.number(perServing().kcal) }} kcal</b> {{ 'meals.perServing' | t }}</p>
          </div>
        }
        @if (unmatched().length) {
          <div class="unmatched card">
            <p class="small"><b>{{ 'meals.recipe.import.missingTitle' | t: { n: unmatched().length } }}</b><br /><span class="muted">{{ 'meals.recipe.import.missingText' | t }}</span></p>
            <ul role="list">
              @for (u of unmatched(); track u) {
                <li>
                  <span class="small">{{ u }}</span>
                  <button type="button" class="icon-btn mini" [attr.aria-label]="'meals.recipe.import.findIt' | t: { line: u }" (click)="openPicker(u)"><app-icon name="search" [size]="16" /></button>
                  <button type="button" class="icon-btn mini" [attr.aria-label]="'meals.recipe.import.skipIt' | t: { line: u }" (click)="skip(u)"><app-icon name="x" [size]="16" /></button>
                </li>
              }
            </ul>
          </div>
        }
        <button type="button" class="btn btn-secondary" (click)="openPicker()"><app-icon name="plus" /> {{ 'meals.recipe.addIngredient' | t }}</button>
        }

        <div class="field">
          <label class="label" for="r-notes">{{ 'meals.recipe.notes' | t }}</label>
          <textarea class="textarea" id="r-notes" name="notes" rows="5" maxlength="4000" [(ngModel)]="notes"></textarea>
        </div>

        <div class="field">
          <span class="label" id="r-vis">{{ 'meals.recipe.visibility.title' | t }}</span>
          <div class="seg vis" role="radiogroup" aria-labelledby="r-vis">
            @for (v of visibilities(); track v) {
              <button type="button" role="radio" [attr.aria-checked]="visibility() === v" (click)="visibility.set(v)">
                <app-icon [name]="visibilityIcon[v]" [size]="16" /> {{ 'meals.recipe.visibility.' + v | t }}
              </button>
            }
          </div>
          @for (v of [visibility()]; track v) {
            <p class="small muted vis-hint">{{ 'meals.recipe.visibility.' + v + 'Hint' | t }}</p>
          }
        </div>

        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()"><app-icon name="check" /> {{ 'meals.recipe.save' | t }}</button>
      </form>

      <app-recipe-import-sheet (imported)="applyDraft($event)" />

      <dialog class="sheet picker" #picker>
        <div class="sheet-grip"></div>
        <h2 class="h3">{{ 'meals.recipe.pickTitle' | t }}</h2>
        @if (pickerOpen()) {
          <app-food-picker [withExtras]="false" [start]="pickerQuery()" (picked)="addLine($event)" />
        }
      </dialog>

      <!-- 1.10: before a new recipe is created, the ones that look like it (the community's, a friend's, one's own) -->
      <dialog class="sheet looks" #looksDialog [attr.aria-label]="'meals.recipe.lookalike.title' | t">
        <div class="sheet-grip"></div>
        <h2 class="h3">{{ 'meals.recipe.lookalike.title' | t }}</h2>
        <p class="small muted">{{ 'meals.recipe.lookalike.text' | t }}</p>
        <div class="list looks-list">
          @for (l of lookalikes(); track l.recipe.id) {
            <button type="button" class="list-item" (click)="openLookalike(l.recipe.id)">
              <span class="look-pic">
                @if (l.recipe.thumbUrl) {
                  <img [src]="l.recipe.thumbUrl" alt="" />
                } @else {
                  <span aria-hidden="true">{{ emoji[l.recipe.type] }}</span>
                }
              </span>
              <span class="list-body">
                <span class="list-title">{{ l.recipe.name }}</span>
                <span class="list-sub">{{ originOf(l) }} · {{ i18n.number(l.recipe.perServing.kcal) }} kcal {{ 'meals.perServing' | t }}</span>
                @if (l.common) {
                  <span class="list-sub common">{{ (l.common === 1 ? 'meals.recipe.lookalike.commonOne' : 'meals.recipe.lookalike.common') | t: { n: l.common } }}</span>
                }
              </span>
              <app-icon name="chevronRight" />
            </button>
          }
        </div>
        <div class="looks-actions">
          <button type="button" class="btn btn-secondary btn-block" (click)="createAnyway()"><app-icon name="plus" /> {{ 'meals.recipe.lookalike.create' | t }}</button>
          <button type="button" class="btn btn-ghost btn-block" (click)="closeLooks()">{{ 'meals.recipe.lookalike.back' | t }}</button>
        </div>
      </dialog>
    </main>
  `,
  styles: `
    .photo {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 4 / 3;
      border-radius: var(--radius-xl);
      overflow: hidden;
      background: var(--accent-soft);
      border: 2px dashed color-mix(in srgb, var(--accent) 40%, transparent);
      cursor: pointer;
    }
    .photo.has {
      border-style: solid;
      border-color: transparent;
    }
    /* the frame sets the size, never the photo (a tall one would stretch it on Safari) */
    .photo img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .photo-empty {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      color: var(--accent-text);
    }
    .photo input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    .photo:has(input:focus-visible) {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
    .remove-photo {
      justify-self: center;
      margin-top: calc(-1 * var(--space-2));
    }
    .types {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .types .chip {
      cursor: pointer;
    }
    .lines {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 76px auto auto;
      align-items: center;
      gap: 8px;
      padding: 6px 6px 6px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      animation: line-in 260ms var(--ease-out);
    }
    @keyframes line-in {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }
    .line-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .grams {
      min-height: 40px;
      padding: 6px 10px;
      text-align: right;
    }
    .unit {
      color: var(--fg-2);
      font-weight: 600;
    }
    .totals-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .grade {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .totals {
      margin: 0 0 0 auto;
      text-align: right;
      color: var(--fg-2);
    }
    .vis-hint {
      animation: hint-in 260ms var(--ease-out) both;
    }
    @keyframes hint-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
    .share {
      align-items: flex-start;
    }
    .share > span {
      display: grid;
      gap: 2px;
    }
    .import-cta {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      text-align: left;
      color: inherit;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .import-cta:active {
      transform: scale(0.98);
    }
    .import-ico {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      flex: none;
      border-radius: 14px;
      background: var(--cool-soft);
      color: var(--cool);
    }
    .import-copy {
      display: grid;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .source {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 6px 6px 12px;
      border-radius: var(--radius-pill);
      background: var(--cool-soft);
      color: var(--cool);
      font-weight: 650;
      animation: hint-in 300ms var(--ease-out) both;
    }
    .source span {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .icon-btn.mini {
      width: 32px;
      height: 32px;
    }
    .manual {
      display: grid;
      gap: var(--space-3);
      animation: hint-in 300ms var(--ease-out) both;
    }
    .manual-warn {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--danger-soft);
      border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
      color: var(--danger);
    }
    .manual-warn p {
      margin: 0 0 4px;
    }
    .manual-warn app-icon {
      flex: none;
      margin-top: 1px;
    }
    .warn-btn {
      margin-top: 6px;
      background: var(--danger);
      color: #fff;
    }
    .macro-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-2);
    }
    .with-unit {
      position: relative;
    }
    .with-unit .input {
      width: 100%;
      padding-right: 44px;
    }
    .with-unit span {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--fg-2);
      font-weight: 600;
      pointer-events: none;
    }
    /* tall enough to search in, never taller than what the keyboard leaves visible (a min-height wins over the
       sheet's max-height: the search box then went off the top, out of reach) */
    .picker {
      min-height: min(70dvh, calc(var(--vvh, 100dvh) - 12px));
    }
    .line-name {
      display: grid;
      gap: 1px;
      min-width: 0;
      white-space: normal;
    }
    .line-food {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* another food for this line: the search opens with the line's words */
    .line-change {
      justify-self: start;
      padding: 2px 0;
      color: var(--accent-text);
      font-size: var(--fs-xs, 0.75rem);
      font-weight: 700;
    }
    .line-from {
      color: var(--fg-2);
      font-size: var(--fs-xs, 0.75rem);
      line-height: 1.3;
    }
    .import-hint {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .unmatched {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
    }
    .unmatched ul {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .unmatched li {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .unmatched li .small {
      flex: 1;
      min-width: 0;
    }
    .icon-btn.mini {
      width: 32px;
      height: 32px;
    }
    .picker .h3 {
      margin-bottom: var(--space-3);
    }
    .looks-list {
      margin-top: var(--space-4);
    }
    /* where it comes from and its calories, whole, on two lines if need be */
    .looks-list .list-sub {
      white-space: normal;
    }
    .look-pic {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      flex: none;
      border-radius: 14px;
      overflow: hidden;
      background: var(--accent-soft);
      font-size: 1.6rem;
    }
    .look-pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .list-sub.common {
      color: var(--accent-text);
      font-weight: 600;
    }
    .looks-actions {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-5);
    }
  `,
})
export class RecipeEditPage {
  readonly id = input<string | undefined>();
  /** a link to import at once: ?import=… (from the recipes list) or what the phone shared (?url=… / ?text=…) */
  readonly importParam = input<string | undefined>(undefined, { alias: 'import' });
  readonly sharedUrl = input<string | undefined>(undefined, { alias: 'url' });
  readonly sharedText = input<string | undefined>(undefined, { alias: 'text' });
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);
  private readonly pickerDialog = viewChild.required<ElementRef<HTMLDialogElement>>('picker');
  private readonly importSheet = viewChild.required(RecipeImportSheetComponent);
  protected readonly mode = signal<'computed' | 'manual'>('computed');
  protected readonly source = signal<{ url: string; name: string } | null>(null);
  /** the lines of an imported recipe whose food was not found: the member picks it, or leaves it out */
  protected readonly unmatched = signal<string[]>([]);
  protected readonly fromImport = computed(() => this.mode() === 'computed' && this.lines().some((l) => l.from));
  /** what the food picker starts with (an unmatched line), and which line it is for */
  protected readonly pickerQuery = signal('');
  private pickingFor: string | null = null;
  /** the line whose food is being changed */
  private replacing: number | null = null;
  protected ingredientText = '';
  protected kcal = '';
  protected macros: Record<'proteinG' | 'carbsG' | 'fatG', string> = { proteinG: '', carbsG: '', fatG: '' };
  protected readonly macroFields: { key: 'proteinG' | 'carbsG' | 'fatG'; label: string }[] = [
    { key: 'proteinG', label: 'meals.protein' },
    { key: 'carbsG', label: 'meals.carbs' },
    { key: 'fatG', label: 'meals.fat' },
  ];

  protected readonly types = RECIPE_TYPES;
  protected readonly emoji = TYPE_EMOJI;
  protected name = '';
  protected notes = '';
  /** the community is published by the admins only: a member shares with their friends */
  private readonly session = inject(SessionStore);
  protected readonly visibilities = computed<RecipeVisibility[]>(() => (this.session.isAdmin() ? ['PRIVATE', 'FRIENDS', 'PUBLIC'] : ['PRIVATE', 'FRIENDS']));
  protected readonly visibilityIcon = VISIBILITY_ICON;
  protected readonly visibility = signal<RecipeVisibility>('PRIVATE');
  /** every meal it is for (one at least); the main one: the first of them in the usual order */
  protected readonly picked = signal<RecipeType[]>(['LUNCH']);
  protected readonly type = computed<RecipeType>(() => RECIPE_TYPES.find((t) => this.picked().includes(t)) ?? 'LUNCH');

  protected toggleType(t: RecipeType): void {
    this.picked.update((list) => (list.includes(t) ? (list.length > 1 ? list.filter((x) => x !== t) : list) : [...list, t]));
  }
  protected readonly servings = signal(2);
  protected readonly lines = signal<Line[]>([]);
  protected readonly preview = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly pickerOpen = signal(false);
  private image: Blob | null = null;
  private imageRemoved = false;
  private objectUrl: string | null = null;

  /** the Nutri-Score as the lines stand (the server works out the same one on saving) */
  protected readonly grade = computed(() => (this.lines().length ? recipeGrade(this.lines()) : null));

  protected readonly perServing = computed<Nutrients>(() => {
    let kcal = 0;
    for (const l of this.lines()) kcal += (l.per100.kcal * l.grams) / 100;
    return scaled({ kcal }, 1 / this.servings());
  });

  /** came back to this screen (back button, swipe): a new recipe left to open a lookalike is found again */
  private readonly cameBack = this.router.currentNavigation()?.trigger === 'popstate';

  constructor() {
    queueMicrotask(() => void this.load());
    afterNextRender(() => this.importAtOnce());
    inject(DestroyRef).onDestroy(() => this.objectUrl && URL.revokeObjectURL(this.objectUrl));
  }

  private restoreChecked = false;
  private restored = false;
  /** once, as soon as the id is known: the parked new recipe back in the form, or forgotten */
  private restoreOnce(): void {
    if (this.restoreChecked || this.id()) return;
    this.restoreChecked = true;
    const p = parked;
    parked = null;
    if (!p || !this.cameBack) return;
    this.restored = true;
    this.looked = true;
    this.name = p.name;
    this.notes = p.notes;
    this.picked.set(p.picked);
    this.servings.set(p.servings);
    this.visibility.set(p.visibility);
    this.mode.set(p.mode);
    this.lines.set(p.lines);
    this.unmatched.set(p.unmatched);
    this.ingredientText = p.ingredientText;
    this.kcal = p.kcal;
    this.macros = p.macros;
    this.source.set(p.source);
    if (p.image) {
      this.image = p.image;
      this.objectUrl = URL.createObjectURL(p.image);
      this.preview.set(this.objectUrl);
    }
  }

  /** opened with a link (shared from the phone's browser, or ?import from the list): the import sheet at once */
  private importAtOnce(): void {
    this.restoreOnce();
    if (this.id() || this.restored) return;
    const shared = firstLink(this.importParam() ?? '') ?? firstLink(this.sharedUrl() ?? '') ?? firstLink(this.sharedText() ?? '');
    if (!shared && this.importParam() === undefined) return;
    this.importSheet().open(shared);
  }

  private async load(): Promise<void> {
    this.restoreOnce();
    const id = this.id();
    if (!id) return;
    const r = await this.api.recipe(id);
    this.name = r.name;
    this.notes = r.notes ?? '';
    const vis: RecipeVisibility = r.visibility ?? (r.shared ? 'PUBLIC' : 'PRIVATE');
    this.visibility.set(vis === 'PUBLIC' && !this.session.isAdmin() ? 'FRIENDS' : vis);
    this.picked.set(r.types?.length ? r.types : [r.type]);
    this.servings.set(r.servings);
    this.preview.set(r.imageUrl ?? null);
    if (r.manualNutrition) {
      this.mode.set('manual');
      this.ingredientText = (r.ingredientLines ?? []).join('\n');
      this.kcal = String(Math.round(r.perServing.kcal));
      this.macros = { proteinG: this.num(r.perServing.proteinG), carbsG: this.num(r.perServing.carbsG), fatG: this.num(r.perServing.fatG) };
    }
    if (r.sourceUrl) this.source.set({ url: r.sourceUrl, name: r.sourceName ?? r.sourceUrl });
    this.lines.set(
      (r.ingredients ?? [])
        .filter((i) => i.foodId)
        .map((i) => ({
          foodId: i.foodId!,
          name: i.name,
          grams: i.grams,
          per100: i.per100 ?? { kcal: i.grams ? (i.kcal * 100) / i.grams : 0 },
          fruitVeg: i.fruitVeg,
        })),
    );
  }

  private num(v?: number): string {
    return v == null ? '' : this.i18n.number(v, v % 1 ? 1 : 0);
  }

  protected openImport(): void {
    this.importSheet().open();
  }

  /**
   * The draft fills the form. Its ingredients come with their foods (found in the Ciqual table): the calories
   * and the Nutri-Score are then computed, the member checks each line. When the site gives the calories and
   * some lines were not found, its calories are kept instead (entered by hand, the lines as written).
   */
  protected async applyDraft(d: RecipeDraft): Promise<void> {
    {
      this.name = d.name;
      this.picked.set([d.type]);
      if (d.servings) this.servings.set(d.servings);
      this.notes = d.instructions ?? this.notes;
      this.ingredientText = d.ingredients.join('\n');
      this.kcal = d.kcal != null ? String(Math.round(d.kcal)) : '';
      this.macros = { proteinG: this.num(d.proteinG), carbsG: this.num(d.carbsG), fatG: this.num(d.fatG) };
      this.source.set({ url: d.sourceUrl, name: d.sourceName });
      const found = (d.matches ?? []).filter((m) => m.food && m.grams);
      const missing = (d.matches ?? []).filter((m) => !(m.food && m.grams)).map((m) => m.line);
      const computedMode = found.length > 0 && (d.kcal == null || missing.length === 0);
      if (computedMode) {
        this.mode.set('computed');
        this.lines.set(
          found.map((m) => ({
            foodId: m.food!.id,
            name: m.food!.brand ? `${m.food!.name} · ${m.food!.brand}` : m.food!.name,
            grams: m.grams!,
            per100: m.food!.per100,
            fruitVeg: isFruitVeg(m.food!.category),
            from: m.line,
          })),
        );
        this.unmatched.set(missing);
      } else {
        this.mode.set('manual');
        this.unmatched.set([]);
      }
      if (d.photo && !this.image && !this.preview()) await this.usePhoto(d.photo);
      this.importSheet().close();
      this.toast.show(
        computedMode
          ? this.i18n.t('meals.recipe.import.doneFound', { n: found.length, total: d.ingredients.length })
          : this.i18n.t(d.kcal != null ? 'meals.recipe.import.doneKcal' : 'meals.recipe.import.done'),
      );
      // the calories are the member's part: straight to the field when the site gave none
      if (!computedMode && d.kcal == null) setTimeout(() => document.getElementById('r-kcal')?.focus(), 450);
    }
  }

  /** the photo of the recipe site (the creator's own), redrawn like a picked one */
  private async usePhoto(dataUrl: string): Promise<void> {
    try {
      const [head, b64] = dataUrl.split(',', 2);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
      this.image = await prepareImage(new Blob([bytes], { type }), 1200);
      this.imageRemoved = false;
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = URL.createObjectURL(this.image);
      this.preview.set(this.objectUrl);
    } catch {
      /* no photo then: the member may add one */
    }
  }

  /** an ingredient to find (a line of the imported recipe), or any */
  /** another food for a line (the one found was not the right one): its weight and its origin stay */
  protected changeLine(i: number): void {
    const l = this.lines()[i];
    if (!l) return;
    this.replacing = i;
    this.pickingFor = l.from ?? null;
    this.pickerQuery.set(searchable(l.from ?? l.name));
    this.pickerOpen.set(true);
    this.pickerDialog().nativeElement.showModal();
  }

  protected openPicker(line?: string): void {
    this.replacing = null;
    this.pickingFor = line ?? null;
    this.pickerQuery.set(line ? searchable(line) : '');
    this.pickerOpen.set(true);
    this.pickerDialog().nativeElement.showModal();
  }

  protected addLine(p: Picked): void {
    if (p.kind !== 'FOOD') return;
    const f = p.food;
    const line = this.pickingFor;
    const name = f.brand ? `${f.name} · ${f.brand}` : f.name;
    const at = this.replacing;
    if (at !== null && this.lines()[at]) {
      // the same line, another food: the weight already checked stays
      this.lines.update((l) => l.map((x, j) => (j === at ? { ...x, foodId: f.id, name, per100: f.per100, fruitVeg: isFruitVeg(f.category) } : x)));
    } else {
      const grams = (line && gramsOf(line)) || f.servingG || 100;
      this.lines.update((l) => [...l, { foodId: f.id, name, grams, per100: f.per100, fruitVeg: isFruitVeg(f.category), from: line ?? undefined }]);
      if (line) this.skip(line);
    }
    this.replacing = null;
    this.pickerDialog().nativeElement.close();
    this.pickerOpen.set(false);
  }

  protected skip(line: string): void {
    this.unmatched.update((u) => u.filter((x) => x !== line));
  }

  protected setGrams(i: number, value: string | number): void {
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    this.lines.update((l) => l.map((x, j) => (j === i ? { ...x, grams: n } : x)));
  }

  protected removeLine(i: number): void {
    this.lines.update((l) => l.filter((_, j) => j !== i));
  }

  protected async pickImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.image = await prepareImage(file, 1200);
      this.imageRemoved = false;
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = URL.createObjectURL(this.image);
      this.preview.set(this.objectUrl);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected clearImage(): void {
    this.image = null;
    this.imageRemoved = true;
    this.preview.set(null);
  }

  // ── the recipes that look like a new one (1.10) ───────────────────────────
  private readonly looksDialog = viewChild.required<ElementRef<HTMLDialogElement>>('looksDialog');
  protected readonly lookalikes = signal<Lookalike[]>([]);
  /** looked for once: shown, the member chooses, and is not asked again */
  private looked = false;

  protected originOf(l: Lookalike): string {
    return this.i18n.t('meals.recipe.lookalike.' + l.origin, { name: l.recipe.author ?? '' });
  }

  /** the recipe that looks like it, on top; this one waits, found again with « back » */
  protected openLookalike(id: string): void {
    parked = {
      name: this.name,
      notes: this.notes,
      picked: this.picked(),
      servings: this.servings(),
      visibility: this.visibility(),
      mode: this.mode(),
      lines: this.lines(),
      unmatched: this.unmatched(),
      ingredientText: this.ingredientText,
      kcal: this.kcal,
      macros: { ...this.macros },
      source: this.source(),
      image: this.image,
    };
    this.looksDialog().nativeElement.close();
    void this.router.navigate(['/app/meals/recipes', id]);
  }

  protected createAnyway(): void {
    closeSheet(this.looksDialog().nativeElement);
    void this.save();
  }

  protected closeLooks(): void {
    closeSheet(this.looksDialog().nativeElement);
  }

  protected async save(): Promise<void> {
    if (!this.name.trim()) {
      this.toast.error(this.i18n.error('validation_failed'));
      return;
    }
    const manual = this.mode() === 'manual';
    const toNumber = (s: string) => {
      const n = Number(String(s).replace(',', '.').trim());
      return String(s).trim() && Number.isFinite(n) ? n : null;
    };
    const kcal = toNumber(this.kcal);
    if (manual && (kcal == null || kcal < 1 || kcal > 5000)) {
      this.toast.error(this.i18n.t('meals.recipe.mode.kcalMissing'));
      document.getElementById('r-kcal')?.focus();
      return;
    }
    if (!manual && !this.lines().length) {
      this.toast.error(this.i18n.error('recipe_empty'));
      return;
    }
    // a new recipe: the ones that look like it first, once (offline or failing, it is simply saved)
    if (!this.id() && !this.looked) {
      this.looked = true;
      this.busy.set(true);
      const found = await this.api
        .lookalikes(this.name.trim(), manual ? [] : this.lines().map((l) => ({ foodId: l.foodId, grams: l.grams })))
        .catch(() => [] as Lookalike[]);
      this.busy.set(false);
      if (found.length) {
        this.lookalikes.set(found);
        this.looksDialog().nativeElement.showModal();
        return;
      }
    }
    this.busy.set(true);
    try {
      const input = {
        name: this.name.trim(),
        type: this.type(),
        types: RECIPE_TYPES.filter((t) => this.picked().includes(t)),
        servings: this.servings(),
        notes: this.notes.trim() || null,
        visibility: this.visibility(),
        ingredients: manual ? [] : this.lines().map((l) => ({ foodId: l.foodId, grams: l.grams })),
        manual: manual
          ? { kcal: kcal!, proteinG: toNumber(this.macros.proteinG), carbsG: toNumber(this.macros.carbsG), fatG: toNumber(this.macros.fatG) }
          : null,
        ingredientLines: manual ? this.ingredientText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 80) : [],
        sourceUrl: this.source()?.url ?? null,
      };
      const id = this.id();
      let recipe = id ? await this.api.updateRecipe(id, input) : await this.api.createRecipe(input);
      if (this.image) recipe = await this.api.setRecipeImage(recipe.id, this.image);
      else if (this.imageRemoved && recipe.imageUrl) recipe = await this.api.deleteRecipeImage(recipe.id);
      this.toast.show(this.i18n.t('meals.recipe.saved'));
      // edited: back to the recipe (it reloads); new: the recipe takes the editor's place
      if (id) this.stack.back('/app/meals/recipes/' + id);
      else await this.router.navigate(['/app/meals/recipes', recipe.id], { replaceUrl: true });
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}

/** « 200 g Farine (T55) » → « Farine »: what to look for */
function searchable(line: string): string {
  return line
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/^\s*[\d.,/½¼¾]+\s*(kg|g|gr|mg|ml|cl|dl|l|c\.?\s*à\s*(s|c|soupe|café)\.?|cuill[eè]res?\s+à\s+(soupe|café)|pinc[eé]es?)?\.?\s+/i, '')
    .replace(/^(de |d['’]\s*|des |du )/i, '')
    .replace(/[,:;].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** « 200 g … » → 200, « 1,5 kg … » → 1500, « 20 cl … » → 200; null when the line gives no weight */
function gramsOf(line: string): number | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|dl|l)\b/i.exec(line);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  const unit: Record<string, number> = { kg: 1000, g: 1, gr: 1, ml: 1, cl: 10, dl: 100, l: 1000 };
  return Math.round(n * (unit[m[2].toLowerCase()] ?? 1) * 10) / 10;
}
