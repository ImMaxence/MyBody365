import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { HotDrink, MILK_KINDS, MilkKind, drinkTotal, hotDrink } from '../../core/meals/hot-drinks';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { closeSheet } from '../../core/ui/sheets';
import { IconComponent } from '../../shared/icon.component';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { ESTIMATE_STYLES, EstimatedItem } from './fast-food-sheet.component';

/**
 * An everyday drink by estimate: a coffee (espresso to latte), a tea, an infusion, a matcha, a hot chocolate,
 * with the milk, the sugar and the extras. One line is added to the meal, with its Nutri-Score (drinks' scale).
 */
@Component({
  selector: 'app-drink-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HealthScoreComponent, TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="d() ? ('meals.drinks.names.' + d()!.key | t) : ''">
      <div class="sheet-grip"></div>
      @if (d(); as drink) {
        <div class="stack">
          <div>
            <h2 class="h3"><span aria-hidden="true">{{ drink.emoji }}</span> {{ 'meals.drinks.names.' + drink.key | t }}</h2>
            <p class="small muted">{{ 'meals.drinks.text' | t }}</p>
          </div>

          @if (drink.formats.length > 1) {
            <h3 class="section-title">{{ 'meals.drinks.format' | t }}</h3>
            <div class="opts" role="radiogroup" [attr.aria-label]="'meals.drinks.format' | t">
              @for (f of drink.formats; track f.key) {
                <button type="button" class="opt" role="radio" [attr.aria-checked]="format() === f.key" (click)="format.set(f.key)">
                  <span class="opt-name">{{ 'meals.drinks.formats.' + drink.key + '.' + f.key | t }}</span>
                  <span class="opt-foot">
                    <span class="opt-kcal num">≈ {{ i18n.number(kcalOf(f.key)) }} kcal</span>
                  </span>
                </button>
              }
            </div>
          }

          @if (drink.dash && !formatMilk()) {
            <div class="chips">
              <button type="button" class="chip-opt" [attr.aria-pressed]="dash()" (click)="dash.set(!dash())">
                🥛 {{ 'meals.drinks.dash' | t }}
              </button>
            </div>
          }

          @if (total().milkMl > 0) {
            <h3 class="section-title">{{ 'meals.drinks.milk' | t }}</h3>
            <div class="chips" role="radiogroup" [attr.aria-label]="'meals.drinks.milk' | t">
              @for (m of milks; track m) {
                <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="milk() === m" (click)="milk.set(m)">
                  {{ 'meals.drinks.milks.' + m | t }}
                </button>
              }
            </div>
          }

          <h3 class="section-title">{{ 'meals.drinks.sugar' | t }}</h3>
          <div class="chips" role="radiogroup" [attr.aria-label]="'meals.drinks.sugar' | t">
            @for (n of sugarCounts; track n) {
              <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="sugars() === n" (click)="sugars.set(n)">
                {{ (n === 0 ? 'meals.drinks.noSugar' : n === 1 ? 'meals.drinks.oneSugar' : 'meals.drinks.sugars') | t: { n: n } }}
                @if (n) {
                  <small class="num">+{{ n * 20 }}</small>
                }
              </button>
            }
          </div>

          @if (drink.extras.length) {
            <h3 class="section-title">{{ 'meals.estimate.extras' | t }}</h3>
            <div class="chips" role="group" [attr.aria-label]="'meals.estimate.extras' | t">
              @for (x of drink.extras; track x.key) {
                <button type="button" class="chip-opt" [attr.aria-pressed]="extras().includes(x.key)" (click)="toggle(x.key)">
                  {{ 'meals.drinks.extras.' + x.key | t }} <small class="num">+{{ i18n.number(x.kcal) }}</small>
                </button>
              }
            </div>
          }

          <section class="total" aria-live="polite">
            <div class="total-head">
              <span class="small muted">{{ 'meals.drinks.total' | t: { ml: i18n.number(total().ml) } }}</span>
              <b class="num">≈ {{ i18n.number(total().kcal) }} kcal</b>
            </div>
            <p class="tiny muted num">
              {{ 'meals.estimate.macros' | t: { p: i18n.number(total().proteinG, 1), c: i18n.number(total().carbsG, 1), f: i18n.number(total().fatG, 1) } }}
            </p>
            @if (total().health != null) {
              <div class="total-ns">
                <span class="small">{{ 'meals.drinks.grade' | t }}</span>
                <app-health-score [score]="total().health!" />
              </div>
            }
          </section>

          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="add()">
            <app-icon name="plus" /> {{ 'meals.estimate.add' | t: { slot: slotLower() } }}
          </button>
          <p class="tiny muted center">{{ 'meals.drinks.note' | t }}</p>
        </div>
      }
    </dialog>
  `,
  styles: ESTIMATE_STYLES,
})
export class DrinkSheetComponent {
  /** the meal it goes to, for the button */
  readonly slotLabel = input('');
  protected readonly slotLower = computed(() => this.slotLabel().charAt(0).toLowerCase() + this.slotLabel().slice(1));
  readonly busy = signal(false);
  readonly confirm = output<EstimatedItem[]>();
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly milks = MILK_KINDS;
  protected readonly sugarCounts = [0, 1, 2, 3];
  protected readonly d = signal<HotDrink | null>(null);
  protected readonly format = signal('');
  protected readonly milk = signal<MilkKind>('semi');
  protected readonly dash = signal(false);
  protected readonly sugars = signal(0);
  protected readonly extras = signal<string[]>([]);

  private readonly choice = computed(() => ({ format: this.format(), milk: this.milk(), dash: this.dash(), sugars: this.sugars(), extras: this.extras() }));
  protected readonly formatMilk = computed(() => this.d()?.formats.find((f) => f.key === this.format())?.milkMl ?? 0);
  protected readonly total = computed(() => drinkTotal(this.d()!, this.choice()));

  open(key: string): void {
    const d = hotDrink(key);
    if (!d) return;
    this.d.set(d);
    this.format.set(d.usual);
    this.dash.set(false);
    this.sugars.set(0);
    this.extras.set([]);
    this.busy.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dialog().nativeElement);
  }

  /** a format with the milk chosen, before sugar and extras */
  protected kcalOf(format: string): number {
    return drinkTotal(this.d()!, { format, milk: this.milk(), dash: false, sugars: 0, extras: [] }).kcal;
  }

  protected toggle(key: string): void {
    this.extras.update((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  }

  /** « Cappuccino · lait d’avoine, 1 sucre, sirop » */
  protected add(): void {
    const d = this.d();
    if (!d) return;
    const t = this.total();
    const details = [
      t.milkMl > 0 ? this.i18n.t('meals.drinks.milkNames.' + this.milk()) : null,
      this.sugars() ? this.i18n.t(this.sugars() === 1 ? 'meals.drinks.oneSugar' : 'meals.drinks.sugars', { n: this.sugars() }).toLowerCase() : null,
      ...this.extras().map((x) => this.i18n.t('meals.drinks.extras.' + x).toLowerCase()),
    ].filter(Boolean);
    const f = d.formats.find((x) => x.key === this.format()) ?? d.formats[0];
    const label = this.i18n.t('meals.drinks.formats.' + d.key + '.' + f.key);
    const drinkName = this.i18n.t('meals.drinks.names.' + d.key);
    const base = f.named ? label : f.key === d.usual ? drinkName : `${drinkName}, ${label.toLowerCase()}`;
    const r = (v: number) => Math.round(v * 10) / 10;
    this.confirm.emit([
      {
        name: details.length ? `${base} · ${details.join(', ')}` : base,
        kcal: Math.round(t.kcal),
        proteinG: r(t.proteinG),
        carbsG: r(t.carbsG),
        fatG: r(t.fatG),
        sugarsG: r(t.sugarsG),
        satFatG: r(t.satFatG),
        saltG: Math.round(t.saltG * 100) / 100,
        fiberG: r(t.fiberG),
        nutriscore: t.grade,
        health: t.health,
      },
    ]);
  }
}
