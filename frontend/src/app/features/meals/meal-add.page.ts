import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { EstimatedItem, FastFoodSheetComponent } from './fast-food-sheet.component';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import type { Food, RecentItem, Recipe, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { MealsStore, slotNow } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { localDay } from '../../core/tracking/tracking.store';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { BackButtonComponent } from '../../shared/back-button.component';
import { FoodPickerComponent, Picked } from './food-picker.component';
import { QuantitySheetComponent } from './quantity-sheet.component';

const SLOTS: Slot[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** Adding to a meal: search, recents, recipes, barcode, then the amount; or a quick portion with its calories only. */
@Component({
  selector: 'app-meal-add',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FastFoodSheetComponent, FormsModule, TranslatePipe, IconComponent, BackButtonComponent, FoodPickerComponent, QuantitySheetComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.addTo.' + slot() | t }}</h1>
      </header>
      <app-food-picker
        [recent]="store.recent() ?? []"
        [recipes]="recipes()"
        scanLink="/app/meals/scan"
        createLink="/app/meals/food/new"
        (picked)="pick($event)"
        (quick)="openQuick({ name: $event })"
        (dish)="estimate.open($event)"
      />
      <app-fast-food-sheet #estimate [slotLabel]="'meals.addTo.' + slot() | t" (confirm)="addEstimate($event)" />
      <app-quantity-sheet (confirm)="add($event)" />

      <dialog class="sheet" #quickDialog [attr.aria-label]="'meals.quick.title' | t">
        <div class="sheet-grip"></div>
        <form class="stack" (ngSubmit)="addQuick()">
          <div>
            <h2 class="h3">{{ 'meals.quick.title' | t }}</h2>
            <p class="small muted">{{ 'meals.quick.text' | t }}</p>
          </div>
          <div class="field">
            <label class="label" for="q-name">{{ 'meals.quick.name' | t }}</label>
            <input class="input" id="q-name" name="name" maxlength="120" autocomplete="off" [placeholder]="'meals.quick.namePlaceholder' | t" [(ngModel)]="qName" />
          </div>
          <div class="field">
            <label class="label" for="q-kcal">{{ 'meals.quick.kcal' | t }}</label>
            <div class="with-unit"><input class="input big" id="q-kcal" name="kcal" type="text" inputmode="numeric" autocomplete="off" [(ngModel)]="qKcal" /><span>kcal</span></div>
          </div>
          <div class="macro-row">
            @for (m of macroFields; track m.key) {
              <div class="field">
                <label class="label tiny" [for]="'q-' + m.key">{{ m.label | t }}</label>
                <div class="with-unit"><input class="input" [id]="'q-' + m.key" [name]="m.key" type="text" inputmode="decimal" [(ngModel)]="qMacros[m.key]" /><span>g</span></div>
              </div>
            }
          </div>
          <p class="tiny muted hint"><app-icon name="info" [size]="14" /> {{ 'meals.quick.hint' | t }}</p>
          <button type="submit" class="btn btn-primary btn-block" [disabled]="quickBusy() || !quickValid()"><app-icon name="plus" /> {{ 'meals.add' | t }}</button>
        </form>
      </dialog>
    </main>
  `,
  styles: `
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
      padding-right: 48px;
    }
    .with-unit .input.big {
      font-size: 1.4rem;
      font-weight: 750;
    }
    .with-unit span {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--fg-2);
      font-weight: 600;
      pointer-events: none;
    }
    .hint {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
  `,
})
export class MealAddPage {
  readonly slotParam = input<string | undefined>(undefined, { alias: 'slot' });
  readonly dayParam = input<string | undefined>(undefined, { alias: 'day' });
  protected readonly store = inject(MealsStore);
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  private readonly i18n = inject(I18nService);
  private readonly sheet = viewChild.required(QuantitySheetComponent);
  private readonly quickDialog = viewChild.required<ElementRef<HTMLDialogElement>>('quickDialog');
  private readonly estimateSheet = viewChild.required(FastFoodSheetComponent);
  protected qName = '';
  protected qKcal = '';
  protected qMacros: Record<'proteinG' | 'carbsG' | 'fatG', string> = { proteinG: '', carbsG: '', fatG: '' };
  protected readonly quickBusy = signal(false);
  protected readonly macroFields: { key: 'proteinG' | 'carbsG' | 'fatG'; label: string }[] = [
    { key: 'proteinG', label: 'meals.protein' },
    { key: 'carbsG', label: 'meals.carbs' },
    { key: 'fatG', label: 'meals.fat' },
  ];

  protected readonly slot = computed<Slot>(() => {
    const s = this.slotParam() as Slot | undefined;
    return s && SLOTS.includes(s) ? s : slotNow();
  });
  protected readonly day = computed(() => (this.dayParam() && /^\d{4}-\d{2}-\d{2}$/.test(this.dayParam()!) ? this.dayParam()! : localDay()));
  protected readonly recipes = signal<Recipe[]>([]);
  private current: { kind: 'FOOD' | 'RECIPE'; id: string; name: string } | null = null;

  constructor() {
    void this.store.loadRecent().catch(() => undefined);
    void this.api
      .myRecipes()
      .then((r) => this.recipes.set(r))
      .catch(() => undefined);
    // back from the scanner or from a new food: open its amount straight away
    effect(() => {
      const p = this.store.pick();
      if (!p) return;
      this.store.pick.set(null);
      const load = p.kind === 'FOOD' ? this.api.food(p.id).then((f) => this.openFood(f)) : this.api.recipe(p.id).then((r) => this.openRecipe(r));
      load.catch((e) => this.toast.error(this.i18n.error(errorCode(e))));
    });
  }

  protected pick(p: Picked): void {
    if (p.kind === 'FOOD') this.openFood(p.food);
    else if (p.kind === 'RECIPE') this.openRecipe(p.recipe);
    else if (p.item.kind === 'QUICK') this.openQuick(p.item);
    else {
      const r = p.item;
      const load = r.kind === 'FOOD' ? this.api.food(r.id).then((f) => this.openFood(f, r.grams)) : this.api.recipe(r.id).then((x) => this.openRecipe(x, r.servings));
      load.catch((e) => this.toast.error(this.i18n.error(errorCode(e))));
    }
  }

  /** a portion with only its calories: from the button, a search that found nothing, or the recents */
  protected openQuick(from: { name: string } | RecentItem): void {
    const q = 'kind' in from ? from.quick : undefined;
    const n = (v?: number) => (v == null ? '' : this.i18n.number(v, v % 1 ? 1 : 0));
    this.qName = from.name;
    this.qKcal = 'kind' in from ? String(Math.round(from.kcal)) : '';
    this.qMacros = { proteinG: n(q?.proteinG), carbsG: n(q?.carbsG), fatG: n(q?.fatG) };
    this.quickDialog().nativeElement.showModal();
    setTimeout(() => document.getElementById(this.qName ? 'q-kcal' : 'q-name')?.focus(), 350);
  }

  private static num(s: string): number | null {
    const n = Number(String(s).replace(',', '.').trim());
    return String(s).trim() && Number.isFinite(n) ? n : null;
  }

  protected quickValid(): boolean {
    const k = MealAddPage.num(this.qKcal);
    return !!this.qName.trim() && k != null && k >= 1 && k <= 5000;
  }

  protected async addQuick(): Promise<void> {
    if (!this.quickValid()) return;
    this.quickBusy.set(true);
    const name = this.qName.trim();
    try {
      await this.store.add({
        day: this.day(),
        slot: this.slot(),
        quick: {
          name,
          kcal: MealAddPage.num(this.qKcal)!,
          proteinG: MealAddPage.num(this.qMacros.proteinG),
          carbsG: MealAddPage.num(this.qMacros.carbsG),
          fatG: MealAddPage.num(this.qMacros.fatG),
        },
      });
      closeSheet(this.quickDialog().nativeElement);
      this.toast.show(this.i18n.t('meals.search.added', { name }));
      this.stack.back('/app/meals');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.quickBusy.set(false);
    }
  }

  /** a meal at the snack bar, by estimate: each item on its own line (no line for a glass of water) */
  protected async addEstimate(items: EstimatedItem[]): Promise<void> {
    const sheet = this.estimateSheet();
    const lines = items.filter((i) => i.kcal >= 1);
    if (!lines.length) return;
    sheet.busy.set(true);
    try {
      for (const i of lines) {
        await this.store.add({ day: this.day(), slot: this.slot(), quick: { ...i } });
      }
      sheet.close();
      this.toast.show(this.i18n.t('meals.estimate.added', { kcal: this.i18n.number(lines.reduce((t, i) => t + i.kcal, 0)) }));
      this.stack.back('/app/meals');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      sheet.busy.set(false);
    }
  }

  private openFood(f: Food, initial?: number): void {
    this.current = { kind: 'FOOD', id: f.id, name: f.name };
    this.sheet().open({
      name: f.name,
      detail: f.brand ?? f.category ?? this.i18n.t('meals.search.sources.' + f.source),
      unit: 'g',
      base: f.per100,
      servingG: f.servingG,
      nutriscore: f.nutriscore,
      estimated: f.nutriscoreEstimated,
      initial,
    });
  }

  private openRecipe(r: Recipe, initial?: number): void {
    this.current = { kind: 'RECIPE', id: r.id, name: r.name };
    this.sheet().open({ name: r.name, detail: this.i18n.t('meals.perServing'), unit: 'serving', base: r.perServing, nutriscore: r.nutriscore, estimated: true, initial });
  }

  protected async add(qty: number): Promise<void> {
    const c = this.current;
    if (!c) return;
    this.sheet().busy.set(true);
    try {
      await this.store.add({
        day: this.day(),
        slot: this.slot(),
        ...(c.kind === 'FOOD' ? { foodId: c.id, grams: qty } : { recipeId: c.id, servings: qty }),
      });
      this.sheet().close();
      this.toast.show(this.i18n.t('meals.search.added', { name: c.name }));
      this.stack.back('/app/meals');
    } catch (e) {
      this.sheet().busy.set(false);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
