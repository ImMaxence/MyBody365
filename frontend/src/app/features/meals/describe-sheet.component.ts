import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DescribedPart, HabitsApi } from '../../core/api/habits-api';
import { errorCode } from '../../core/api/api.service';
import type { Food } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Network } from '../../core/offline/network';
import { closeSheet } from '../../core/ui/sheets';
import { IconComponent } from '../../shared/icon.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { HealthScoreComponent } from '../../shared/health-score.component';

/** a line found, as the member keeps it (ticked) and weighs it */
interface Line {
  part: DescribedPart;
  food: Food;
  grams: number;
  keep: boolean;
}

/**
 * 1.19: « Décris ton repas »: the meal written or dictated (the microphone of the phone's keyboard) in a few words, « 200 g
 * de poulet, du riz et une pomme »; the server finds each food of the Ciqual table and its weight as eaten (a part without a
 * quantity gets the portion of a plate, said as estimated). Each line can be weighed again or left out before being added;
 * what was not found goes to the quick add.
 */
@Component({
  selector: 'app-describe-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, NumberStepperComponent, HealthScoreComponent],
  template: `
    <dialog class="sheet" #dialog [attr.aria-label]="'meals.describe.title' | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div>
          <h2 class="h3"><app-icon name="sparkles" [size]="20" /> {{ 'meals.describe.title' | t }}</h2>
          <p class="small muted">{{ 'meals.describe.text' | t }}</p>
        </div>
        <form class="stack tight" (ngSubmit)="find()">
          <label class="sr-only" for="describe-text">{{ 'meals.describe.label' | t }}</label>
          <textarea id="describe-text" class="input" rows="3" name="text" autofocus maxlength="500" enterkeyhint="search"
            [placeholder]="'meals.describe.placeholder' | t" [(ngModel)]="text" (keydown.enter)="$event.preventDefault(); find()"></textarea>
          @if (offline()) {
            <p class="small off-note"><app-icon name="cloudOff" [size]="16" /> {{ 'meals.describe.offline' | t }}</p>
          }
          <button type="submit" class="btn btn-secondary btn-block" [disabled]="busy() || offline() || text.trim().length < 2">
            @if (busy()) {
              <span class="spin" aria-hidden="true"></span>
            } @else {
              <app-icon name="search" [size]="18" />
            }
            {{ 'meals.describe.find' | t }}
          </button>
        </form>

        @if (lines().length || missing().length) {
          <ul class="lines" role="list">
            @for (l of lines(); track $index) {
              <li class="line" [class.off]="!l.keep">
                <label class="keep">
                  <input type="checkbox" [checked]="l.keep" (change)="toggle(l)" />
                  <span class="sr-only">{{ 'meals.describe.keep' | t: { name: l.food.name } }}</span>
                </label>
                <div class="body">
                  <span class="name-row"><span class="name">{{ l.food.name }}</span><span class="kcal num">{{ i18n.number(kcalOf(l)) }} kcal</span></span>
                  <span class="tiny muted said">« {{ l.part.text }} »@if (l.part.guessed) { · {{ 'meals.describe.guessed' | t }} }</span>
                  <div class="amount">
                    <app-number-stepper [value]="l.grams" (valueChange)="weigh(l, $event)" [step]="10" [min]="5" [max]="2000" [decimals]="0"
                      [compact]="true" [unit]="l.food.liquid ? 'ml' : 'g'" [label]="'meals.describe.amount' | t: { name: l.food.name }" />
                  </div>
                </div>
                @if (l.food.health) {
                  <app-health-score [score]="l.food.health.score" />
                }
              </li>
            }
            @for (m of missing(); track $index) {
              <li class="line missing">
                <span class="miss-ico" aria-hidden="true"><app-icon name="search" [size]="16" /></span>
                <div class="body">
                  <span class="name">« {{ m.text }} »</span>
                  <span class="tiny muted">{{ 'meals.describe.notFound' | t }}</span>
                </div>
                <button type="button" class="btn btn-ghost btn-s" (click)="quick.emit(m.text)">{{ 'meals.describe.quick' | t }}</button>
              </li>
            }
          </ul>
          @if (kept().length) {
            <button type="button" class="btn btn-primary btn-block" [disabled]="adding()" (click)="add()">
              <app-icon name="plus" />
              {{ (kept().length === 1 ? 'meals.describe.addOne' : 'meals.describe.addMany') | t: { n: kept().length, kcal: i18n.number(total()), slot: slotLower() } }}
            </button>
          }
        }
      </div>
    </dialog>
  `,
  styles: `
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tight {
      gap: var(--space-2);
    }
    textarea.input {
      min-height: 88px;
      padding: 12px 14px;
      resize: none;
      line-height: 1.4;
    }
    .off-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0;
      color: var(--fg-2);
    }
    .lines {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .line {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      transition: opacity var(--dur-2);
    }
    .line.off {
      opacity: 0.5;
    }
    .keep input {
      width: 22px;
      height: 22px;
      margin: 2px 0 0;
      accent-color: var(--accent);
    }
    .body {
      display: grid;
      flex: 1;
      min-width: 0;
      gap: 2px;
    }
    .name {
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .said {
      overflow-wrap: anywhere;
    }
    .name-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .amount {
      margin-top: 6px;
    }
    .kcal {
      font-weight: 700;
      white-space: nowrap;
    }
    .missing .miss-ico {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      color: var(--fg-3);
    }
    .spin {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--fg) 25%, transparent);
      border-top-color: var(--fg);
      animation: spin 0.8s linear infinite;
    }
  `,
})
export class DescribeSheetComponent {
  readonly slotLabel = input('');
  protected readonly slotLower = computed(() => this.slotLabel().charAt(0).toLowerCase() + this.slotLabel().slice(1));
  /** the lines kept, each with its weight */
  readonly confirm = output<{ food: Food; grams: number }[]>();
  /** a part not found: to the quick add, with its words as the name */
  readonly quick = output<string>();
  readonly adding = signal(false);
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(HabitsApi);
  private readonly network = inject(Network);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly offline = computed(() => !this.network.online());
  protected text = '';
  protected readonly busy = signal(false);
  protected readonly lines = signal<Line[]>([]);
  protected readonly missing = signal<DescribedPart[]>([]);
  protected readonly kept = computed(() => this.lines().filter((l) => l.keep));
  protected readonly total = computed(() => Math.round(this.kept().reduce((t, l) => t + this.kcalOf(l), 0)));

  open(): void {
    this.text = '';
    this.lines.set([]);
    this.missing.set([]);
    this.adding.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dialog().nativeElement);
  }

  protected async find(): Promise<void> {
    const text = this.text.trim();
    if (text.length < 2 || this.busy()) return;
    this.busy.set(true);
    try {
      const parts = await this.api.describe(text);
      this.lines.set(parts.filter((p) => p.food).map((p) => ({ part: p, food: p.food!, grams: Math.max(5, Math.round(p.grams)), keep: true })));
      this.missing.set(parts.filter((p) => !p.food));
    } catch (e) {
      this.missing.set([]);
      this.lines.set([]);
      this.error.emit(errorCode(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** a failure to say (the add screen has the toast) */
  readonly error = output<string>();

  protected toggle(l: Line): void {
    this.lines.update((list) => list.map((x) => (x === l ? { ...x, keep: !x.keep } : x)));
  }

  protected weigh(l: Line, grams: number): void {
    this.lines.update((list) => list.map((x) => (x === l ? { ...x, grams } : x)));
  }

  protected kcalOf(l: Line): number {
    return (l.food.per100.kcal * l.grams) / 100;
  }

  protected add(): void {
    const kept = this.kept();
    if (!kept.length) return;
    this.confirm.emit(kept.map((l) => ({ food: l.food, grams: l.grams })));
  }
}
