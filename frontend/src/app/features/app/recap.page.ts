import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HabitsApi, MonthRecap } from '../../core/api/habits-api';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { recapImage } from '../../core/share/recap-image';
import { shareImage } from '../../core/share/share-image';
import { localDay } from '../../core/tracking/tracking.store';
import { haptic } from '../../core/ui/haptics';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { HealthScoreComponent } from '../../shared/health-score.component';

type Slide = 'intro' | 'weight' | 'run' | 'meals' | 'water' | 'photos' | 'outro';

/** how long a slide stays before the next one (a press holds it) */
const SLIDE_MS = 6000;

/**
 * 1.19: the recap of a month, told like a story: full screen, a bar per slide at the top, a tap on the right goes on, on the
 * left goes back, a press holds it. The slides with nothing to tell are left out: the kilos of the month with their curve,
 * the longest run of weigh-ins and the milestones, the meals (days noted, calories of a day, the health score, what was
 * eaten most), the water, the first and the last photo, then a picture to share (never a photo of the body in it) and the
 * months before.
 */
@Component({
  selector: 'app-recap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, HealthScoreComponent],
  template: `
    <main class="story" [attr.data-slide]="slide()" (pointerdown)="hold(true)" (pointerup)="hold(false)" (pointercancel)="hold(false)">
      <h1 class="sr-only">{{ 'recap.title' | t: { month: monthName() } }}</h1>
      <div class="bars" aria-hidden="true">
        @for (s of slides(); track s; let i = $index) {
          <i [class.done]="i < index()" [class.now]="i === index()" [class.paused]="held()"><b [style.animation-duration.ms]="SLIDE_MS"></b></i>
        }
      </div>
      <button type="button" class="close" [attr.aria-label]="'common.close' | t" (click)="leave()"><app-icon name="x" [size]="22" [stroke]="2.4" /></button>

      @if (recap(); as r) {
        @switch (slide()) {
          @case ('intro') {
            <section class="slide intro">
              <p class="kicker">{{ 'recap.kicker' | t }}</p>
              <h2 class="huge">{{ monthName() }}</h2>
              <p class="lead">{{ 'recap.hello' | t: { name: r.firstName } }}</p>
              <p class="sub">{{ 'recap.introLine' | t: { w: r.weight.days, m: r.meals.days } }}</p>
            </section>
          }
          @case ('weight') {
            <section class="slide">
              <p class="kicker">{{ 'recap.weightKicker' | t }}</p>
              <h2 class="huge num">{{ deltaText() }}<small> kg</small></h2>
              <p class="lead num">{{ 'recap.fromTo' | t: { from: i18n.number(r.weight.startKg ?? 0, 1), to: i18n.number(r.weight.endKg ?? 0, 1) } }}</p>
              <svg class="curve" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
                <path [attr.d]="curve()" />
              </svg>
              <p class="sub">{{ ((r.weight.deltaKg ?? 0) <= 0 ? 'recap.weightDown' : 'recap.weightUp') | t }}</p>
            </section>
          }
          @case ('run') {
            <section class="slide">
              <p class="kicker">{{ 'recap.runKicker' | t }}</p>
              <h2 class="huge num">{{ r.bestRun }}</h2>
              <p class="lead">{{ (r.bestRun === 1 ? 'recap.runOne' : 'recap.runMany') | t }}</p>
              @if (r.milestones.length) {
                <ul class="chips">
                  @for (m of r.milestones; track m) {
                    <li>🏅 {{ 'recap.milestone' | t: { kg: i18n.number(m, 1) } }}</li>
                  }
                </ul>
              }
            </section>
          }
          @case ('meals') {
            <section class="slide">
              <p class="kicker">{{ 'recap.mealsKicker' | t }}</p>
              <h2 class="huge num">{{ r.meals.days }}<small> {{ 'recap.days' | t }}</small></h2>
              @if (r.meals.avgKcal != null) {
                <p class="lead num">{{ 'recap.avgKcal' | t: { kcal: i18n.number(r.meals.avgKcal) } }}@if (r.targetKcal) { · {{ 'recap.target' | t: { kcal: i18n.number(r.targetKcal) } }} }</p>
              }
              @if (r.meals.avgHealth != null) {
                <p class="health"><app-health-score [score]="r.meals.avgHealth" /> {{ 'recap.health' | t }}</p>
              }
              @if (r.meals.top.length) {
                <p class="sub">{{ 'recap.top' | t }}</p>
                <ol class="top">
                  @for (t of r.meals.top; track t.name) {
                    <li><span>{{ t.name }}</span><b class="num">× {{ t.count }}</b></li>
                  }
                </ol>
              }
            </section>
          }
          @case ('water') {
            <section class="slide">
              <p class="kicker">{{ 'recap.waterKicker' | t }}</p>
              <h2 class="huge num">{{ r.waterDays }}<small> / {{ r.daysInMonth }}</small></h2>
              <p class="lead">{{ 'recap.water' | t: { n: r.waterGoal ?? 0 } }}</p>
              <div class="drops" aria-hidden="true">
                @for (d of dots(r.daysInMonth); track d) {
                  <i [class.on]="d < r.waterDays"></i>
                }
              </div>
            </section>
          }
          @case ('photos') {
            <section class="slide">
              <p class="kicker">{{ 'recap.photosKicker' | t }}</p>
              <div class="pair">
                <figure>
                  <img [src]="r.photos.first!.thumbUrl" alt="" />
                  <figcaption>{{ i18n.date(r.photos.first!.day, { day: 'numeric', month: 'short' }) }}</figcaption>
                </figure>
                <figure>
                  <img [src]="r.photos.last!.thumbUrl" alt="" />
                  <figcaption>{{ i18n.date(r.photos.last!.day, { day: 'numeric', month: 'short' }) }}</figcaption>
                </figure>
              </div>
              <p class="sub">{{ (r.photos.count === 1 ? 'recap.photosOne' : 'recap.photosMany') | t: { n: r.photos.count } }}</p>
            </section>
          }
          @case ('outro') {
            <section class="slide outro">
              <p class="kicker">{{ 'recap.outroKicker' | t }}</p>
              <h2 class="big">{{ 'recap.outro' | t: { month: nextMonthName() } }}</h2>
              <div class="actions" (pointerdown)="$event.stopPropagation()">
                <button type="button" class="btn btn-primary btn-block" [disabled]="sharing()" (click)="share($event)">
                  <app-icon name="share" /> {{ 'recap.share' | t }}
                </button>
                <button type="button" class="btn btn-ghost btn-block light" (click)="restart($event)"><app-icon name="repeat" [size]="18" /> {{ 'recap.again' | t }}</button>
                <button type="button" class="btn btn-ghost btn-block light" (click)="previous($event)">
                  <app-icon name="chevronLeft" [size]="18" /> {{ 'recap.before' | t: { month: previousMonthName() } }}
                </button>
              </div>
            </section>
          }
        }
        <button type="button" class="zone left" [attr.aria-label]="'recap.prev' | t" (click)="go(-1)"></button>
        <button type="button" class="zone right" [attr.aria-label]="'recap.next' | t" (click)="go(1)"></button>
      } @else if (failed()) {
        <section class="slide">
          <h2 class="big">{{ 'recap.failed' | t }}</h2>
          <button type="button" class="btn btn-secondary light" (click)="leave()">{{ 'common.close' | t }}</button>
        </section>
      } @else {
        <section class="slide"><span class="spin" aria-hidden="true"></span></section>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
    }
    .story {
      position: fixed;
      inset: 0;
      z-index: 120;
      overflow: hidden;
      color: #fff;
      background: linear-gradient(160deg, #2b1055 0%, #7a2a6b 55%, #ff6a3d 100%);
      transition: background 600ms ease;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
    }
    .story[data-slide='weight'] {
      background: linear-gradient(160deg, #0f3b2e 0%, #1f7a5a 60%, #b6e05a 100%);
    }
    .story[data-slide='run'] {
      background: linear-gradient(160deg, #4a1209 0%, #c4320a 55%, #ffb03b 100%);
    }
    .story[data-slide='meals'] {
      background: linear-gradient(160deg, #3a1d00 0%, #a35a00 55%, #ffd166 100%);
    }
    .story[data-slide='water'] {
      background: linear-gradient(160deg, #06224a 0%, #1d5fd6 55%, #6fd3ff 100%);
    }
    .story[data-slide='photos'] {
      background: linear-gradient(160deg, #111 0%, #333 60%, #6b6b6b 100%);
    }
    .bars {
      position: absolute;
      top: calc(var(--safe-top) + 10px);
      left: 12px;
      right: 12px;
      z-index: 3;
      display: flex;
      gap: 4px;
    }
    .bars i {
      flex: 1;
      height: 3px;
      overflow: hidden;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.3);
    }
    .bars b {
      display: block;
      height: 100%;
      width: 0;
      background: #fff;
    }
    .bars i.done b {
      width: 100%;
    }
    .bars i.now b {
      animation: fill linear forwards;
    }
    .bars i.now.paused b {
      animation-play-state: paused;
    }
    @keyframes fill {
      to {
        width: 100%;
      }
    }
    .close {
      position: absolute;
      top: calc(var(--safe-top) + 22px);
      right: 10px;
      z-index: 4;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.18);
      color: #fff;
      cursor: pointer;
    }
    .zone {
      position: absolute;
      top: calc(var(--safe-top) + 70px);
      bottom: 0;
      z-index: 1;
      width: 38%;
      border: 0;
      background: transparent;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .zone.left {
      left: 0;
    }
    .zone.right {
      right: 0;
      width: 62%;
    }
    /* the text lets the taps through to the zones under it (back, next); only its buttons take them */
    .slide {
      position: absolute;
      z-index: 2;
      pointer-events: none;
      inset: calc(var(--safe-top) + 72px) 28px calc(var(--safe-bottom) + 40px);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 14px;
      animation: slide-in 520ms cubic-bezier(0.32, 0.72, 0, 1) both;
    }
    .slide > * {
      margin: 0;
      animation: rise 620ms cubic-bezier(0.32, 0.72, 0, 1) both;
    }
    .slide > :nth-child(2) {
      animation-delay: 80ms;
    }
    .slide > :nth-child(3) {
      animation-delay: 160ms;
    }
    .slide > :nth-child(4) {
      animation-delay: 240ms;
    }
    .slide > :nth-child(5) {
      animation-delay: 320ms;
    }
    @keyframes slide-in {
      from {
        opacity: 0;
      }
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(18px);
      }
    }
    .kicker {
      font-size: var(--fs-s);
      font-weight: 750;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .huge {
      font-family: var(--font-display);
      font-stretch: 120%;
      font-weight: 800;
      font-size: clamp(4.5rem, 24vw, 8rem);
      line-height: 0.95;
      letter-spacing: -0.04em;
      text-transform: capitalize;
    }
    .huge small {
      font-size: 0.32em;
      letter-spacing: 0;
      text-transform: none;
    }
    .big {
      font-family: var(--font-display);
      font-stretch: 115%;
      font-weight: 800;
      font-size: clamp(2.2rem, 10vw, 3.2rem);
      line-height: 1.05;
    }
    /* white on the story, whatever the global .lead says */
    .lead {
      max-width: none;
      color: #fff;
      font-size: 1.25rem;
      font-weight: 700;
    }
    .sub {
      font-size: var(--fs-m);
      opacity: 0.9;
    }
    .curve {
      width: 100%;
      height: 120px;
    }
    .curve path {
      fill: none;
      stroke: #fff;
      stroke-width: 4;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      stroke-dasharray: 1200;
      stroke-dashoffset: 1200;
      animation: draw 1400ms 200ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
    }
    @keyframes draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0;
      list-style: none;
    }
    .chips li {
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      font-weight: 650;
    }
    .health {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 650;
    }
    .top {
      display: grid;
      gap: 8px;
      padding: 0;
      list-style: none;
      counter-reset: top;
    }
    .top li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.16);
      font-weight: 650;
      counter-increment: top;
    }
    .top li::before {
      content: counter(top);
      font-family: var(--font-display);
      font-weight: 800;
      opacity: 0.8;
    }
    .top li span {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .drops {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 6px;
      max-width: 320px;
    }
    .drops i {
      aspect-ratio: 1;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      background: rgba(255, 255, 255, 0.25);
    }
    .drops i.on {
      background: #fff;
    }
    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .pair figure {
      margin: 0;
    }
    .pair img {
      width: 100%;
      aspect-ratio: 3 / 4;
      object-fit: cover;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.12);
    }
    .pair figcaption {
      margin-top: 6px;
      font-weight: 650;
      text-align: center;
    }
    .actions {
      position: relative;
      pointer-events: auto;
      display: grid;
      gap: 10px;
      margin-top: 10px;
    }
    .light {
      color: #fff;
    }
    .spin {
      width: 34px;
      height: 34px;
      margin: auto;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .slide,
      .slide > *,
      .curve path {
        animation: none;
        stroke-dashoffset: 0;
      }
    }
  `,
})
export class RecapPage {
  /** the month (YYYY-MM), from the route */
  readonly month = input.required<string>();
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(HabitsApi);
  private readonly stack = inject(StackNavigation);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly SLIDE_MS = SLIDE_MS;
  protected readonly recap = signal<MonthRecap | null>(null);
  protected readonly failed = signal(false);
  protected readonly index = signal(0);
  protected readonly held = signal(false);
  protected readonly sharing = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private left = SLIDE_MS;
  private startedAt = 0;

  /** the slides worth showing for this month */
  protected readonly slides = computed<Slide[]>(() => {
    const r = this.recap();
    if (!r) return ['intro'];
    const out: Slide[] = ['intro'];
    if (r.weight.days >= 2 && r.weight.deltaKg != null) out.push('weight');
    if (r.bestRun >= 2 || r.milestones.length) out.push('run');
    if (r.meals.days > 0) out.push('meals');
    if (r.waterGoal && r.waterDays > 0) out.push('water');
    if (r.photos.first && r.photos.last) out.push('photos');
    out.push('outro');
    return out;
  });
  protected readonly slide = computed(() => this.slides()[Math.min(this.index(), this.slides().length - 1)]);

  protected readonly monthName = computed(() => this.nameOf(this.month()));
  protected readonly nextMonthName = computed(() => this.nameOf(this.shift(this.month(), 1)));
  protected readonly previousMonthName = computed(() => this.nameOf(this.shift(this.month(), -1)));
  protected readonly deltaText = computed(() => {
    const d = this.recap()?.weight.deltaKg ?? 0;
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${this.i18n.number(Math.abs(d), 1)}`;
  });
  /** the weigh-ins of the month as a line, the lightest low */
  protected readonly curve = computed(() => {
    const pts = this.recap()?.weight.points ?? [];
    if (pts.length < 2) return '';
    const kgs = pts.map((p) => p.kg);
    const min = Math.min(...kgs);
    const max = Math.max(...kgs);
    const span = Math.max(0.5, max - min);
    return pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 300).toFixed(1)},${(10 + ((max - p.kg) / span) * 100).toFixed(1)}`).join(' ');
  });

  constructor() {
    effect(() => {
      const month = this.month();
      this.recap.set(null);
      this.failed.set(false);
      this.index.set(0);
      this.api
        .recap(month)
        .then((r) => {
          this.recap.set(r);
          this.arm(SLIDE_MS);
        })
        .catch(() => this.failed.set(true));
    });
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  protected dots(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  protected go(delta: number): void {
    const next = this.index() + delta;
    if (next < 0) {
      this.index.set(0);
    } else if (next >= this.slides().length) {
      return;
    } else {
      this.index.set(next);
      haptic('tap');
    }
    this.arm(SLIDE_MS);
  }

  /** a press holds the slide (to read it), as in a story */
  protected hold(on: boolean): void {
    if (this.held() === on) return;
    this.held.set(on);
    if (on) {
      this.left = Math.max(300, this.left - (Date.now() - this.startedAt));
      this.clear();
    } else {
      this.arm(this.left);
    }
  }

  protected leave(): void {
    this.stack.back('/app/progress');
  }

  protected restart(e: Event): void {
    e.stopPropagation();
    this.index.set(0);
    this.arm(SLIDE_MS);
  }

  protected previous(e: Event): void {
    e.stopPropagation();
    void this.router.navigate(['/app/progress/recap', this.shift(this.month(), -1)], { replaceUrl: true });
  }

  protected async share(e: Event): Promise<void> {
    e.stopPropagation();
    const r = this.recap();
    if (!r) return;
    this.sharing.set(true);
    try {
      const blob = await recapImage(r, this.monthName(), this.i18n);
      await shareImage(blob, `mybody365-${r.month}.png`, this.i18n.t('recap.shareText', { month: this.monthName() }));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.sharing.set(false);
    }
  }

  private arm(ms: number): void {
    this.clear();
    this.left = ms;
    this.startedAt = Date.now();
    // the last slide stays
    if (this.index() >= this.slides().length - 1) return;
    this.timer = setTimeout(() => this.go(1), ms);
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private shift(month: string, delta: number): string {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1, 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private nameOf(month: string): string {
    if (!/^\d{4}-\d{2}$/.test(month)) return month;
    const name = this.i18n.date(month + '-15', { month: 'long' });
    // the year, when not this one
    return month.slice(0, 4) === localDay().slice(0, 4) ? name : `${name} ${month.slice(0, 4)}`;
  }
}
