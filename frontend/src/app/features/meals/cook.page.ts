import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { MealsApi } from '../../core/meals/meals-api';
import type { Recipe } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { haptic } from '../../core/ui/haptics';
import { IconComponent } from '../../shared/icon.component';
import { lineInStep, scaleLine, stepIngredients } from '../../core/meals/step-ingredients';

/** a duration said in a step (« 10 minutes », « 1 h 30 », « 45 min »), in seconds */
const DURATION = /(\d+(?:[.,]\d+)?)\s*(heures?|h|minutes?|min|mn|secondes?|s)\b(?:\s*(\d{1,2})\b)?/gi;

export function durations(step: string): { label: string; seconds: number }[] {
  const out: { label: string; seconds: number }[] = [];
  for (const m of step.matchAll(DURATION)) {
    const n = Number(m[1].replace(',', '.'));
    const unit = m[2].toLowerCase();
    const extra = m[3] ? Number(m[3]) : 0;
    let s = unit.startsWith('h') ? n * 3600 + extra * 60 : unit.startsWith('s') ? n : n * 60;
    s = Math.round(s);
    if (s >= 10 && s <= 6 * 3600 && !out.some((x) => x.seconds === s)) out.push({ label: m[0].trim(), seconds: s });
  }
  return out.slice(0, 3);
}

/**
 * 1.19: « Cuisiner pas à pas »: the steps of a recipe one by one, in big letters, the screen kept on while cooking (Wake
 * Lock), a swipe or the buttons from one to the next; a duration in a step (« 10 minutes ») is a timer in one tap, which
 * rings (vibrates) at its end even on another step; the ingredients one tap away. Works without network once the recipe
 * was seen. 1.20.5: for the number of portions chosen before (?portions=), and under each step the ingredients it speaks of,
 * with their amounts.
 */
@Component({
  selector: 'app-cook',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <main class="cook" (pointerdown)="down($event)" (pointerup)="up($event)">
      <header class="bar">
        <button type="button" class="icon-btn" [attr.aria-label]="'common.close' | t" (click)="leave()"><app-icon name="x" [size]="22" /></button>
        <div class="titles">
          <h1 class="name">{{ recipe()?.name ?? '' }}</h1>
          @if (steps().length) {
            <span class="tiny muted num">{{ 'cook.stepOf' | t: { n: index() + 1, total: steps().length } }} · {{ 'cook.forPortions' | t: { n: count() } }}</span>
          }
        </div>
        <button type="button" class="icon-btn" [attr.aria-pressed]="showIngredients()" [attr.aria-label]="'cook.ingredients' | t"
          (click)="showIngredients.set(!showIngredients())"><app-icon name="list" [size]="22" /></button>
      </header>
      <div class="progress" aria-hidden="true"><i [style.width.%]="steps().length ? ((index() + 1) / steps().length) * 100 : 0"></i></div>

      @if (showIngredients() && recipe(); as r) {
        <section class="ingredients card" [attr.aria-label]="'cook.ingredients' | t">
          <h2 class="h3">{{ 'cook.ingredients' | t }} · {{ 'meals.servings' | t: { n: count() } }}</h2>
          <ul>
            @for (ing of r.ingredients ?? []; track $index) {
              <li><span>{{ ing.name }}</span><b class="num">{{ grams(ing.grams) }}</b></li>
            }
            @for (line of r.ingredientLines ?? []; track $index) {
              <li><span>{{ scaled(line) }}</span></li>
            }
          </ul>
        </section>
      }

      @if (steps().length) {
        @for (s of [step()]; track index()) {
          <section class="step" [class.back]="dir() < 0" aria-live="polite">
            <span class="num-big" aria-hidden="true">{{ index() + 1 }}</span>
            <p class="text">{{ s }}</p>
            <!-- 1.20.5: the ingredients this step speaks of, for the portions chosen -->
            @if (uses().length) {
              <ul class="uses" [attr.aria-label]="'cook.stepIngredients' | t">
                @for (u of uses(); track $index) {
                  <li><span>{{ u.name }}</span>@if (u.amount) {<b class="num">{{ u.amount }}</b>}</li>
                }
              </ul>
            }
            @if (timersOf(s).length) {
              <div class="timers">
                @for (d of timersOf(s); track d.seconds) {
                  <button type="button" class="btn btn-secondary timer-btn" (click)="startTimer(d.seconds, d.label)"><app-icon name="timer" [size]="18" /> {{ d.label }}</button>
                }
              </div>
            }
          </section>
        }
      } @else if (recipe()) {
        <section class="step"><p class="text">{{ 'cook.noSteps' | t }}</p></section>
      }

      @if (left() !== null) {
        <div class="ring" [class.done]="left() === 0" role="timer" [attr.aria-label]="'cook.timer' | t: { label: timerLabel() }">
          <app-icon name="timer" [size]="18" />
          <b class="num">{{ clock(left()!) }}</b>
          <span class="tiny">{{ timerLabel() }}</span>
          <button type="button" class="btn btn-ghost btn-s" (click)="stopTimer()">{{ (left() === 0 ? 'cook.ok' : 'cook.stop') | t }}</button>
        </div>
      }

      <nav class="nav">
        <button type="button" class="btn btn-secondary" [disabled]="index() === 0" (click)="go(-1)"><app-icon name="chevronLeft" /> {{ 'cook.previous' | t }}</button>
        @if (index() < steps().length - 1) {
          <button type="button" class="btn btn-primary" (click)="go(1)">{{ 'cook.next' | t }} <app-icon name="chevronRight" /></button>
        } @else {
          <button type="button" class="btn btn-primary" (click)="leave()"><app-icon name="check" /> {{ 'cook.done' | t }}</button>
        }
      </nav>
    </main>
  `,
  styles: `
    .cook {
      position: fixed;
      inset: 0;
      z-index: 120;
      display: flex;
      flex-direction: column;
      padding: calc(var(--safe-top) + 8px) 18px calc(var(--safe-bottom) + 16px);
      background: var(--bg);
      overflow: hidden;
      touch-action: pan-y;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .titles {
      display: grid;
      flex: 1;
      min-width: 0;
      text-align: center;
    }
    .name {
      overflow: hidden;
      font-size: 1rem;
      font-weight: 750;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .progress {
      height: 4px;
      margin: 8px 0 0;
      border-radius: 2px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .progress i {
      display: block;
      height: 100%;
      background: var(--flame);
      transition: width 420ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .ingredients {
      margin-top: 12px;
      max-height: 40vh;
      overflow: auto;
    }
    .ingredients ul {
      display: grid;
      gap: 6px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .ingredients li {
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }
    .step {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: safe center;
      min-height: 0;
      overflow-y: auto;
      gap: 16px;
      animation: step-in 420ms cubic-bezier(0.32, 0.72, 0, 1) both;
    }
    .step.back {
      animation-name: step-back;
    }
    @keyframes step-in {
      from {
        opacity: 0;
        transform: translateX(40px);
      }
    }
    @keyframes step-back {
      from {
        opacity: 0;
        transform: translateX(-40px);
      }
    }
    .num-big {
      font-family: var(--font-display);
      font-stretch: 120%;
      font-weight: 800;
      font-size: 4rem;
      line-height: 1;
      color: var(--accent-text);
    }
    .text {
      margin: 0;
      font-size: clamp(1.35rem, 6vw, 1.8rem);
      font-weight: 600;
      line-height: 1.35;
    }
    .uses {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--surface-2);
      list-style: none;
    }
    .uses li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 1.02rem;
      font-weight: 600;
    }
    .uses li span {
      min-width: 0;
    }
    .uses li b {
      flex: none;
      color: var(--accent-text);
    }
    .timers {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .timer-btn {
      --btn-h: 44px;
    }
    .ring {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding: 8px 8px 8px 14px;
      border-radius: var(--radius-pill);
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .ring b {
      font-size: 1.3rem;
    }
    .ring .tiny {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ring.done {
      animation: ring 0.9s ease-in-out infinite;
    }
    @keyframes ring {
      50% {
        transform: scale(1.03);
      }
    }
    .nav {
      display: grid;
      grid-template-columns: 1fr 1.4fr;
      gap: 10px;
    }
    @media (prefers-reduced-motion: reduce) {
      .step,
      .ring.done {
        animation: none;
      }
    }
  `,
})
export class CookPage {
  readonly id = input.required<string>();
  /** 1.20.5: the portions chosen before cooking (the recipe's own when none) */
  readonly portions = input<string | undefined>();
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(MealsApi);
  private readonly stack = inject(StackNavigation);
  private readonly doc = inject(DOCUMENT);
  protected readonly recipe = signal<Recipe | null>(null);
  protected readonly index = signal(0);
  protected readonly dir = signal(1);
  protected readonly showIngredients = signal(false);
  protected readonly left = signal<number | null>(null);
  protected readonly timerLabel = signal('');
  private timer: ReturnType<typeof setInterval> | null = null;
  private endsAt = 0;
  private lock: { release(): Promise<void> } | null = null;
  private startX = 0;
  private startY = 0;

  /** the steps: one per line of the recipe's text */
  protected readonly steps = computed(() =>
    (this.recipe()?.notes ?? '')
      .split(/\n+/)
      .map((s) => s.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
      .filter((s) => s.length > 1),
  );
  protected readonly step = computed(() => this.steps()[this.index()] ?? '');
  /** how many portions are cooked, and by how much the amounts change */
  protected readonly count = computed(() => {
    const n = Math.round(Number(this.portions()));
    return n >= 1 && n <= 50 ? n : (this.recipe()?.servings ?? 1);
  });
  private readonly factor = computed(() => this.count() / (this.recipe()?.servings || 1));
  /** the ingredients of this step: their short name (before the first comma) and their amount */
  protected readonly uses = computed(() => {
    const r = this.recipe();
    const step = this.step();
    if (!r || !step) return [];
    const ings = r.ingredients ?? [];
    const found = stepIngredients(
      step,
      ings.map((i) => i.name),
    ).map((i) => ({ name: ings[i].name.split(',')[0].trim(), amount: this.grams(ings[i].grams) }));
    const lines = (r.ingredientLines ?? []).filter((l) => lineInStep(step, l)).map((l) => ({ name: this.scaled(l), amount: '' }));
    return [...found, ...lines];
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.api
        .recipe(id)
        .then((r) => this.recipe.set(r))
        .catch(() => this.recipe.set(null));
    });
    void this.keepAwake();
    const again = () => this.doc.visibilityState === 'visible' && void this.keepAwake();
    this.doc.addEventListener('visibilitychange', again);
    inject(DestroyRef).onDestroy(() => {
      this.doc.removeEventListener('visibilitychange', again);
      void this.lock?.release().catch(() => undefined);
      if (this.timer) clearInterval(this.timer);
    });
  }

  /** a weight for the portions chosen: to the gram, to the half gram under 10 g */
  protected grams(g: number): string {
    const v = g * this.factor();
    return this.i18n.number(v >= 10 ? Math.round(v) : Math.round(v * 2) / 2, v >= 10 || Number.isInteger(Math.round(v * 2) / 2) ? 0 : 1) + ' g';
  }

  protected scaled(line: string): string {
    return scaleLine(line, this.factor());
  }

  protected timersOf(step: string): { label: string; seconds: number }[] {
    return durations(step);
  }

  protected go(delta: number): void {
    const next = Math.min(this.steps().length - 1, Math.max(0, this.index() + delta));
    if (next === this.index()) return;
    this.dir.set(delta);
    this.index.set(next);
    haptic('tap');
  }

  /** a swipe sideways: the next step or the one before */
  protected down(e: PointerEvent): void {
    this.startX = e.clientX;
    this.startY = e.clientY;
  }

  protected up(e: PointerEvent): void {
    const dx = e.clientX - this.startX;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - this.startY) * 1.5) this.go(dx < 0 ? 1 : -1);
  }

  protected startTimer(seconds: number, label: string): void {
    if (this.timer) clearInterval(this.timer);
    this.endsAt = Date.now() + seconds * 1000;
    this.timerLabel.set(label);
    this.left.set(seconds);
    // on the clock (the screen may sleep a moment): what is left is read from the end time
    this.timer = setInterval(() => {
      const s = Math.max(0, Math.round((this.endsAt - Date.now()) / 1000));
      this.left.set(s);
      if (s === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
        haptic('done');
      }
    }, 500);
  }

  protected stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.left.set(null);
  }

  protected clock(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  }

  protected leave(): void {
    this.stack.back('/app/meals/recipes/' + this.id());
  }

  /** the screen stays on while cooking (where the phone allows it) */
  private async keepAwake(): Promise<void> {
    const nav = this.doc.defaultView?.navigator as (Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }) | undefined;
    try {
      this.lock = (await nav?.wakeLock?.request('screen')) ?? null;
    } catch {
      /* refused or not offered: the phone's own sleep */
    }
  }
}
