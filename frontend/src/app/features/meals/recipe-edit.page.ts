import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Nutrients, RecipeType } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { scaled } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { prepareImage } from '../../core/photos/image-tools';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { FoodPickerComponent, Picked } from './food-picker.component';
import { RECIPE_TYPES, TYPE_EMOJI } from './recipes.page';

interface Line {
  foodId: string;
  name: string;
  grams: number;
  /** per 100 g, for the live totals (unknown for ingredients loaded from a saved recipe: kcal only) */
  per100: Nutrients;
}

/** A recipe of one's own: name, type, servings, picture, ingredients with their weights, method, sharing. */
@Component({
  selector: 'app-recipe-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, BackButtonComponent, NumberStepperComponent, FoodPickerComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ (id() ? 'meals.recipe.editTitle' : 'meals.recipe.newTitle') | t }}</h1>
      </header>

      <form class="stack" (ngSubmit)="save()">
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

        <span class="label">{{ 'meals.recipe.type' | t }}</span>
        <div class="types" role="radiogroup" [attr.aria-label]="'meals.recipe.type' | t">
          @for (t of types; track t) {
            <button type="button" role="radio" class="chip" [class.chip-accent]="type() === t" [attr.aria-checked]="type() === t" (click)="type.set(t)">
              {{ emoji[t] }} {{ 'meals.recipe.types.' + t | t }}
            </button>
          }
        </div>

        <span class="label">{{ 'meals.recipe.servingsLabel' | t }}</span>
        <app-number-stepper [(value)]="servings" [step]="1" [min]="1" [max]="50" [decimals]="0" [label]="'meals.recipe.servingsLabel' | t" />

        <h2 class="section-title">{{ 'meals.recipe.ingredients' | t }}</h2>
        @if (lines().length) {
          <ul class="lines" role="list">
            @for (l of lines(); track $index; let i = $index) {
              <li class="line">
                <span class="line-name">{{ l.name }}</span>
                <input class="input grams" type="text" inputmode="decimal" [name]="'g' + i" [ngModel]="l.grams" (ngModelChange)="setGrams(i, $event)"
                  [attr.aria-label]="'meals.recipe.ingredientGrams' | t: { name: l.name }" />
                <span class="unit">g</span>
                <button type="button" class="icon-btn" [attr.aria-label]="'meals.recipe.removeIngredient' | t: { name: l.name }" (click)="removeLine(i)"><app-icon name="x" [size]="18" /></button>
              </li>
            }
          </ul>
          <p class="totals small"><b class="num">{{ i18n.number(perServing().kcal) }} kcal</b> {{ 'meals.perServing' | t }}</p>
        }
        <button type="button" class="btn btn-secondary" (click)="openPicker()"><app-icon name="plus" /> {{ 'meals.recipe.addIngredient' | t }}</button>

        <div class="field">
          <label class="label" for="r-notes">{{ 'meals.recipe.notes' | t }}</label>
          <textarea class="textarea" id="r-notes" name="notes" rows="5" maxlength="4000" [(ngModel)]="notes"></textarea>
        </div>

        <label class="check share">
          <input type="checkbox" name="shared" [(ngModel)]="shared" />
          <span>
            <b>{{ 'meals.recipe.share' | t }}</b>
            <span class="small muted">{{ 'meals.recipe.shareHint' | t }}</span>
          </span>
        </label>

        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()"><app-icon name="check" /> {{ 'meals.recipe.save' | t }}</button>
      </form>

      <dialog class="sheet picker" #picker>
        <div class="sheet-grip"></div>
        <h2 class="h3">{{ 'meals.recipe.pickTitle' | t }}</h2>
        @if (pickerOpen()) {
          <app-food-picker [withExtras]="false" (picked)="addLine($event)" />
        }
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
    .photo img {
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
    .totals {
      text-align: right;
      color: var(--fg-2);
    }
    .share {
      align-items: flex-start;
    }
    .share > span {
      display: grid;
      gap: 2px;
    }
    .picker {
      min-height: 70dvh;
    }
    .picker .h3 {
      margin-bottom: var(--space-3);
    }
  `,
})
export class RecipeEditPage {
  readonly id = input<string | undefined>();
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);
  private readonly pickerDialog = viewChild.required<ElementRef<HTMLDialogElement>>('picker');

  protected readonly types = RECIPE_TYPES;
  protected readonly emoji = TYPE_EMOJI;
  protected name = '';
  protected notes = '';
  protected shared = false;
  protected readonly type = signal<RecipeType>('LUNCH');
  protected readonly servings = signal(2);
  protected readonly lines = signal<Line[]>([]);
  protected readonly preview = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly pickerOpen = signal(false);
  private image: Blob | null = null;
  private imageRemoved = false;
  private objectUrl: string | null = null;

  protected readonly perServing = computed<Nutrients>(() => {
    let kcal = 0;
    for (const l of this.lines()) kcal += (l.per100.kcal * l.grams) / 100;
    return scaled({ kcal }, 1 / this.servings());
  });

  constructor() {
    queueMicrotask(() => void this.load());
    inject(DestroyRef).onDestroy(() => this.objectUrl && URL.revokeObjectURL(this.objectUrl));
  }

  private async load(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const r = await this.api.recipe(id);
    this.name = r.name;
    this.notes = r.notes ?? '';
    this.shared = r.shared;
    this.type.set(r.type);
    this.servings.set(r.servings);
    this.preview.set(r.imageUrl ?? null);
    this.lines.set(
      (r.ingredients ?? [])
        .filter((i) => i.foodId)
        .map((i) => ({ foodId: i.foodId!, name: i.name, grams: i.grams, per100: { kcal: i.grams ? (i.kcal * 100) / i.grams : 0 } })),
    );
  }

  protected openPicker(): void {
    this.pickerOpen.set(true);
    this.pickerDialog().nativeElement.showModal();
  }

  protected addLine(p: Picked): void {
    if (p.kind !== 'FOOD') return;
    const f = p.food;
    this.lines.update((l) => [...l, { foodId: f.id, name: f.brand ? `${f.name} · ${f.brand}` : f.name, grams: f.servingG ?? 100, per100: f.per100 }]);
    this.pickerDialog().nativeElement.close();
    this.pickerOpen.set(false);
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

  protected async save(): Promise<void> {
    if (!this.name.trim()) {
      this.toast.error(this.i18n.error('validation_failed'));
      return;
    }
    if (!this.lines().length) {
      this.toast.error(this.i18n.error('recipe_empty'));
      return;
    }
    this.busy.set(true);
    try {
      const input = {
        name: this.name.trim(),
        type: this.type(),
        servings: this.servings(),
        notes: this.notes.trim() || null,
        shared: this.shared,
        ingredients: this.lines().map((l) => ({ foodId: l.foodId, grams: l.grams })),
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
