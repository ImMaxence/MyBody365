import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import type { Food } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { DRINKS, SHARES, healthOf } from '../../core/meals/fast-food';
import { MealsApi } from '../../core/meals/meals-api';
import {
  BREADS,
  Bread,
  Filling,
  GROUPS,
  INGREDIENTS,
  Ingredient,
  MAX_PORTIONS,
  OtherFood,
  PRESETS,
  bread,
  portionKcal,
  sandwichHealth,
  totals,
} from '../../core/meals/sandwich';
import { closeSheet } from '../../core/ui/sheets';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { IconComponent } from '../../shared/icon.component';
import { ESTIMATE_STYLES, EstimatedItem } from './fast-food-sheet.component';

/** a bag of crisps with it (the fast-food sheet's) */
const CRISPS = { key: 'crisps', kcal: 160, proteinG: 2, carbsG: 15, fatG: 10, grams: 30, sugarsG: 0.2, satFatG: 1, saltG: 0.4, fiberG: 1.2 };
/** an ingredient of the table, by the gram: its first amount and each step */
const OTHER_GRAMS = 30;
const OTHER_STEP = 10;

/**
 * 1.17: « Sandwich », made up: a classic to start from or nothing, the bread and its size, then what goes inside portion
 * by portion (tap an ingredient to add it, again for one more), any raw food of the table by the gram, the share eaten,
 * crisps and a drink. The sandwich is added on one line named after what is in it; crisps and the drink on their own.
 */
@Component({
  selector: 'app-sandwich-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, HealthScoreComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="'meals.sandwich.title' | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div>
          <h2 class="h3"><span aria-hidden="true">🥪</span> {{ 'meals.sandwich.title' | t }}</h2>
          <p class="small muted">{{ 'meals.sandwich.text' | t }}</p>
        </div>

        <h3 class="section-title">{{ 'meals.sandwich.presets' | t }}</h3>
        <div class="chips" role="group" [attr.aria-label]="'meals.sandwich.presets' | t">
          @for (p of presets; track p.key) {
            <button type="button" class="chip-opt" [attr.aria-pressed]="preset() === p.key" (click)="usePreset(p.key)">
              {{ 'meals.sandwich.presetNames.' + p.key | t }}
            </button>
          }
        </div>

        <h3 class="section-title">{{ 'meals.sandwich.bread' | t }}</h3>
        <div class="chips" role="radiogroup" [attr.aria-label]="'meals.sandwich.bread' | t">
          @for (b of breads; track b.key) {
            <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="breadKey() === b.key" (click)="pickBread(b)">
              {{ 'meals.sandwich.breads.' + b.key | t }}
            </button>
          }
        </div>
        @if (currentBread().sizes.length > 1) {
          <div class="chips" role="radiogroup" [attr.aria-label]="'meals.sandwich.size' | t">
            @for (s of currentBread().sizes; track s.key) {
              <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="size() === s.key" (click)="size.set(s.key); preset.set(null)">
                {{ 'meals.sandwich.sizes.' + s.key | t }} <small class="num">{{ i18n.number(breadKcal(s.grams)) }}</small>
              </button>
            }
          </div>
        }

        <h3 class="section-title">{{ 'meals.sandwich.inside' | t }}</h3>
        @if (inside().length || others().length) {
          <ul class="inside" role="list">
            @for (x of inside(); track x.item.key) {
              <li>
                <span class="in-name">
                  {{ 'meals.sandwich.items.' + x.item.key | t }}
                  <small class="num">{{ unitText(x.item, x.n) }} · {{ i18n.number(x.item.grams * x.n) }} g</small>
                </span>
                <span class="in-kcal num">{{ i18n.number(portionKcal(x.item, x.n)) }} kcal</span>
                <span class="step">
                  <button type="button" class="step-btn" [attr.aria-label]="'meals.sandwich.less' | t: { name: ('meals.sandwich.items.' + x.item.key | t) }" (click)="less(x.item.key)">
                    <app-icon name="minus" [size]="16" />
                  </button>
                  <span class="num n" aria-hidden="true">{{ x.n }}</span>
                  <button type="button" class="step-btn" [disabled]="x.n >= max" [attr.aria-label]="'meals.sandwich.more' | t: { name: ('meals.sandwich.items.' + x.item.key | t) }" (click)="more(x.item.key)">
                    <app-icon name="plus" [size]="16" />
                  </button>
                </span>
              </li>
            }
            @for (o of others(); track o.id) {
              <li>
                <span class="in-name">{{ o.name }} <small class="num">{{ i18n.number(o.grams) }} g</small></span>
                <span class="in-kcal num">{{ i18n.number(Math.round(((o.per100.kcal ?? 0) * o.grams) / 100)) }} kcal</span>
                <span class="step">
                  <button type="button" class="step-btn" [attr.aria-label]="'meals.sandwich.less' | t: { name: o.name }" (click)="otherBy(o.id, -1)">
                    <app-icon name="minus" [size]="16" />
                  </button>
                  <button type="button" class="step-btn" [attr.aria-label]="'meals.sandwich.more' | t: { name: o.name }" (click)="otherBy(o.id, 1)">
                    <app-icon name="plus" [size]="16" />
                  </button>
                </span>
              </li>
            }
          </ul>
        } @else {
          <p class="small muted">{{ 'meals.sandwich.empty' | t }}</p>
        }
        <p class="tiny muted">{{ 'meals.sandwich.tapHint' | t }}</p>

        @for (g of groups; track g) {
          <span class="label">{{ 'meals.sandwich.groups.' + g | t }}</span>
          <div class="chips" role="group" [attr.aria-label]="'meals.sandwich.groups.' + g | t">
            @for (x of byGroup[g]; track x.key) {
              @let n = filling()[x.key] ?? 0;
              <button type="button" class="chip-opt" [attr.aria-pressed]="n > 0" [disabled]="n >= max" (click)="more(x.key)">
                {{ 'meals.sandwich.items.' + x.key | t }}
                @if (n > 1) {
                  <b class="times num">×{{ n }}</b>
                }
                <small class="num">+{{ i18n.number(portionKcal(x)) }}</small>
              </button>
            }
          </div>
        }

        <div class="field other">
          <label class="label" for="sw-other">{{ 'meals.sandwich.other' | t }}</label>
          <input class="input" id="sw-other" type="search" enterkeyhint="search" autocomplete="off" maxlength="60"
            [placeholder]="'meals.sandwich.otherPlaceholder' | t" [value]="query()" (input)="search($any($event.target).value)" />
        </div>
        @if (results().length) {
          <ul class="results" role="list">
            @for (f of results(); track f.id) {
              <li>
                <button type="button" (click)="addOther(f)">
                  <span class="r-name">{{ f.name }}</span>
                  <small class="num">{{ 'meals.sandwich.per100' | t: { kcal: i18n.number(Math.round(f.per100.kcal)) } }}</small>
                  <app-icon name="plus" [size]="16" />
                </button>
              </li>
            }
          </ul>
        } @else if (query().trim().length >= 2 && !searching()) {
          <p class="tiny muted">{{ 'meals.sandwich.otherNone' | t }}</p>
        }

        <h3 class="section-title">{{ 'meals.estimate.share' | t }}</h3>
        <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.share' | t">
          @for (sh of shares; track sh.key) {
            <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="share() === sh.part" (click)="share.set(sh.part)">
              {{ 'meals.estimate.shares.' + sh.key | t }}
            </button>
          }
        </div>

        <h3 class="section-title">{{ 'meals.estimate.extras' | t }}</h3>
        <div class="chips">
          <button type="button" class="chip-opt" [attr.aria-pressed]="crisps()" (click)="crisps.set(!crisps())">
            {{ 'meals.estimate.extraNames.crisps' | t }} <small class="num">+{{ crispsItem.kcal }}</small>
          </button>
        </div>

        <h3 class="section-title">{{ 'meals.estimate.drink' | t }}</h3>
        <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.drink' | t">
          @for (x of drinks; track x.key) {
            <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="drink() === x.key" (click)="drink.set(x.key)">
              {{ 'meals.estimate.drinks.' + x.key | t }}
              @if (x.kcal > 1) {
                <small class="num">{{ i18n.number(x.kcal) }}</small>
              }
            </button>
          }
        </div>

        <section class="total" aria-live="polite">
          <div class="total-head">
            <span class="small muted">{{ 'meals.sandwich.total' | t }}</span>
            <b class="num">≈ {{ i18n.number(all().kcal) }} kcal</b>
          </div>
          <p class="tiny muted num">
            {{ 'meals.estimate.macros' | t: { p: i18n.number(sandwich().proteinG, 0), c: i18n.number(sandwich().carbsG, 0), f: i18n.number(sandwich().fatG, 0) } }}
            · {{ i18n.number(sandwich().grams) }} g
          </p>
          @if (health() != null) {
            <div class="total-ns">
              <span class="small">{{ 'meals.sandwich.grade' | t }}</span>
              <app-health-score [score]="health()!" />
            </div>
          }
        </section>

        <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="add()">
          <app-icon name="plus" /> {{ 'meals.estimate.add' | t: { slot: slotLower() } }}
        </button>
        <p class="tiny muted center">{{ 'meals.sandwich.note' | t }}</p>
      </div>
    </dialog>
  `,
  styles: [
    ESTIMATE_STYLES,
    `
      .chip-opt .times {
        font-size: 12px;
        font-weight: 800;
      }
      .chip-opt:disabled {
        opacity: 0.55;
      }
      .inside,
      .results {
        display: grid;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .inside li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 10px;
        padding: 8px 8px 8px 14px;
        border-radius: var(--radius-m);
        background: var(--surface-2);
        animation: pop var(--dur-2) var(--ease-out);
      }
      @keyframes pop {
        from {
          opacity: 0;
          transform: scale(0.97);
        }
      }
      .in-name {
        display: grid;
        min-width: 0;
        font-weight: 650;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      .in-name small,
      .results small {
        font-size: 12px;
        font-weight: 550;
        color: var(--fg-2);
      }
      .in-kcal {
        font-size: var(--fs-s);
        color: var(--fg-2);
        white-space: nowrap;
      }
      .step {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .step .n {
        min-width: 1.2em;
        text-align: center;
        font-weight: 750;
      }
      .step-btn {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: var(--surface);
        box-shadow: inset 0 0 0 1px var(--line-strong);
        color: var(--fg);
      }
      .step-btn:disabled {
        opacity: 0.4;
      }
      .step-btn.is-pressed {
        transform: scale(0.94);
      }
      .label {
        margin-bottom: -4px;
      }
      .other {
        margin-top: var(--space-1);
      }
      .results button {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 44px;
        padding: 8px 12px 8px 14px;
        border-radius: var(--radius-m);
        background: var(--surface-2);
        text-align: left;
      }
      .r-name {
        min-width: 0;
        overflow-wrap: anywhere;
        font-weight: 600;
      }
    `,
  ],
})
export class SandwichSheetComponent {
  /** the meal it goes to, for the button */
  readonly slotLabel = input('');
  protected readonly slotLower = computed(() => this.slotLabel().charAt(0).toLowerCase() + this.slotLabel().slice(1));
  readonly busy = signal(false);
  /** the lines to add: the sandwich, then crisps and the drink when taken */
  readonly confirm = output<EstimatedItem[]>();
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(MealsApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly presets = PRESETS;
  protected readonly breads = BREADS;
  protected readonly groups = GROUPS;
  protected readonly byGroup = Object.fromEntries(GROUPS.map((g) => [g, INGREDIENTS.filter((x) => x.group === g)])) as Record<string, Ingredient[]>;
  protected readonly shares = SHARES;
  protected readonly drinks = DRINKS;
  protected readonly crispsItem = CRISPS;
  protected readonly max = MAX_PORTIONS;
  protected readonly Math = Math;
  protected readonly portionKcal = portionKcal;

  protected readonly preset = signal<string | null>(null);
  protected readonly breadKey = signal('baguette');
  protected readonly size = signal('half');
  protected readonly filling = signal<Filling>({});
  protected readonly others = signal<OtherFood[]>([]);
  protected readonly share = signal(1);
  protected readonly crisps = signal(false);
  protected readonly drink = signal('none');
  protected readonly query = signal('');
  protected readonly results = signal<Food[]>([]);
  protected readonly searching = signal(false);

  protected readonly currentBread = computed(() => bread(this.breadKey()));
  /** what is in it, in the order of the groups (meat, cheese, vegetables, sauces) */
  protected readonly inside = computed(() => {
    const f = this.filling();
    return INGREDIENTS.filter((x) => (f[x.key] ?? 0) > 0).map((item) => ({ item, n: f[item.key] }));
  });
  protected readonly sandwich = computed(() => totals(this.breadKey(), this.size(), this.filling(), this.others(), this.share()));
  protected readonly health = computed(() => sandwichHealth(this.breadKey(), this.size(), this.filling(), this.others()));
  /** the sandwich, the crisps and the drink */
  protected readonly all = computed(() => {
    const d = DRINKS.find((x) => x.key === this.drink());
    return { kcal: this.sandwich().kcal + (this.crisps() ? CRISPS.kcal : 0) + (d && d.key !== 'none' ? d.kcal : 0) };
  });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private asked = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearTimeout(this.timer);
    });
  }

  open(): void {
    this.preset.set(null);
    this.breadKey.set('baguette');
    this.size.set('half');
    this.filling.set({});
    this.others.set([]);
    this.share.set(1);
    this.crisps.set(false);
    this.drink.set('none');
    this.query.set('');
    this.results.set([]);
    this.busy.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dialog().nativeElement);
  }

  protected usePreset(key: string): void {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    this.preset.set(key);
    this.breadKey.set(p.bread);
    this.size.set(p.size);
    this.filling.set({ ...p.filling });
    this.others.set([]);
  }

  protected pickBread(b: Bread): void {
    if (this.breadKey() === b.key) return;
    // the same size when the new bread has it (⅓ of a cereal baguette), else its usual one
    const keep = b.sizes.some((s) => s.key === this.size());
    this.breadKey.set(b.key);
    if (!keep) this.size.set(b.usual);
    this.preset.set(null);
  }

  protected breadKcal(grams: number): number {
    return Math.round((this.currentBread().per100[0] * grams) / 100);
  }

  protected more(key: string): void {
    this.filling.update((f) => ({ ...f, [key]: Math.min(MAX_PORTIONS, (f[key] ?? 0) + 1) }));
    this.preset.set(null);
  }

  protected less(key: string): void {
    this.filling.update((f) => {
      const n = (f[key] ?? 0) - 1;
      const next = { ...f };
      if (n > 0) next[key] = n;
      else delete next[key];
      return next;
    });
    this.preset.set(null);
  }

  /** « 2 tranches », « 1 œuf », « 3 cuillères » */
  protected unitText(x: Ingredient, n: number): string {
    return this.i18n.t(`meals.sandwich.units.${x.unit}.${n === 1 ? 'one' : 'many'}`, { n });
  }

  // ── any raw food of the table, by the gram ────────────────────────────────

  protected search(q: string): void {
    this.query.set(q);
    if (this.timer) clearTimeout(this.timer);
    if (q.trim().length < 2) {
      this.results.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    const asked = ++this.asked;
    this.timer = setTimeout(() => {
      this.api
        .search(q.trim(), 'ciqual')
        .then((list) => {
          if (asked === this.asked) this.results.set(list.filter((f) => !f.liquid).slice(0, 6));
        })
        .catch(() => {
          if (asked === this.asked) this.results.set([]);
        })
        .finally(() => {
          if (asked === this.asked) this.searching.set(false);
        });
    }, 300);
  }

  protected addOther(f: Food): void {
    const n = f.per100;
    this.others.update((list) =>
      list.some((o) => o.id === f.id)
        ? list.map((o) => (o.id === f.id ? { ...o, grams: o.grams + OTHER_STEP } : o))
        : [
            ...list,
            {
              id: f.id,
              name: f.name,
              grams: OTHER_GRAMS,
              per100: { kcal: n.kcal, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, sugarsG: n.sugarsG, satFatG: n.satFatG, saltG: n.saltG, fiberG: n.fiberG },
            },
          ],
    );
    this.query.set('');
    this.results.set([]);
    this.preset.set(null);
  }

  protected otherBy(id: string, dir: 1 | -1): void {
    this.others.update((list) =>
      list.map((o) => (o.id === id ? { ...o, grams: o.grams + dir * OTHER_STEP } : o)).filter((o) => o.grams > 0 && o.grams <= 500),
    );
  }

  // ── added ─────────────────────────────────────────────────────────────────

  /** « Sandwich jambon, emmental, beurre (½ baguette) », a classic by its name; 120 characters at most */
  private lineName(): string {
    const b = this.currentBread();
    const sizeKey = b.sizes.find((s) => s.key === this.size())?.key ?? b.usual;
    const breadLine = this.i18n.t('meals.sandwich.breadLines.' + b.key);
    const sizeLine = this.i18n.t('meals.sandwich.sizes.' + sizeKey).toLowerCase();
    const of =
      b.key === 'baguette'
        ? this.i18n.t('meals.sandwich.sizes.' + sizeKey)
        : b.sizes.length > 1 && sizeKey !== 'one'
          ? `${breadLine}, ${sizeLine}`
          : breadLine;
    const p = this.preset();
    const what = p
      ? this.i18n.t('meals.sandwich.presetLines.' + p)
      : [...this.inside().map((x) => this.i18n.t('meals.sandwich.items.' + x.item.key).toLowerCase()), ...this.others().map((o) => o.name.split(',')[0].toLowerCase())].join(', ');
    const share = SHARES.find((x) => x.part === this.share());
    const s = share && share.part !== 1 ? `, ${this.i18n.t('meals.estimate.shareLines.' + share.key)}` : '';
    const name = `${this.i18n.t('meals.sandwich.line')}${what ? ' ' + what : ''} (${of}${s})`;
    return name.length > 120 ? name.slice(0, 119).trimEnd() + '…' : name;
  }

  protected add(): void {
    const t = this.sandwich();
    const items: EstimatedItem[] = [
      {
        name: this.lineName(),
        kcal: t.kcal,
        proteinG: t.proteinG,
        carbsG: t.carbsG,
        fatG: t.fatG,
        sugarsG: t.sugarsG,
        satFatG: t.satFatG,
        saltG: t.saltG,
        fiberG: t.fiberG,
        health: this.health(),
      },
    ];
    if (this.crisps()) {
      items.push({ name: this.i18n.t('meals.estimate.extraNames.crisps'), ...pick(CRISPS), health: healthOf(CRISPS, 'extra') });
    }
    const d = DRINKS.find((x) => x.key === this.drink());
    if (d && d.key !== 'none') {
      items.push({ name: this.i18n.t('meals.estimate.drinks.' + d.key), ...pick(d), health: healthOf(d, 'drink') });
    }
    this.confirm.emit(items);
  }
}

function pick(x: { kcal: number; proteinG: number; carbsG: number; fatG: number; sugarsG?: number; satFatG?: number; saltG?: number; fiberG?: number }) {
  return { kcal: x.kcal, proteinG: x.proteinG, carbsG: x.carbsG, fatG: x.fatG, sugarsG: x.sugarsG, satFatG: x.satFatG, saltG: x.saltG, fiberG: x.fiberG };
}
