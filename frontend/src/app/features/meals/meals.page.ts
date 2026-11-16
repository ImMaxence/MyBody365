import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { MealEntry, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsStore, SLOTS, macroTargets, shiftDay } from '../../core/meals/meals.store';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { KcalRingComponent } from '../../shared/kcal-ring.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { NutriscoreComponent } from '../../shared/nutriscore.component';

const SLOT_ICON: Record<Slot, string> = { BREAKFAST: 'sun', LUNCH: 'utensils', DINNER: 'moon', SNACK: 'leaf' };

/** The Meals tab: a day's calories against the target, the macros, and the four meals. */
@Component({
  selector: 'app-meals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, KcalRingComponent, NutriscoreComponent, NumberStepperComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <h1 class="title">{{ 'meals.title' | t }}</h1>
        <span class="spacer"></span>
        <a routerLink="/app/meals/recipes" class="btn btn-secondary btn-s"><app-icon name="book" [size]="18" /> {{ 'meals.recipes' | t }}</a>
      </header>

      <nav class="days" [attr.aria-label]="'meals.title' | t">
        <button type="button" class="icon-btn" [attr.aria-label]="'meals.previousDay' | t" (click)="go(-1)"><app-icon name="chevronLeft" /></button>
        <span class="day-label">{{ dayLabel() }}</span>
        <button type="button" class="icon-btn" [attr.aria-label]="'meals.nextDay' | t" [disabled]="isTomorrow()" (click)="go(1)">
          <app-icon name="chevronRight" />
        </button>
      </nav>

      @if (store.data(); as d) {
        <section class="card summary">
          @for (k of [d.day]; track k) {
            <app-kcal-ring [eaten]="d.totals.kcal" [target]="d.targetKcal" [size]="128" />
          }
          <div class="macros">
            <p class="small muted">{{ 'meals.kcalTarget' | t: { kcal: i18n.number(d.targetKcal ?? 0) } }}</p>
            @for (m of macros(); track m.key) {
              <div class="macro">
                <div class="macro-head small"><span>{{ m.label | t }}</span><span class="num">{{ i18n.number(m.value) }} / {{ m.target }} g</span></div>
                <div class="bar" aria-hidden="true"><i [style.width.%]="m.pct" [style.background]="m.color"></i></div>
              </div>
            }
          </div>
        </section>

        @for (slot of slots; track slot; let i = $index) {
          <section class="card slot" [style.--i]="i">
            <header class="slot-head">
              <span class="slot-ico"><app-icon [name]="slotIcon[slot]" [size]="18" /></span>
              <h2 class="slot-title">{{ 'meals.slots.' + slot | t }}</h2>
              <span class="slot-kcal num">{{ i18n.number(slotKcal(slot)) }} kcal</span>
            </header>
            @if (store.bySlot()[slot].length) {
              <ul class="entries" role="list">
                @for (e of store.bySlot()[slot]; track e.id) {
                  <li>
                    <button type="button" class="entry" (click)="edit(e)">
                      <span class="entry-body">
                        <span class="entry-name">{{ e.name }}</span>
                        <span class="entry-sub small muted">{{ amount(e) }}{{ e.detail ? ' · ' + e.detail : '' }}</span>
                      </span>
                      @if (e.nutriscore) {
                        <app-nutriscore [grade]="e.nutriscore" />
                      }
                      <span class="entry-kcal num">{{ i18n.number(e.nutrients.kcal) }}</span>
                    </button>
                  </li>
                }
              </ul>
            }
            <div class="slot-actions">
              <a class="btn btn-ghost btn-s add" routerLink="/app/meals/add" [queryParams]="{ slot, day: store.day() }">
                <app-icon name="plus" [size]="18" /> {{ 'meals.add' | t }}
              </a>
              @if (!store.bySlot()[slot].length) {
                <button type="button" class="btn btn-ghost btn-s" (click)="copy(slot)"><app-icon name="repeat" [size]="16" /> {{ 'meals.copyYesterday' | t }}</button>
              }
            </div>
          </section>
        }
        <p class="tiny muted hint">{{ 'meals.macroHint' | t }}</p>
      } @else {
        <div class="skeleton" style="height: 168px; border-radius: 24px"></div>
        <div class="skeleton" style="height: 110px; border-radius: 24px"></div>
      }

      <dialog class="sheet" #entryDialog (close)="selected.set(null)">
        <div class="sheet-grip"></div>
        @if (selected(); as e) {
          <div class="stack">
            <div>
              <h2 class="h3">{{ e.name }}</h2>
              @if (e.detail) {
                <p class="small muted">{{ e.detail }}</p>
              }
            </div>
            <span class="label">{{ 'meals.entry.quantity' | t }}</span>
            @if (e.grams != null) {
              <app-number-stepper [(value)]="qty" [step]="5" [min]="1" [max]="5000" [decimals]="0" unit="g" [label]="'meals.quantity.gramsLabel' | t" />
            } @else {
              <app-number-stepper [(value)]="qty" [step]="0.5" [min]="0.25" [max]="20" [decimals]="2" [label]="'meals.quantity.servingsLabel' | t" />
            }
            <p class="live num">{{ 'meals.quantity.total' | t: { kcal: i18n.number(liveKcal()) } }}</p>
            <span class="label">{{ 'meals.entry.move' | t }}</span>
            <div class="seg" role="group" [attr.aria-label]="'meals.entry.move' | t">
              @for (s of slots; track s) {
                <button type="button" [attr.aria-pressed]="moveTo() === s" (click)="moveTo.set(s)">{{ 'meals.slots.' + s | t }}</button>
              }
            </div>
            <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="save(e)"><app-icon name="check" /> {{ 'meals.entry.save' | t }}</button>
            <button type="button" class="btn btn-ghost btn-block danger" [disabled]="busy()" (click)="remove(e)"><app-icon name="trash" /> {{ 'meals.entry.delete' | t }}</button>
          </div>
        }
      </dialog>
    </main>
  `,
  styles: `
    .spacer {
      flex: 1;
    }
    .days {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      margin-top: calc(-1 * var(--space-2));
    }
    .day-label {
      text-align: center;
      font-weight: 700;
      text-transform: capitalize;
    }
    .summary {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: var(--space-5);
      padding: var(--space-5);
    }
    .macros {
      display: grid;
      gap: var(--space-3);
    }
    .macro {
      display: grid;
      gap: 5px;
    }
    .macro-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-weight: 650;
    }
    .macro-head .num {
      color: var(--fg-2);
      font-weight: 600;
    }
    .bar {
      height: 7px;
      border-radius: 4px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 4px;
      transition: width 700ms var(--ease-out);
      animation: grow 900ms var(--ease-out) both;
    }
    @keyframes grow {
      from {
        width: 0 !important;
      }
    }
    .slot {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
      animation: slot-in 420ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 60ms);
    }
    @keyframes slot-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
    }
    .slot-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .slot-ico {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 12px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .slot-title {
      flex: 1;
      font-size: 1.05rem;
      font-weight: 750;
    }
    .slot-kcal {
      font-weight: 700;
      color: var(--fg-2);
    }
    .entries {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .entry {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 2px;
      border-top: 1px solid var(--line);
      text-align: left;
    }
    .entry-body {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .entry-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entry-sub {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entry-kcal {
      min-width: 3ch;
      text-align: right;
      font-weight: 700;
    }
    .slot-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .add {
      color: var(--accent-text);
    }
    .hint {
      text-align: center;
    }
    .live {
      margin-top: -4px;
      text-align: center;
      font-weight: 750;
      font-size: 1.15rem;
    }
    .danger {
      color: var(--danger);
    }
    @media (max-width: 360px) {
      .summary {
        grid-template-columns: 1fr;
        justify-items: center;
      }
      .macros {
        width: 100%;
      }
    }
  `,
})
export class MealsPage {
  protected readonly store = inject(MealsStore);
  protected readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('entryDialog');

  protected readonly slots = SLOTS;
  protected readonly slotIcon = SLOT_ICON;
  protected readonly selected = signal<MealEntry | null>(null);
  protected readonly qty = signal(100);
  protected readonly moveTo = signal<Slot>('LUNCH');
  protected readonly busy = signal(false);

  protected readonly isTomorrow = computed(() => this.store.day() >= shiftDay(localDay(), 1));
  protected readonly dayLabel = computed(() => {
    const d = this.store.day();
    const today = localDay();
    if (d === today) return this.i18n.t('meals.today');
    if (d === shiftDay(today, -1)) return this.i18n.t('meals.yesterday');
    if (d === shiftDay(today, 1)) return this.i18n.t('meals.tomorrow');
    return this.i18n.date(d, { weekday: 'long', day: 'numeric', month: 'long' });
  });
  protected readonly macros = computed(() => {
    const d = this.store.data();
    const t = macroTargets(d?.targetKcal ?? 2000);
    const rows = [
      { key: 'p', label: 'meals.protein', value: d?.totals.proteinG ?? 0, target: t.proteinG, color: 'var(--cool)' },
      { key: 'c', label: 'meals.carbs', value: d?.totals.carbsG ?? 0, target: t.carbsG, color: 'var(--flame-3)' },
      { key: 'f', label: 'meals.fat', value: d?.totals.fatG ?? 0, target: t.fatG, color: 'var(--accent)' },
    ];
    return rows.map((r) => ({ ...r, pct: Math.min(100, (r.value / Math.max(1, r.target)) * 100) }));
  });
  protected readonly liveKcal = computed(() => {
    const e = this.selected();
    if (!e) return 0;
    const base = e.grams ?? e.servings ?? 1;
    return Math.round((e.nutrients.kcal * this.qty()) / base);
  });

  constructor() {
    void this.store.load().catch(() => undefined);
  }

  protected go(delta: number): void {
    void this.store.load(shiftDay(this.store.day(), delta)).catch(() => undefined);
  }

  protected slotKcal(slot: Slot): number {
    return Math.round(this.store.bySlot()[slot].reduce((s, e) => s + e.nutrients.kcal, 0));
  }

  protected amount(e: MealEntry): string {
    if (e.grams != null) return this.i18n.t('meals.grams', { g: this.i18n.number(e.grams) });
    return this.i18n.t('meals.servings', { n: this.i18n.number(e.servings ?? 1, (e.servings ?? 1) % 1 ? 1 : 0) });
  }

  protected edit(e: MealEntry): void {
    this.selected.set(e);
    this.qty.set(e.grams ?? e.servings ?? 1);
    this.moveTo.set(e.slot);
    this.dialog().nativeElement.showModal();
  }

  protected async save(e: MealEntry): Promise<void> {
    this.busy.set(true);
    try {
      const patch: { slot?: Slot; grams?: number; servings?: number } = { slot: this.moveTo() };
      if (e.grams != null) patch.grams = this.qty();
      else patch.servings = this.qty();
      await this.store.update(e.id, patch);
      this.dialog().nativeElement.close();
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(e: MealEntry): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.remove(e.id);
      this.dialog().nativeElement.close();
      this.toast.show(this.i18n.t('meals.entry.deleted'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(slot: Slot): Promise<void> {
    try {
      const copied = await this.store.copyFromYesterday(slot);
      this.toast.show(this.i18n.t(copied ? 'meals.copied' : 'meals.nothingToCopy'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    }
  }
}
