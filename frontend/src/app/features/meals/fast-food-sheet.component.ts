import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DRINKS, Dish, FRIES, Portion, SHARES, dish, estimate, extrasFor, healthOf, part, pieces, timesOf, withChoice } from '../../core/meals/fast-food';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { healthBand } from '../../core/meals/health';
import type { Grade } from '../../core/meals/nutriscore';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { closeSheet } from '../../core/ui/sheets';
import { IconComponent } from '../../shared/icon.component';

/** what the meal page adds: one line per item (the dish, its fries, an extra, the drink) */
export interface EstimatedItem {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarsG?: number;
  satFatG?: number;
  saltG?: number;
  fiberG?: number;
  nutriscore?: Grade;
  /** 1.13: the estimated health score, out of 10 */
  health?: number | null;
}

/** the look of the estimate sheets (fast food, drinks): choices as cards and chips, the total */
export const ESTIMATE_STYLES = `
    .opts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .opt {
      display: grid;
      gap: 2px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      box-shadow: inset 0 0 0 1px var(--line);
      text-align: left;
      transition: background-color var(--dur-2), box-shadow var(--dur-2), transform var(--dur-1) var(--ease-out);
    }
    .opt:active,
    .chip-opt:active {
      transform: scale(0.97);
    }
    .opt[aria-checked='true'] {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent);
    }
    .opt-name {
      font-weight: 650;
      line-height: 1.25;
    }
    .opt-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .opt-kcal {
      font-size: var(--fs-s);
      color: var(--fg-2);
    }
    /* a portion's estimated Nutri-Score: its letter in the colour of the scale */
    .ns {
      display: inline-grid;
      place-items: center;
      width: 20px;
      height: 20px;
      flex: none;
      align-self: center;
      border-radius: 6px;
      font-style: normal;
      font-size: 11px;
      font-weight: 800;
      color: #fff;
    }
    /* 1.13: the health score of an option, on the tint of its band */
    .hs {
      display: inline-grid;
      place-items: center;
      min-width: 26px;
      height: 20px;
      padding: 0 5px;
      flex: none;
      align-self: center;
      border-radius: 999px;
      font: 800 11px var(--font-ui);
      font-style: normal;
      --hs: #1f9d55;
      /* opaque, and the text half-way to the ink: readable on a chosen chip too (contrast 4.5:1) */
      background: color-mix(in srgb, var(--hs) 16%, var(--surface));
      color: color-mix(in srgb, var(--hs) 50%, var(--fg));
    }
    .hs[data-band='good'] {
      --hs: #5fae2e;
    }
    .hs[data-band='fair'] {
      --hs: #d19a00;
    }
    .hs[data-band='weak'] {
      --hs: #e2711d;
    }
    .hs[data-band='poor'] {
      --hs: #e5484d;
    }
    .ns[data-g='a'] {
      background: #038141;
    }
    .ns[data-g='b'] {
      background: #4f7a1d;
    }
    .ns[data-g='c'] {
      background: #fecb02;
      color: #16130f;
    }
    .ns[data-g='d'] {
      background: #ee8100;
      color: #16130f;
    }
    .ns[data-g='e'] {
      background: #c8330b;
    }
    .total-ns {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-top: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--line);
    }
    .opt[aria-checked='true'] .opt-kcal {
      color: var(--accent-text);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip-opt {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      min-height: 40px;
      padding: 9px 14px;
      border-radius: var(--radius-pill);
      box-shadow: inset 0 0 0 1px var(--line-strong);
      color: var(--fg-2);
      font-size: var(--fs-s);
      font-weight: 650;
      transition: background-color var(--dur-2), color var(--dur-2), transform var(--dur-1) var(--ease-out);
    }
    /* the calories of a choice: smaller, in the secondary ink (contrast AA, no transparency) */
    .chip-opt small {
      font-size: 11px;
      font-weight: 600;
      color: var(--fg-2);
    }
    .chip-opt[aria-checked='true'] small,
    .chip-opt[aria-pressed='true'] small {
      color: var(--accent-text);
    }
    /* 1.17: an extra taken several times (soy sauce by the spoon) */
    .chip-opt .times {
      font-size: 12px;
      font-weight: 800;
    }
    .chip-opt[aria-checked='true'],
    .chip-opt[aria-pressed='true'] {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent);
      color: var(--accent-text);
    }
    .total {
      display: grid;
      gap: 2px;
      padding: 14px 16px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .total-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .total b {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .center {
      text-align: center;
    }
  `;

/**
 * A meal at the snack bar or the restaurant, by estimate: the format, fries with it, a sauce, a drink.
 * The total updates at each choice; each item is then added on its own line (handy in the statistics).
 */
@Component({
  selector: 'app-fast-food-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HealthScoreComponent, TranslatePipe, IconComponent, NumberStepperComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="d() ? ('meals.quick.dishes.' + d()!.key | t) : ''">
      <div class="sheet-grip"></div>
      @if (d(); as dish) {
        <div class="stack">
          <div>
            <h2 class="h3"><span aria-hidden="true">{{ dish.emoji }}</span> {{ 'meals.quick.dishes.' + dish.key | t }}</h2>
            <p class="small muted">{{ 'meals.estimate.text' | t }}</p>
          </div>

          @if (dish.kinds; as k) {
            <!-- 1.17: the kind of piece (a sashimi has no rice: about half a nigiri) -->
            <h3 class="section-title">{{ 'meals.estimate.kinds.' + dish.key + '.title' | t }}</h3>
            <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.kinds.' + dish.key + '.title' | t">
              @for (o of k.options; track o.key) {
                <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="kind() === o.key" (click)="kind.set(o.key)">
                  {{ 'meals.estimate.kinds.' + dish.key + '.' + o.key | t }} <small class="num">{{ 'meals.estimate.perPiece' | t: { kcal: i18n.number(o.kcal) } }}</small>
                </button>
              }
            </div>
          }

          <h3 class="section-title">{{ 'meals.estimate.format' | t }}</h3>
          <div class="opts" role="radiogroup" [attr.aria-label]="'meals.estimate.format' | t">
            @for (f of dish.formats; track f.key) {
              <button type="button" class="opt" role="radio" [attr.aria-checked]="dish.pieces ? count() === dish.pieces.of[f.key] : format() === f.key" (click)="pick(f.key)">
                <span class="opt-name">{{ 'meals.estimate.formats.' + dish.key + '.' + f.key | t }}</span>
                <span class="opt-foot">
                  <span class="opt-kcal num">≈ {{ i18n.number(chosen(f).kcal) }} kcal</span>
                  @let h = health(chosen(f), 'main');
                  @if (h != null) {
                    <i class="hs" [attr.data-band]="band(h)" [attr.aria-label]="'meals.estimate.gradeOf' | t: { g: i18n.number(h, 1) }">{{ i18n.number(h, h % 1 ? 1 : 0) }}</i>
                  }
                </span>
              </button>
            }
          </div>

          @if (dish.pieces; as pc) {
            <!-- 1.16: the exact number of pieces (9, 14…), the formats above being shortcuts -->
            <app-number-stepper [(value)]="count" [step]="1" [min]="1" [max]="pc.max" [decimals]="0" [compact]="true"
              [unit]="'meals.estimate.piecesUnit' | t" [label]="'meals.estimate.pieces' | t"
              [minusLabel]="'meals.estimate.piecesLess' | t" [plusLabel]="'meals.estimate.piecesMore' | t" />
          }

          @if (dish.share) {
            <h3 class="section-title">{{ 'meals.estimate.share' | t }}</h3>
            <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.share' | t">
              @for (sh of shares; track sh.key) {
                <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="share() === sh.part" (click)="share.set(sh.part)">
                  {{ 'meals.estimate.shares.' + sh.key | t }}
                </button>
              }
            </div>
          }

          @if (dish.choice; as c) {
            <h3 class="section-title">{{ 'meals.estimate.choices.' + c.key + '.title' | t }}</h3>
            <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.choices.' + c.key + '.title' | t">
              @for (o of c.options; track o.key) {
                <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="choice() === o.key" (click)="choice.set(o.key)">
                  {{ 'meals.estimate.choices.' + c.key + '.' + o.key | t }}
                  @if (choiceKcal(o); as k) {
                    <small class="num">{{ k > 0 ? '+' : '−' }}{{ i18n.number(Math.abs(k)) }}</small>
                  }
                </button>
              }
            </div>
          }

          @if (dish.fries) {
            <h3 class="section-title">{{ 'meals.estimate.fries' | t }}</h3>
            <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.fries' | t">
              @for (f of friesOptions; track f.key) {
                <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="fries() === f.key" (click)="fries.set(f.key)">
                  {{ 'meals.estimate.friesSizes.' + f.key | t }}
                  @if (f.kcal) {
                    <small class="num">{{ i18n.number(f.kcal) }}</small>
                  }
                  @let h = health(f, 'fries');
                  @if (h != null) {
                    <i class="hs" [attr.data-band]="band(h)" [attr.aria-label]="'meals.estimate.gradeOf' | t: { g: i18n.number(h, 1) }">{{ i18n.number(h, h % 1 ? 1 : 0) }}</i>
                  }
                </button>
              }
            </div>
          }

          @if (offered().length) {
            <h3 class="section-title">{{ 'meals.estimate.extras' | t }}</h3>
            <div class="chips" role="group" [attr.aria-label]="'meals.estimate.extras' | t">
              @for (x of offered(); track x.key) {
                @let n = times(x);
                <button type="button" class="chip-opt" [attr.aria-pressed]="n > 0" (click)="toggle(x)">
                  {{ 'meals.estimate.extraNames.' + x.key | t }}
                  @if (n > 1) {
                    <b class="times num">×{{ n }}</b>
                  }
                  <small class="num">+{{ i18n.number(x.kcal * Math.max(1, n)) }}</small>
                  @let h = health(x, 'extra');
                  @if (h != null) {
                    <i class="hs" [attr.data-band]="band(h)" [attr.aria-label]="'meals.estimate.gradeOf' | t: { g: i18n.number(h, 1) }">{{ i18n.number(h, h % 1 ? 1 : 0) }}</i>
                  }
                </button>
              }
            </div>
            @if (hasSoy()) {
              <p class="tiny muted">{{ 'meals.estimate.soyNote' | t }}</p>
            }
            @if (hasOil()) {
              <p class="tiny muted">{{ 'meals.estimate.oilNote' | t }}</p>
            }
          }

          <h3 class="section-title">{{ 'meals.estimate.drink' | t }}</h3>
          <div class="chips" role="radiogroup" [attr.aria-label]="'meals.estimate.drink' | t">
            @for (x of drinks; track x.key) {
              <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="drink() === x.key" (click)="drink.set(x.key)">
                {{ 'meals.estimate.drinks.' + x.key | t }}
                @if (x.kcal > 1) {
                  <small class="num">{{ i18n.number(x.kcal) }}</small>
                }
                @let h = health(x, 'drink');
                  @if (h != null) {
                  <i class="hs" [attr.data-band]="band(h)" [attr.aria-label]="'meals.estimate.gradeOf' | t: { g: i18n.number(h, 1) }">{{ i18n.number(h, h % 1 ? 1 : 0) }}</i>
                }
              </button>
            }
          </div>
          <p class="tiny muted">{{ 'meals.estimate.otherDrink' | t }}</p>

          <section class="total" aria-live="polite">
            <div class="total-head">
              <span class="small muted">{{ 'meals.estimate.total' | t }}</span>
              <b class="num">≈ {{ i18n.number(result().total.kcal) }} kcal</b>
            </div>
            <p class="tiny muted num">
              {{ 'meals.estimate.macros' | t: { p: i18n.number(result().total.proteinG), c: i18n.number(result().total.carbsG), f: i18n.number(result().total.fatG) } }}
            </p>
            @if (result().health != null) {
              <div class="total-ns">
                <span class="small">{{ 'meals.estimate.mealGrade' | t }}</span>
                <app-health-score [score]="result().health!" />
              </div>
            }
          </section>

          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="add()">
            <app-icon name="plus" /> {{ 'meals.estimate.add' | t: { slot: slotLower() } }}
          </button>
          <p class="tiny muted center">{{ 'meals.estimate.note' | t }}</p>
        </div>
      }
    </dialog>
  `,
  styles: ESTIMATE_STYLES,
})
export class FastFoodSheetComponent {
  /** the meal it goes to, for the button */
  readonly slotLabel = input('');
  /** « Au déjeuner » → « Ajouter au déjeuner » */
  protected readonly slotLower = computed(() => this.slotLabel().charAt(0).toLowerCase() + this.slotLabel().slice(1));
  readonly busy = signal(false);
  /** the items to add, one per line */
  readonly confirm = output<EstimatedItem[]>();
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly d = signal<Dish | null>(null);
  protected readonly format = signal('');
  protected readonly fries = signal('none');
  protected readonly extras = signal<string[]>([]);
  protected readonly drink = signal('none');
  protected readonly choice = signal('');
  protected readonly share = signal(1);
  /** 1.16: the pieces, for a dish counted piece by piece (sushi) */
  protected readonly count = signal(0);
  /** 1.17: the kind of piece (sushi) */
  protected readonly kind = signal('');
  protected readonly shares = SHARES;
  /** the extras of the format chosen (the soy sauces with a poke bowl only) */
  protected readonly offered = computed(() => {
    const d = this.d();
    return d ? extrasFor(d, this.format()) : [];
  });
  protected readonly hasSoy = computed(() => this.offered().some((x) => x.key === 'soy' || x.key === 'soySweet'));
  protected readonly hasOil = computed(() => this.offered().some((x) => x.key === 'chiliOil'));
  protected readonly Math = Math;
  protected readonly friesOptions = FRIES;
  protected readonly drinks = DRINKS;

  protected readonly result = computed(() => {
    const d = this.d();
    return d
      ? estimate(d, this.format(), this.fries(), this.extras(), this.drink(), this.choice() || undefined, this.share(), d.pieces ? this.count() : undefined, this.kind() || undefined)
      : { lines: [], total: { key: 'total', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, grade: null, health: null };
  });

  open(key: string): void {
    const d = dish(key);
    if (!d) return;
    this.d.set(d);
    this.format.set(d.usual);
    this.fries.set('none');
    this.extras.set([]);
    this.drink.set('none');
    this.choice.set(d.choice?.usual ?? '');
    this.share.set(1);
    this.count.set(d.pieces?.of[d.usual] ?? 0);
    this.kind.set(d.kinds?.usual ?? '');
    this.busy.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dialog().nativeElement);
  }

  /** 1.13: the health score of an option (0 counts: a « 0 » shows) */
  protected health(x: Portion, kind: 'main' | 'fries' | 'extra' | 'drink'): number | null {
    const h = healthOf(x, kind, this.d()?.key);
    return h;
  }

  protected band(h: number): string {
    return healthBand(h);
  }

  /** a format as chosen (without its cheese sauce, on a cream base…) */
  protected chosen(f: Portion): Portion {
    const d = this.d();
    // 1.17: a format of pieces, of the kind chosen
    if (d?.kinds && d.pieces) return pieces(d, d.pieces.of[f.key], this.kind()) ?? f;
    const c = d?.choice;
    return part(withChoice(f, c?.options.find((o) => o.key === this.choice())), this.d()?.share ? this.share() : 1);
  }

  /** what an option adds to the format chosen (kcal), 0 for the one the formats count */
  protected choiceKcal(o: Portion): number {
    const f = this.d()?.formats.find((x) => x.key === this.format());
    return Math.round(o.kcal * (f?.scale ?? 1));
  }

  /** a format; for a dish counted piece by piece, its pieces */
  protected pick(key: string): void {
    this.format.set(key);
    const n = this.d()?.pieces?.of[key];
    if (n) this.count.set(n);
  }

  /** taken, or not; 1.17: an extra with a max (soy sauce) one more each tap, then none again */
  protected toggle(x: Portion): void {
    const n = this.times(x);
    this.extras.update((list) => {
      const rest = list.filter((k) => k !== x.key);
      return n >= (x.max ?? 1) ? rest : [...rest, ...Array<string>(n + 1).fill(x.key)];
    });
  }

  protected times(x: Portion): number {
    return timesOf(x, this.extras());
  }

  protected add(): void {
    const d = this.d();
    if (!d) return;
    const name = (kind: string, p: Portion) => {
      switch (kind) {
        case 'main': {
          // 1.16: « Sushi (9 pièces) »
          if (d.pieces) {
            const n = this.count();
            // 1.17: « Sushi, nigiri (9 pièces) »
            const k = d.kinds && this.kind() !== d.kinds.usual ? `, ${this.i18n.t('meals.estimate.kinds.' + d.key + '.lines.' + this.kind())}` : '';
            return `${this.i18n.t('meals.quick.dishes.' + d.key)}${k} (${this.i18n.t(n === 1 ? 'meals.estimate.piecesOne' : 'meals.estimate.piecesLine', { n })})`;
          }
          // « Tacos (M, sans sauce fromagère) », « Pizza (Entière, base crème) »
          const c = d.choice && this.choice() !== d.choice.usual ? `, ${this.i18n.t('meals.estimate.choices.' + d.choice.key + '.lines.' + this.choice())}` : '';
          const sh = SHARES.find((x) => x.part === this.share());
          const s = d.share && sh && sh.part !== 1 ? `, ${this.i18n.t('meals.estimate.shareLines.' + sh.key)}` : '';
          return `${this.i18n.t('meals.quick.dishes.' + d.key)} (${this.i18n.t('meals.estimate.formats.' + d.key + '.' + p.key)}${c}${s})`;
        }
        case 'fries':
          return `${this.i18n.t('meals.quick.dishes.fries')} (${this.i18n.t('meals.estimate.friesSizes.' + p.key)})`;
        case 'extra': {
          // 1.17: « Sauce soja salée (2 cuillères) »
          const n = this.times(p);
          const name = this.i18n.t('meals.estimate.extraNames.' + p.key);
          return n > 1 ? `${name} (${this.i18n.t('meals.estimate.spoons', { n })})` : name;
        }
        default:
          return this.i18n.t('meals.estimate.drinks.' + p.key);
      }
    };
    this.confirm.emit(
      this.result().lines.map((l) => ({
        name: name(l.kind, l.portion),
        kcal: l.portion.kcal,
        proteinG: l.portion.proteinG,
        carbsG: l.portion.carbsG,
        fatG: l.portion.fatG,
        sugarsG: l.portion.sugarsG,
        satFatG: l.portion.satFatG,
        saltG: l.portion.saltG,
        fiberG: l.portion.fiberG,
        nutriscore: l.grade ?? undefined,
        health: l.health,
      })),
    );
  }
}
