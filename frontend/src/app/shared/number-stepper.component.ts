import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, viewChild } from '@angular/core';
import { I18nService } from '../core/i18n/i18n.service';
import { IconComponent } from './icon.component';

let uid = 0;

/**
 * A big number to set with the thumb: − / + buttons (hold to repeat) and the phone's numeric
 * keyboard on the figure itself. Used for weight, height and goal.
 */
@Component({
  selector: 'app-number-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="stepper" [class.compact]="compact()">
      <button
        type="button"
        class="step"
        [attr.aria-label]="minusLabel()"
        (pointerdown)="hold(-1, $event)"
        (pointerup)="release()"
        (pointerleave)="release()"
        (keydown.enter)="nudge(-1)"
        (keydown.space)="nudge(-1)"
      >
        <app-icon name="minus" [size]="22" [stroke]="2.4" />
      </button>
      <label class="value" [for]="id">
        <input
          #field
          [id]="id"
          [style.width.ch]="width()"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          [attr.aria-label]="label()"
          [value]="text()"
          (change)="typed($event)"
          (focus)="select($event)"
        />
        <span class="unit">{{ unit() }}</span>
      </label>
      <button
        type="button"
        class="step"
        [attr.aria-label]="plusLabel()"
        (pointerdown)="hold(1, $event)"
        (pointerup)="release()"
        (pointerleave)="release()"
        (keydown.enter)="nudge(1)"
        (keydown.space)="nudge(1)"
      >
        <app-icon name="plus" [size]="22" [stroke]="2.4" />
      </button>
    </div>
  `,
  styles: `
    .stepper {
      display: grid;
      grid-template-columns: 56px 1fr 56px;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-l);
      background: var(--surface);
      border: 1px solid var(--line);
    }
    .step {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--surface-3);
      color: var(--fg);
      touch-action: manipulation;
      user-select: none;
      transition: transform var(--dur-1) var(--ease-out), background-color var(--dur-2);
    }
    .step:active {
      transform: scale(0.9);
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .value {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 6px;
      min-width: 0;
    }
    /* as wide as its text: the number and its unit sit in the middle */
    input {
      min-width: 2ch;
      max-width: 100%;
      border: 0;
      background: transparent;
      text-align: center;
      font-family: var(--font-display);
      font-stretch: 120%;
      font-weight: 800;
      font-size: 3rem;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
      color: var(--fg);
      outline: none;
      padding: 0;
    }
    input:focus {
      color: var(--accent-text);
    }
    .unit {
      font-weight: 700;
      color: var(--fg-2);
      font-size: var(--fs-l);
    }
    .compact input {
      font-size: 2.1rem;
    }
    .compact {
      grid-template-columns: 48px 1fr 48px;
    }
    .compact .step {
      width: 48px;
      height: 48px;
    }
  `,
})
export class NumberStepperComponent {
  readonly value = model.required<number>();
  readonly step = input(0.1);
  readonly min = input(0);
  readonly max = input(999);
  readonly decimals = input(1);
  readonly unit = input('');
  readonly label = input('');
  readonly minusLabel = input('−');
  readonly plusLabel = input('+');
  readonly compact = input(false);

  private readonly i18n = inject(I18nService);
  protected readonly id = `stepper-${++uid}`;
  protected readonly text = computed(() => this.i18n.number(this.value(), this.decimals()));
  /** digits count one ch (tabular figures), separators about half */
  protected readonly width = computed(() => {
    const s = this.text();
    const digits = s.replace(/\D/g, '').length;
    return digits + (s.length - digits) * 0.45 + 0.3;
  });
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected nudge(direction: number): void {
    const next = this.clamp(Math.round((this.value() + direction * this.step()) / this.step()) * this.step());
    if (next === this.value()) return;
    this.value.set(next);
    this.bump(direction);
  }

  /** the number slides in from the side it comes from: up for +, down for − */
  private bump(direction: number): void {
    const el = this.field().nativeElement;
    if (typeof el.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [
        { transform: `translateY(${direction > 0 ? 10 : -10}px) scale(0.94)`, opacity: 0.4 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' },
    );
  }

  /** press and hold: one step at once, then faster and faster */
  protected hold(direction: number, e: PointerEvent): void {
    e.preventDefault();
    this.release();
    this.nudge(direction);
    let delay = 380;
    const repeat = () => {
      this.nudge(direction);
      delay = Math.max(50, delay * 0.8);
      this.timer = setTimeout(repeat, delay);
    };
    this.timer = setTimeout(repeat, delay);
  }

  protected release(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  protected typed(e: Event): void {
    const el = e.target as HTMLInputElement;
    const n = Number(el.value.replace(',', '.').replace(/[^\d.]/g, ''));
    if (Number.isFinite(n) && n > 0) this.value.set(this.clamp(n));
    el.value = this.text();
  }

  protected select(e: FocusEvent): void {
    (e.target as HTMLInputElement).select();
  }

  private clamp(n: number): number {
    const f = 10 ** this.decimals();
    return Math.min(this.max(), Math.max(this.min(), Math.round(n * f) / f));
  }
}
