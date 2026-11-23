import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { EstimatedItem, FastFoodSheetComponent } from './fast-food-sheet.component';
import { DrinkSheetComponent } from './drink-sheet.component';
import { AperoSheetComponent } from './apero-sheet.component';
import { SandwichSheetComponent } from './sandwich-sheet.component';
import { SweetsSheetComponent } from './sweets-sheet.component';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import { unreachable } from '../../core/offline/offline-cache';
import type { Food, Nutrients, RecentItem, Recipe, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { MealsStore, scaled, slotNow } from '../../core/meals/meals.store';
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
  imports: [FastFoodSheetComponent, DrinkSheetComponent, AperoSheetComponent, SandwichSheetComponent, SweetsSheetComponent, FormsModule, RouterLink, TranslatePipe, IconComponent, BackButtonComponent, FoodPickerComponent, QuantitySheetComponent],
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
        recipesLink="/app/meals/recipes"
        [recipesParams]="{ slot: slot(), day: day() }"
        [sourceParams]="{ slot: slot(), day: day() }"
        (picked)="pick($event)"
        (quick)="openQuick({ name: $event })"
        (dish)="$event === 'sandwich' ? sandwichSheet.open() : estimate.open($event)"
        (drink)="drinkSheet.open($event)"
        (apero)="aperoSheet.open($event)"
        (sweet)="sweetsSheet.open($event)"
      />
      <app-fast-food-sheet #estimate [slotLabel]="'meals.addTo.' + slot() | t" (confirm)="addEstimate($event)" />
      <app-drink-sheet #drinkSheet [slotLabel]="'meals.addTo.' + slot() | t" (confirm)="addEstimate($event, drinkSheet)" />
      <app-apero-sheet #aperoSheet [slotLabel]="'meals.addTo.' + slot() | t" (confirm)="addEstimate($event, aperoSheet)" />
      <!-- 1.17: a sandwich made up piece by piece -->
      <app-sandwich-sheet #sandwichSheet [slotLabel]="'meals.addTo.' + slot() | t" (confirm)="addEstimate($event, sandwichSheet)" />
      <!-- 1.18: the bakery's window, the chocolates, the sweets -->
      <app-sweets-sheet #sweetsSheet [slotLabel]="'meals.addTo.' + slot() | t" (confirm)="addEstimate($event, sweetsSheet)" />
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
          <a class="small create-link" routerLink="/app/meals/food/new" (click)="closeQuick()">{{ 'meals.quick.orCreate' | t }}</a>
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
    .create-link {
      justify-self: center;
      color: var(--accent-text);
      font-weight: 650;
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
  private current: { kind: 'FOOD' | 'RECIPE'; id: string; name: string; base?: Nutrients } | null = null;

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
      // 1.18: without network and never opened before, from what the line itself was worth
      const load =
        r.kind === 'FOOD'
          ? this.api
              .food(r.id)
              .catch((e: unknown) => this.fromRecent(r, e) as Food)
              .then((f) => this.openFood(f, r.grams))
          : this.api
              .recipe(r.id)
              .catch((e: unknown) => this.fromRecent(r, e) as Recipe)
              .then((x) => this.openRecipe(x, r.servings));
      load.catch((e) => this.toast.error(this.i18n.error(errorCode(e))));
    }
  }

  /**
   * 1.18: a food or a recipe of the recents with no network to fetch it: what the recent line says is enough to note it
   * again (its values by 100 g or by serving, its name); anything else fails as it did
   */
  private fromRecent(r: RecentItem, e: unknown): Food | Recipe {
    if (!unreachable(e) || !r.base) throw e;
    if (r.kind === 'FOOD') {
      return { id: r.id, source: 'CIQUAL', name: r.name, per100: r.base, nutriscoreEstimated: false, mine: false, liquid: r.liquid } satisfies Food;
    }
    return {
      id: r.id,
      name: r.name,
      type: 'LUNCH',
      servings: 1,
      shared: false,
      visibility: 'PRIVATE',
      hidden: false,
      mine: false,
      perServing: r.base,
      score: 0,
      createdAt: new Date().toISOString(),
    } satisfies Recipe;
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

  protected closeQuick(): void {
    this.quickDialog().nativeElement.close();
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
      const quick = {
        name,
        kcal: MealAddPage.num(this.qKcal)!,
        proteinG: MealAddPage.num(this.qMacros.proteinG),
        carbsG: MealAddPage.num(this.qMacros.carbsG),
        fatG: MealAddPage.num(this.qMacros.fatG),
      };
      await this.store.add(
        { day: this.day(), slot: this.slot(), quick },
        { name, nutrients: { kcal: quick.kcal, proteinG: quick.proteinG ?? undefined, carbsG: quick.carbsG ?? undefined, fatG: quick.fatG ?? undefined } },
      );
      closeSheet(this.quickDialog().nativeElement);
      this.toast.show(this.addedText(name));
      this.stack.back('/app/meals');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.quickBusy.set(false);
    }
  }

  /** a meal at the snack bar, by estimate: each item on its own line (no line for a glass of water) */
  /** the items of an estimate (fast food, or a drink), each on its own line */
  protected async addEstimate(items: EstimatedItem[], from?: DrinkSheetComponent | AperoSheetComponent | SandwichSheetComponent | SweetsSheetComponent): Promise<void> {
    const sheet = from ?? this.estimateSheet();
    const lines = items.filter((i) => i.kcal >= 1);
    if (!lines.length) return;
    sheet.busy.set(true);
    try {
      for (const i of lines) {
        const { name, nutriscore, health, ...nutrients } = i;
        await this.store.add({ day: this.day(), slot: this.slot(), quick: { ...i } }, { name, nutrients });
      }
      sheet.close();
      this.toast.show(
        this.store.lastQueued()
          ? this.i18n.t('offline.queued')
          : this.i18n.t('meals.estimate.added', { kcal: this.i18n.number(lines.reduce((t, i) => t + i.kcal, 0)) }),
      );
      this.stack.back('/app/meals');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      sheet.busy.set(false);
    }
  }

  /** « Ajouté », or kept on the phone when there is no network */
  private addedText(name: string): string {
    return this.store.lastQueued() ? this.i18n.t('offline.queued') : this.i18n.t('meals.search.added', { name });
  }

  private openFood(f: Food, initial?: number): void {
    this.current = { kind: 'FOOD', id: f.id, name: f.name, base: f.per100 };
    this.sheet().open({
      name: f.name,
      detail: [f.brand, f.quantity].filter(Boolean).join(' · ') || f.category || this.i18n.t('meals.search.sources.' + f.source),
      unit: 'g',
      base: f.per100,
      servingG: f.servingG,
      initial,
      food: f,
      day: this.day(),
    });
  }

  private openRecipe(r: Recipe, initial?: number): void {
    this.current = { kind: 'RECIPE', id: r.id, name: r.name, base: r.perServing };
    // 1.18: how big a part is, when the server could tell
    const detail = r.plateG ? this.i18n.t('meals.serving.sheet', { g: this.i18n.number(r.plateG) }) : this.i18n.t('meals.perServing');
    this.sheet().open({ name: r.name, detail, unit: 'serving', base: r.perServing, initial, recipe: r, day: this.day() });
  }

  protected async add(qty: number): Promise<void> {
    const c = this.current;
    if (!c) return;
    this.sheet().busy.set(true);
    try {
      await this.store.add(
        {
          day: this.day(),
          slot: this.slot(),
          ...(c.kind === 'FOOD' ? { foodId: c.id, grams: qty } : { recipeId: c.id, servings: qty }),
        },
        c.base ? { name: c.name, nutrients: scaled(c.base, c.kind === 'FOOD' ? qty / 100 : qty) } : undefined,
      );
      this.sheet().close();
      this.toast.show(this.addedText(c.name));
      this.stack.back('/app/meals');
    } catch (e) {
      this.sheet().busy.set(false);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
