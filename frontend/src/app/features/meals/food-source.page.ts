import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Food, FoodSources, Nutrients, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { MealsStore, scaled, slotNow } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { FoodPickerComponent, Picked } from './food-picker.component';
import { QuantitySheetComponent } from './quantity-sheet.component';

const SLOTS: Slot[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

/**
 * A single source of foods (1.9), opened from « Ajouter un repas »: « Produits industriels » (Open Food Facts, with the
 * scanner) or « Aliments bruts » (the Ciqual table and my own foods, with « Créer un aliment »). Each says where its data
 * come from and how fresh they are. A food picked goes into the meal, and the app goes back to the meals.
 */
@Component({
  selector: 'app-food-source',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent, FoodPickerComponent, QuantitySheetComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.sources.' + source() + '.title' | t }}</h1>
      </header>

      <section class="card about" [class.off]="source() === 'off'">
        @if (source() === 'off') {
          <span class="logo off-logo"><img src="/brands/open-food-facts.svg" alt="Open Food Facts" width="52" height="52" /></span>
        } @else {
          <!-- the source said in words (the Anses logo is a registered design, not ours to show) -->
          <span class="logo ciqual-logo" role="img" aria-label="Ciqual">
            <app-icon name="leaf" [size]="22" />
            <b>Ciqual</b>
            <small>Anses</small>
          </span>
        }
        <div class="about-copy">
          <p class="small">{{ 'meals.sources.' + source() + '.page' | t }}</p>
          <p class="tiny muted fresh">
            <app-icon name="refresh" [size]="13" />
            @if (freshness(); as f) {
              {{ f }}
            } @else {
              <span class="skeleton line"></span>
            }
          </p>
        </div>
      </section>

      @if (source() === 'off') {
        <a class="btn btn-secondary btn-block" routerLink="/app/meals/scan"><app-icon name="barcode" /> {{ 'meals.search.scan' | t }}</a>
      }
      <app-food-picker
        [mode]="source()"
        [withExtras]="false"
        [placeholder]="'meals.sources.' + source() + '.placeholder' | t"
        [createLink]="source() === 'ciqual' ? '/app/meals/food/new' : null"
        (picked)="pick($event)"
      />
      <app-quantity-sheet (confirm)="add($event)" />
    </main>
  `,
  styles: `
    .about {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .logo {
      display: grid;
      place-items: center;
      flex: none;
      width: 64px;
      height: 64px;
      border-radius: 18px;
    }
    /* Open Food Facts' logo on white, in both themes, as its makers show it */
    .off-logo {
      background: #fff;
      border: 1px solid var(--line);
    }
    .ciqual-logo {
      align-content: center;
      gap: 0;
      background: color-mix(in srgb, var(--success, #1f9d55) 14%, transparent);
      color: var(--success, #1f9d55);
      line-height: 1.05;
    }
    .ciqual-logo b {
      font-size: 0.82rem;
      font-weight: 850;
      letter-spacing: 0.01em;
    }
    .ciqual-logo small {
      font-size: 0.66rem;
      font-weight: 750;
    }
    .about-copy {
      display: grid;
      gap: 6px;
      min-width: 0;
    }
    .about-copy p {
      margin: 0;
    }
    .fresh {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .line {
      display: inline-block;
      width: 140px;
      height: 10px;
      border-radius: 5px;
    }
  `,
})
export class FoodSourcePage {
  readonly slotParam = input<string | undefined>(undefined, { alias: 'slot' });
  readonly dayParam = input<string | undefined>(undefined, { alias: 'day' });
  protected readonly source = signal<'off' | 'ciqual'>(inject(ActivatedRoute).snapshot.data['source'] === 'off' ? 'off' : 'ciqual');
  private readonly api = inject(MealsApi);
  private readonly store = inject(MealsStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);
  private readonly sheet = viewChild.required(QuantitySheetComponent);
  private readonly sources = signal<FoodSources | null>(null);
  private current: { id: string; name: string; base: Nutrients } | null = null;

  protected readonly slot = computed<Slot>(() => {
    const s = this.slotParam() as Slot | undefined;
    return s && SLOTS.includes(s) ? s : slotNow();
  });
  protected readonly day = computed(() => (this.dayParam() && /^\d{4}-\d{2}-\d{2}$/.test(this.dayParam()!) ? this.dayParam()! : localDay()));

  /** « Données du 17 novembre 2026 · 412 388 produits », « Table 2025, à jour le 16 novembre 2026 · 3 341 aliments » */
  protected readonly freshness = computed(() => {
    const s = this.sources();
    if (!s) return null;
    const date = (at: string) => this.i18n.date(at, { day: 'numeric', month: 'long', year: 'numeric' });
    if (this.source() === 'off') {
      return s.offLocalAt
        ? `${this.i18n.t('meals.sources.off.updated', { date: date(s.offLocalAt) })} · ${this.i18n.t('meals.sources.off.count', { n: this.i18n.number(s.offProducts) })}`
        : this.i18n.t('meals.sources.off.live');
    }
    // « 2025_11_03 » is the 2025 table
    const version = /^d{4}/.exec(s.ciqualVersion ?? '')?.[0] ?? s.ciqualVersion ?? '';
    const head = s.ciqualAt
      ? this.i18n.t('meals.sources.ciqual.updated', { version, date: date(s.ciqualAt) })
      : this.i18n.t('meals.sources.ciqual.version', { version });
    return `${head} · ${this.i18n.t('meals.sources.ciqual.count', { n: this.i18n.number(s.ciqualFoods) })}`;
  });

  constructor() {
    void this.api
      .sources()
      .then((s) => this.sources.set(s))
      .catch(() => undefined);
    // back from the scanner or from a new food: its amount straight away
    effect(() => {
      const p = this.store.pick();
      if (!p || p.kind !== 'FOOD') return;
      this.store.pick.set(null);
      this.api
        .food(p.id)
        .then((f) => this.open(f))
        .catch((e) => this.toast.error(this.i18n.error(errorCode(e))));
    });
  }

  protected pick(p: Picked): void {
    if (p.kind === 'FOOD') this.open(p.food);
  }

  private open(f: Food): void {
    this.current = { id: f.id, name: f.name, base: f.per100 };
    this.sheet().open({
      name: f.name,
      detail: f.brand ?? f.category ?? this.i18n.t('meals.search.sources.' + f.source),
      unit: 'g',
      base: f.per100,
      servingG: f.servingG,
      nutriscore: f.nutriscore,
      estimated: f.nutriscoreEstimated,
      food: f,
      day: this.day(),
    });
  }

  protected async add(grams: number): Promise<void> {
    const c = this.current;
    if (!c) return;
    this.sheet().busy.set(true);
    try {
      await this.store.add({ day: this.day(), slot: this.slot(), foodId: c.id, grams }, { name: c.name, nutrients: scaled(c.base, grams / 100) });
      this.sheet().close();
      this.toast.show(this.store.lastQueued() ? this.i18n.t('offline.queued') : this.i18n.t('meals.search.added', { name: c.name }));
      // back to the meals, past « Ajouter un repas »
      this.stack.backTo('/app/meals');
    } catch (e) {
      this.sheet().busy.set(false);
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }
}
