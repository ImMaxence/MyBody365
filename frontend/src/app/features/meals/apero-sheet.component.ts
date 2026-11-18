import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { APERO, AperoDrink, MIXERS, aperoDrink, aperoTotal } from '../../core/meals/apero';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { closeSheet } from '../../core/ui/sheets';
import { IconComponent } from '../../shared/icon.component';
import { NutriscoreComponent } from '../../shared/nutriscore.component';
import { ESTIMATE_STYLES, EstimatedItem } from './fast-food-sheet.component';

/**
 * A drink at the apéro (1.9): a beer, a glass of wine, bubbles, a cocktail, a spirit (with its mixer), a cider or a
 * mocktail, how many glasses, with what they bring in alcohol (in standard drinks) and the public health guide. One line
 * is added to the meal; alcoholic drinks have no Nutri-Score, mocktails have theirs.
 */
@Component({
  selector: 'app-apero-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NutriscoreComponent, TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="d() ? ('meals.apero.names.' + d()!.key | t) : ''">
      <div class="sheet-grip"></div>
      @if (d(); as drink) {
        <div class="stack">
          <div>
            <h2 class="h3"><span aria-hidden="true">{{ drink.emoji }}</span> {{ 'meals.apero.names.' + drink.key | t }}</h2>
            <p class="small muted">{{ 'meals.drinks.text' | t }}</p>
          </div>

          <h3 class="section-title">{{ 'meals.apero.which' | t }}</h3>
          <div class="opts" role="radiogroup" [attr.aria-label]="'meals.apero.which' | t">
            @for (it of drink.items; track it.key) {
              <button type="button" class="opt" role="radio" [attr.aria-checked]="item() === it.key" (click)="item.set(it.key)">
                <span class="opt-name">{{ 'meals.apero.items.' + drink.key + '.' + it.key | t }}</span>
                <span class="opt-foot">
                  <span class="opt-kcal num">≈ {{ i18n.number(kcalOf(it.key)) }} kcal</span>
                  @if (it.abv > 0) {
                    <span class="tiny muted num">{{ i18n.number(it.abv, it.abv % 1 ? 1 : 0) }} %</span>
                  }
                </span>
              </button>
            }
          </div>

          @if (drink.sizes.length > 1) {
            <h3 class="section-title">{{ 'meals.drinks.format' | t }}</h3>
            <div class="chips" role="radiogroup" [attr.aria-label]="'meals.drinks.format' | t">
              @for (s of drink.sizes; track s.key) {
                <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="size() === s.key" (click)="size.set(s.key)">
                  {{ 'meals.apero.sizes.' + s.key | t }} <small class="num">{{ i18n.number(s.ml / 10) }} cl</small>
                </button>
              }
            </div>
          }

          @if (drink.mixers) {
            <h3 class="section-title">{{ 'meals.apero.mixer' | t }}</h3>
            <div class="chips" role="radiogroup" [attr.aria-label]="'meals.apero.mixer' | t">
              @for (m of mixers; track m.key) {
                <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="mixer() === m.key" (click)="mixer.set(m.key)">
                  {{ 'meals.apero.mixers.' + m.key | t }}
                </button>
              }
            </div>
          }

          <h3 class="section-title">{{ 'meals.apero.count' | t }}</h3>
          <div class="chips" role="radiogroup" [attr.aria-label]="'meals.apero.count' | t">
            @for (n of counts; track n) {
              <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="count() === n" (click)="count.set(n)">
                {{ (n === 1 ? 'meals.apero.glass' : 'meals.apero.glasses') | t: { n: n } }}
              </button>
            }
          </div>

          <section class="total" aria-live="polite">
            <div class="total-head">
              <span class="small muted">{{ 'meals.drinks.total' | t: { ml: i18n.number(total().ml) } }}</span>
              <b class="num">≈ {{ i18n.number(total().kcal) }} kcal</b>
            </div>
            <p class="tiny muted num">
              {{ 'meals.estimate.macros' | t: { p: i18n.number(total().proteinG, 1), c: i18n.number(total().carbsG, 1), f: i18n.number(total().fatG, 1) } }}
            </p>
            @if (total().alcoholG > 0.5) {
              <p class="small alcohol num">
                <app-icon name="info" [size]="15" />
                {{ 'meals.apero.alcohol' | t: { g: i18n.number(total().alcoholG), n: i18n.number(total().standard, 1) } }}
              </p>
            }
            <div class="total-ns">
              @if (total().grade; as g) {
                <span class="small">{{ 'meals.drinks.grade' | t }}</span>
                <app-nutriscore [grade]="g" [estimated]="true" />
              } @else {
                <span class="small muted">{{ 'meals.apero.noGrade' | t }}</span>
              }
            </div>
          </section>

          <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="add()">
            <app-icon name="plus" /> {{ 'meals.estimate.add' | t: { slot: slotLower() } }}
          </button>
          @if (total().alcoholG > 0.5) {
            <p class="tiny muted center">{{ 'meals.apero.guide' | t }}</p>
          }
        </div>
      }
    </dialog>
  `,
  styles: [
    ESTIMATE_STYLES,
    `
      .alcohol {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 4px 0 0;
        color: var(--fg-2);
      }
      .opt-foot {
        display: flex;
        justify-content: space-between;
        gap: 6px;
      }
    `,
  ],
})
export class AperoSheetComponent {
  readonly slotLabel = input('');
  protected readonly slotLower = computed(() => this.slotLabel().charAt(0).toLowerCase() + this.slotLabel().slice(1));
  readonly busy = signal(false);
  readonly confirm = output<EstimatedItem[]>();
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly mixers = MIXERS;
  protected readonly counts = [1, 2, 3, 4, 5, 6];
  protected readonly d = signal<AperoDrink | null>(null);
  protected readonly item = signal('');
  protected readonly size = signal('');
  protected readonly mixer = signal('none');
  protected readonly count = signal(1);

  protected readonly total = computed(() => aperoTotal(this.d()!, { item: this.item(), size: this.size(), mixer: this.mixer(), count: this.count() }));

  open(key: string): void {
    const d = aperoDrink(key);
    if (!d) return;
    this.d.set(d);
    this.item.set(d.usual);
    this.size.set(d.usualSize ?? '');
    this.mixer.set('none');
    this.count.set(1);
    this.busy.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dialog().nativeElement);
  }

  /** one glass of it, in the size chosen, without mixer */
  protected kcalOf(item: string): number {
    return aperoTotal(this.d()!, { item, size: this.size(), mixer: 'none', count: 1 }).kcal;
  }

  /** « Bière blonde, 33 cl × 2 », « Whisky, 4 cl · cola » */
  protected add(): void {
    const d = this.d();
    if (!d) return;
    const t = this.total();
    const it = d.items.find((x) => x.key === this.item()) ?? d.items[0];
    const size = d.sizes.find((s) => s.key === this.size());
    let name = this.i18n.t('meals.apero.items.' + d.key + '.' + it.key);
    if (size && d.sizes.length > 1) name += `, ${this.i18n.number(size.ml / 10)} cl`;
    if (d.mixers && this.mixer() !== 'none') name += ` · ${this.i18n.t('meals.apero.mixers.' + this.mixer()).toLowerCase()}`;
    if (this.count() > 1) name += ` × ${this.count()}`;
    const r = (v: number) => Math.round(v * 10) / 10;
    this.confirm.emit([
      {
        name,
        kcal: Math.round(t.kcal),
        proteinG: r(t.proteinG),
        carbsG: r(t.carbsG),
        fatG: r(t.fatG),
        sugarsG: r(t.sugarsG),
        satFatG: r(t.satFatG),
        saltG: Math.round(t.saltG * 100) / 100,
        fiberG: 0,
        nutriscore: t.grade ?? undefined,
      },
    ]);
  }

  /** the chips of « À l'apéro » (food picker) */
  static readonly CHIPS = APERO.map((a) => ({ key: a.key, emoji: a.emoji }));
}
