import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import type { FoodInput } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { MealsStore } from '../../core/meals/meals.store';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

const FIELDS = ['kcal', 'proteinG', 'carbsG', 'sugarsG', 'fatG', 'satFatG', 'fiberG', 'saltG'] as const;
type Field = (typeof FIELDS)[number];
const LABEL: Record<Field, string> = {
  kcal: 'meals.food.kcal',
  proteinG: 'meals.food.protein',
  carbsG: 'meals.food.carbs',
  sugarsG: 'meals.food.sugars',
  fatG: 'meals.food.fat',
  satFatG: 'meals.food.satFat',
  fiberG: 'meals.food.fiber',
  saltG: 'meals.food.salt',
};

/** A food of one's own, typed from the nutrition table of the pack. */
@Component({
  selector: 'app-food-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ (id() ? 'meals.food.editTitle' : 'meals.food.newTitle') | t }}</h1>
      </header>
      <form class="stack" (ngSubmit)="save()">
        <div class="field">
          <label class="label" for="f-name">{{ 'meals.food.name' | t }}</label>
          <input class="input" id="f-name" name="name" required maxlength="200" [(ngModel)]="name" />
        </div>
        <div class="field">
          <label class="label" for="f-brand">{{ 'meals.food.brand' | t }}</label>
          <input class="input" id="f-brand" name="brand" maxlength="160" [(ngModel)]="brand" />
        </div>
        <h2 class="section-title">{{ 'meals.food.per100' | t }}</h2>
        <p class="hint">{{ 'meals.food.hint' | t }}</p>
        <div class="grid">
          @for (f of fields; track f) {
            <div class="field" [class.wide]="f === 'kcal'">
              <label class="label" [for]="'f-' + f">{{ label[f] | t }}</label>
              <input class="input" [id]="'f-' + f" [name]="f" type="text" inputmode="decimal" [required]="f === 'kcal'" [(ngModel)]="values[f]" />
            </div>
          }
        </div>
        <div class="field">
          <label class="label" for="f-serving">{{ 'meals.food.serving' | t }}</label>
          <input class="input" id="f-serving" name="serving" type="text" inputmode="decimal" [(ngModel)]="serving" />
        </div>
        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()"><app-icon name="check" /> {{ 'meals.food.save' | t }}</button>
        @if (id()) {
          <button type="button" class="btn btn-ghost btn-block danger" [disabled]="busy()" (click)="remove()"><app-icon name="trash" /> {{ 'meals.food.delete' | t }}</button>
        }
      </form>
    </main>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .grid .wide {
      grid-column: 1 / -1;
    }
    .danger {
      color: var(--danger);
    }
  `,
})
export class FoodEditPage {
  readonly id = input<string | undefined>();
  private readonly api = inject(MealsApi);
  private readonly store = inject(MealsStore);
  private readonly toast = inject(ToastService);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);

  protected readonly fields = FIELDS;
  protected readonly label = LABEL;
  protected readonly busy = signal(false);
  protected name = '';
  protected brand = '';
  protected serving = '';
  protected values: Record<Field, string> = { kcal: '', proteinG: '', carbsG: '', sugarsG: '', fatG: '', satFatG: '', fiberG: '', saltG: '' };

  constructor() {
    queueMicrotask(() => {
      const id = this.id();
      if (!id) return;
      void this.api.food(id).then((f) => {
        this.name = f.name;
        this.brand = f.brand ?? '';
        this.serving = f.servingG != null ? this.text(f.servingG) : '';
        for (const k of FIELDS) {
          const v = k === 'kcal' ? f.per100.kcal : f.per100[k];
          this.values[k] = v != null ? this.text(v) : '';
        }
        this.values = { ...this.values };
      });
    });
  }

  private text(n: number): string {
    return String(n).replace('.', this.i18n.lang() === 'fr' ? ',' : '.');
  }

  private num(s: string): number | null {
    const t = s.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  protected async save(): Promise<void> {
    const kcal = this.num(this.values.kcal);
    if (!this.name.trim() || kcal == null || Number.isNaN(kcal)) {
      this.toast.error(this.i18n.error('validation_failed'));
      return;
    }
    const input: FoodInput = { name: this.name.trim(), brand: this.brand.trim() || null, kcal, servingG: this.num(this.serving) };
    for (const k of FIELDS) if (k !== 'kcal') input[k] = this.num(this.values[k]);
    if (Object.values(input).some((v) => typeof v === 'number' && Number.isNaN(v))) {
      this.toast.error(this.i18n.error('validation_failed'));
      return;
    }
    this.busy.set(true);
    try {
      const id = this.id();
      const food = id ? await this.api.updateFood(id, input) : await this.api.createFood(input);
      this.toast.show(this.i18n.t('meals.food.saved'));
      // created from the add screen: it opens there, ready for its amount
      if (!id) this.store.pick.set({ kind: 'FOOD', id: food.id });
      this.stack.back('/app/meals/add');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const id = this.id();
    if (!id) return;
    this.busy.set(true);
    try {
      await this.api.deleteFood(id);
      this.toast.show(this.i18n.t('meals.food.deleted'));
      this.stack.back('/app/meals');
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
