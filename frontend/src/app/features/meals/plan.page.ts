import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Recipe, Slot } from '../../core/api/models';
import { HabitsApi, type MealTemplate } from '../../core/api/habits-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { FavoritesStore } from '../../core/meals/favorites.store';
import { MealsApi } from '../../core/meals/meals-api';
import { shiftDay } from '../../core/meals/meals.store';
import { PlanItem, PlanStore } from '../../core/meals/plan.store';
import { ShoppingStore } from '../../core/meals/shopping.store';
import { localDay } from '../../core/tracking/tracking.store';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';

const SLOTS: Slot[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/** text without accents nor case, to find a recipe by any word of its name */
function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/**
 * 1.20: « Mon planning »: the meals planned for this week and the next, day by day: a recipe for its servings, a usual
 * meal, or a note (« Restaurant avec Léa »). On the day (and the day after), « C'est mangé » notes it in the meals; the
 * week's recipes and usual meals go to the shopping list in one tap. A recipe is planned from here (mine and my favourites,
 * or any recipe through « Toutes les recettes ») or from its own page.
 */
@Component({
  selector: 'app-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent, NumberStepperComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title">{{ 'plan.title' | t }}</h1>
      </header>
      <p class="small muted lead-text">{{ 'plan.lead' | t }}</p>
      <div class="seg" role="group" [attr.aria-label]="'plan.weeks' | t">
        <button type="button" [attr.aria-pressed]="week() === 0" (click)="week.set(0)">{{ 'plan.thisWeek' | t }}</button>
        <button type="button" [attr.aria-pressed]="week() === 1" (click)="week.set(1)">{{ 'plan.nextWeek' | t }}</button>
      </div>

      @for (d of days(); track d.day) {
        <section class="card day" [class.today]="d.day === today" [attr.aria-labelledby]="'pd-' + d.day">
          <header class="day-head">
            <h2 class="h3" [id]="'pd-' + d.day">{{ d.label }}</h2>
            @if (d.kcal) {
              <span class="small muted num">{{ 'plan.dayKcal' | t: { kcal: i18n.number(d.kcal) } }}</span>
            }
          </header>
          @if (d.items.length) {
            <ul class="items" role="list">
              @for (p of d.items; track p.id) {
                <li class="item" [class.eatable]="d.day <= today && p.kind !== 'NOTE'">
                  <span class="ico" [attr.data-kind]="p.kind" aria-hidden="true">
                    @if (p.thumbUrl) {
                      <img [src]="p.thumbUrl" alt="" loading="lazy" />
                    } @else {
                      <app-icon [name]="p.kind === 'RECIPE' ? 'book' : p.kind === 'TEMPLATE' ? 'bookmark' : 'pencil'" [size]="18" />
                    }
                  </span>
                  <span class="body">
                    <span class="slot tiny">{{ 'meals.slots.' + p.slot | t }}</span>
                    <b class="small name">{{ p.name }}</b>
                    <span class="tiny muted">{{ sub(p) }}</span>
                  </span>
                  <button type="button" class="icon-btn drop" [attr.aria-label]="'plan.remove' | t: { name: p.name }" (click)="remove(p)">
                    <app-icon name="trash" [size]="18" />
                  </button>
                  @if (d.day <= today && p.kind !== 'NOTE') {
                    <button type="button" class="btn btn-secondary btn-s eat" [disabled]="busy()" (click)="eat(p)">
                      <app-icon name="check" [size]="15" [stroke]="2.6" /> {{ 'plan.eaten' | t }}
                    </button>
                  }
                </li>
              }
            </ul>
          }
          <button type="button" class="btn btn-ghost btn-s add" (click)="openAdd(d.day)"><app-icon name="plus" [size]="16" /> {{ 'plan.add' | t }}</button>
        </section>
      }

      <button type="button" class="btn btn-primary btn-block" [disabled]="!weekHasFood() || busy()" (click)="toShopping()">
        <app-icon name="cart" /> {{ 'plan.toShopping' | t }}
      </button>
      <p class="tiny muted center">{{ 'plan.shoppingHint' | t }}</p>

      <dialog class="sheet" #addSheet [attr.aria-label]="'plan.addLabel' | t">
        <div class="sheet-grip"></div>
        @if (adding(); as day) {
          <div class="stack">
            <h2 class="h3">{{ 'plan.addTitle' | t: { day: dayInline(day) } }}</h2>
            <div class="seg" role="group" [attr.aria-label]="'plan.slot' | t">
              @for (s of slots; track s) {
                <button type="button" [attr.aria-pressed]="slot() === s" (click)="slot.set(s)">{{ 'meals.slots.' + s | t }}</button>
              }
            </div>
            <div class="seg" role="group" [attr.aria-label]="'plan.what' | t">
              <button type="button" [attr.aria-pressed]="tab() === 'recipe'" (click)="tab.set('recipe')">{{ 'plan.tabs.recipe' | t }}</button>
              <button type="button" [attr.aria-pressed]="tab() === 'template'" (click)="tab.set('template')">{{ 'plan.tabs.template' | t }}</button>
              <button type="button" [attr.aria-pressed]="tab() === 'note'" (click)="tab.set('note')">{{ 'plan.tabs.note' | t }}</button>
            </div>
            @switch (tab()) {
              @case ('recipe') {
                @if (chosen(); as r) {
                  <div class="chosen">
                    <b>{{ r.name }}</b>
                    <button type="button" class="btn btn-ghost btn-s" (click)="chosen.set(null)">{{ 'plan.change' | t }}</button>
                  </div>
                  <app-number-stepper [(value)]="servings" [step]="0.5" [min]="0.5" [max]="20" [decimals]="1" [label]="'meals.quantity.servingsLabel' | t" />
                  <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="addRecipe(day, r)">
                    <app-icon name="calendar" /> {{ 'plan.planIt' | t }}
                  </button>
                } @else {
                  <input type="search" class="input" enterkeyhint="search" [attr.aria-label]="'plan.searchRecipes' | t"
                    [placeholder]="'plan.searchRecipes' | t" [value]="query()" (input)="query.set($any($event.target).value)" />
                  @if (recipeChoices().length) {
                    <ul class="pick" role="list">
                      @for (r of recipeChoices(); track r.id) {
                        <li>
                          <button type="button" class="pick-row" (click)="chooseRecipe(r)">
                            <span class="small">{{ r.name }}</span>
                            <span class="tiny muted num">{{ 'plan.perServing' | t: { kcal: i18n.number(r.perServing.kcal) } }}</span>
                          </button>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="small muted">{{ 'plan.noRecipe' | t }}</p>
                  }
                  <a class="small more" routerLink="/app/meals/recipes" [queryParams]="{ plan: day, slot: slot() }" (click)="closeAdd()">
                    {{ 'plan.allRecipes' | t }} <app-icon name="chevronRight" [size]="14" />
                  </a>
                }
              }
              @case ('template') {
                @if (templates().length) {
                  <ul class="pick" role="list">
                    @for (t of templates(); track t.id) {
                      <li>
                        <button type="button" class="pick-row" [disabled]="busy()" (click)="addTemplate(day, t)">
                          <span class="small">{{ t.name }}</span>
                          <span class="tiny muted num">{{ i18n.number(t.kcal) }} kcal</span>
                        </button>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="small muted">{{ 'plan.noTemplate' | t }}</p>
                }
              }
              @case ('note') {
                <input class="input" maxlength="80" [attr.aria-label]="'plan.noteLabel' | t" [placeholder]="'plan.notePlaceholder' | t"
                  [value]="note()" (input)="note.set($any($event.target).value)" />
                <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || !note().trim()" (click)="addNote(day)">
                  <app-icon name="calendar" /> {{ 'plan.planIt' | t }}
                </button>
              }
            }
          </div>
        }
      </dialog>
    </main>
  `,
  styles: `
    .lead-text {
      margin: calc(var(--space-3) * -1) 0 0;
    }
    .day {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
    }
    .day.today {
      border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
    }
    .day-head {
      display: grid;
      gap: 2px;
    }
    .day-head h2 {
      margin: 0;
      font-size: 1.05rem;
    }
    .items {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .item {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) auto;
      align-items: center;
      gap: 4px 10px;
      padding: 8px 0;
      border-top: 1px solid var(--line);
    }
    /* on the day: « C'est mangé » under the name, which keeps the whole width */
    .eat {
      grid-column: 2 / -1;
      justify-self: start;
    }
    .ico {
      display: grid;
      flex: none;
      place-items: center;
      width: 40px;
      height: 40px;
      overflow: hidden;
      border-radius: 12px;
      background: var(--surface-2);
      color: var(--fg-2);
    }
    .ico[data-kind='RECIPE'] {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .ico img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .body {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .slot {
      color: var(--accent-text);
      font-weight: 700;
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .add {
      justify-self: start;
    }
    .center {
      margin: calc(var(--space-3) * -1) 0 0;
      text-align: center;
    }
    .pick {
      display: grid;
      max-height: 42vh;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
    }
    .pick li + li {
      border-top: 1px solid var(--line);
    }
    .pick-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      padding: 10px 2px;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .chosen {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .more {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      justify-self: start;
      color: var(--accent-text);
      font-weight: 700;
      text-decoration: none;
    }
  `,
})
export class PlanPage {
  protected readonly i18n = inject(I18nService);
  private readonly store = inject(PlanStore);
  private readonly api = inject(MealsApi);
  private readonly habits = inject(HabitsApi);
  private readonly favorites = inject(FavoritesStore);
  private readonly shopping = inject(ShoppingStore);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('addSheet');
  protected readonly slots = SLOTS;
  protected readonly today = localDay();
  /** this week (today and the 6 days after) or the next */
  protected readonly week = signal(0);
  protected readonly busy = signal(false);

  protected readonly days = computed(() => {
    const items = this.store.visible();
    const start = shiftDay(this.today, this.week() * 7);
    const out: { day: string; label: string; items: PlanItem[]; kcal: number }[] = [];
    // yesterday too, while something planned there is still to note
    if (this.week() === 0) {
      const y = shiftDay(this.today, -1);
      const left = items.filter((p) => p.day === y);
      if (left.length) out.push({ day: y, label: this.dayName(y), items: left, kcal: sum(left) });
    }
    for (let i = 0; i < 7; i++) {
      const day = shiftDay(start, i);
      const list = items.filter((p) => p.day === day);
      out.push({ day, label: this.dayName(day), items: list, kcal: sum(list) });
    }
    return out;
  });
  protected readonly weekHasFood = computed(() => this.days().some((d) => d.day >= this.today && d.items.some((p) => p.kind !== 'NOTE')));

  // ── the sheet to plan a meal on a day ──
  protected readonly adding = signal<string | null>(null);
  protected readonly slot = signal<Slot>('DINNER');
  protected readonly tab = signal<'recipe' | 'template' | 'note'>('recipe');
  protected readonly query = signal('');
  protected readonly chosen = signal<Recipe | null>(null);
  protected readonly servings = signal(1);
  protected readonly note = signal('');
  private readonly mine = signal<Recipe[]>([]);
  protected readonly templates = signal<MealTemplate[]>([]);
  /** my recipes and my favourites, by the words of their name */
  protected readonly recipeChoices = computed(() => {
    const seen = new Set<string>();
    const all = [...this.mine(), ...(this.favorites.recipes() ?? [])].filter((r) => !seen.has(r.id) && seen.add(r.id));
    const words = plain(this.query()).split(/\s+/).filter(Boolean);
    return all.filter((r) => words.every((w) => plain(r.name).includes(w))).slice(0, 40);
  });

  constructor() {
    void this.store.ensure(0).catch((e: unknown) => this.toast.error(this.i18n.error(errorCode(e))));
  }

  protected dayName(day: string): string {
    const name = this.i18n.date(day, { weekday: 'long', day: 'numeric', month: 'long' });
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    if (day === this.today) return `${this.i18n.t('plan.today')} · ${label}`;
    if (day === shiftDay(this.today, 1)) return `${this.i18n.t('plan.tomorrow')} · ${label}`;
    if (day === shiftDay(this.today, -1)) return `${this.i18n.t('plan.yesterday')} · ${label}`;
    return label;
  }

  /** the same, inside a sentence (« Prévoir pour demain · mardi 24 novembre ») */
  protected dayInline(day: string): string {
    return this.dayName(day).replace(/^(\S)/, (c) => c.toLowerCase()).replace(/· (\S)/, (_m: string, c: string) => '· ' + c.toLowerCase());
  }

  protected sub(p: PlanItem): string {
    if (p.kind === 'NOTE') return this.i18n.t('plan.kinds.NOTE');
    const kcal = p.kcal != null ? `${this.i18n.number(p.kcal)} kcal` : '';
    if (p.kind === 'TEMPLATE') return [this.i18n.t('plan.kinds.TEMPLATE'), kcal].filter(Boolean).join(' · ');
    const n = p.servings ?? 1;
    return [this.i18n.t('meals.servings', { n: this.i18n.number(n, n % 1 ? 1 : 0) }), kcal].filter(Boolean).join(' · ');
  }

  protected openAdd(day: string): void {
    this.adding.set(day);
    this.chosen.set(null);
    this.query.set('');
    this.note.set('');
    this.servings.set(1);
    this.sheet().nativeElement.showModal();
    void this.api.myRecipes().then((list) => this.mine.set(list)).catch(() => undefined);
    void this.favorites.ensure();
    void this.habits.templates().then((list) => this.templates.set(list)).catch(() => undefined);
  }

  protected closeAdd(): void {
    closeSheet(this.sheet().nativeElement);
  }

  protected chooseRecipe(r: Recipe): void {
    this.chosen.set(r);
    this.servings.set(1);
  }

  private async plan(input: Parameters<PlanStore['add']>[0], what: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.add(input);
      this.closeAdd();
      this.toast.show(this.i18n.t('plan.planned', { name: what, day: this.dayInline(input.day) }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected addRecipe(day: string, r: Recipe): Promise<void> {
    return this.plan({ day, slot: this.slot(), recipeId: r.id, servings: this.servings() }, r.name);
  }

  protected addTemplate(day: string, t: MealTemplate): Promise<void> {
    return this.plan({ day, slot: this.slot(), templateId: t.id }, t.name);
  }

  protected addNote(day: string): Promise<void> {
    const n = this.note().trim();
    return this.plan({ day, slot: this.slot(), note: n }, n);
  }

  protected async eat(p: PlanItem): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.eat(p);
      this.toast.show(this.i18n.t('plan.eatenToast', { name: p.name }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(p: PlanItem): Promise<void> {
    try {
      await this.store.remove(p.id);
      this.toast.show(this.i18n.t('plan.removed', { name: p.name }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  /** the recipes and usual meals of the week shown, from today, on the shopping list */
  protected async toShopping(): Promise<void> {
    const days = this.days().filter((d) => d.day >= this.today);
    if (!days.length) return;
    this.busy.set(true);
    try {
      this.shopping.set(await this.store.toShopping(days[0].day, days[days.length - 1].day));
      this.toast.show(this.i18n.t('plan.shoppingDone'), 'info', 5000, {
        label: this.i18n.t('shopping.see'),
        run: () => void this.router.navigate(['/app/meals/shopping']),
      });
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}

function sum(list: PlanItem[]): number {
  return list.reduce((t, p) => t + (p.kcal ?? 0), 0);
}
