import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import type { Job, Sex, Summary } from '../../core/api/models';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TrackingStore, localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';
import { PacePickerComponent } from './pace-picker.component';
import { ActivityPickerComponent } from './activity-picker.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { SegDirective } from '../../shared/seg.directive';
import { MonthlyForecastComponent } from './monthly-forecast.component';

type Step = 'consent' | 'about' | 'body' | 'check' | 'goal' | 'plan';


/**
 * First visit, in a few steps: the two consents (18+, health data), then the body profile the plan
 * needs (sex, birth date, height, today's weight, goal, pace, activity), then the plan itself.
 */
@Component({
  selector: 'app-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MonthlyForecastComponent, PacePickerComponent, ActivityPickerComponent, SegDirective, FormsModule, RouterLink, TranslatePipe, IconComponent, NumberStepperComponent],
  template: `
    <main class="page no-tabs">
      <header class="top">
        @if (stepIndex() > 0 && step() !== 'plan') {
          <button type="button" class="icon-btn" (click)="previous()" [attr.aria-label]="'setup.back' | t">
            <app-icon name="chevronLeft" />
          </button>
        } @else {
          <span class="spacer-44"></span>
        }
        <div class="dots" role="progressbar" [attr.aria-label]="'setup.step' | t: { n: stepIndex() + 1, total: steps().length }" [attr.aria-valuenow]="stepIndex() + 1" aria-valuemin="1" [attr.aria-valuemax]="steps().length">
          @for (s of steps(); track s; let i = $index) {
            <span [class.on]="i <= stepIndex()"></span>
          }
        </div>
        <span class="spacer-44"></span>
      </header>

      @switch (step()) {
        @case ('consent') {
          <section class="step" [class.back]="backwards()">
            <span class="badge"><app-icon name="flame" [size]="34" [stroke]="2" /></span>
            <h1 class="display title">{{ 'onboarding.hello' | t: { name: name() } }}</h1>
            <p class="lead">{{ 'onboarding.text' | t }}</p>
            <label class="check">
              <input type="checkbox" name="adult" [(ngModel)]="adult" />
              <span><strong>{{ 'onboarding.adult' | t }}</strong><span class="small muted block">{{ 'onboarding.adultHint' | t }}</span></span>
            </label>
            <label class="check">
              <input type="checkbox" name="health" [(ngModel)]="health" />
              <span><strong>{{ 'onboarding.health' | t }}</strong><span class="small muted block">{{ 'onboarding.healthHint' | t }}</span></span>
            </label>
            <a [routerLink]="prefix() + '/legal/confidentialite'" class="small link">{{ 'onboarding.readPrivacy' | t }} →</a>
            <button type="button" class="btn btn-primary btn-block" [disabled]="!adult || !health || busy()" (click)="consent()">
              {{ 'setup.next' | t }} <app-icon name="arrowRight" />
            </button>
          </section>
        }
        @case ('about') {
          <section class="step" [class.back]="backwards()">
            <p class="eyebrow">{{ 'setup.step' | t: { n: stepIndex() + 1, total: steps().length } }}</p>
            <h1 class="display title">{{ 'setup.aboutTitle' | t }}</h1>
            <p class="muted">{{ 'setup.aboutText' | t }}</p>
            <span class="label">{{ 'setup.sex' | t }}</span>
            <div class="seg" role="radiogroup" [attr.aria-label]="'setup.sex' | t">
              @for (s of sexes; track s) {
                <button type="button" role="radio" [attr.aria-checked]="sex() === s" [attr.aria-pressed]="sex() === s" (click)="sex.set(s)">
                  {{ 'setup.sexes.' + s | t }}
                </button>
              }
            </div>
            <div class="field">
              <label for="birth">{{ 'setup.birthDate' | t }}</label>
              <span class="input-icon">
                <input id="birth" class="input" type="date" [class.no-value]="!birthDate()" [max]="maxBirth" min="1920-01-01" [ngModel]="birthDate()" (ngModelChange)="birthDate.set($event)" />
                @if (!birthDate()) {
                  <span class="placeholder" aria-hidden="true">{{ 'setup.birthPlaceholder' | t }}</span>
                }
                <span class="end"><app-icon name="calendar" [size]="19" /></span>
              </span>
            </div>
            <button type="button" class="btn btn-primary btn-block" [disabled]="!sex() || !birthOk()" (click)="next()">
              {{ 'setup.next' | t }} <app-icon name="arrowRight" />
            </button>
          </section>
        }
        @case ('body') {
          <section class="step" [class.back]="backwards()">
            <p class="eyebrow">{{ 'setup.step' | t: { n: stepIndex() + 1, total: steps().length } }}</p>
            <h1 class="display title">{{ 'setup.bodyTitle' | t }}</h1>
            <p class="muted">{{ 'setup.bodyText' | t }}</p>
            <span class="label">{{ 'setup.height' | t }}</span>
            <app-number-stepper [(value)]="height" [step]="1" [min]="120" [max]="230" [decimals]="0" unit="cm" [label]="'setup.height' | t" />
            <span class="label">{{ 'setup.weight' | t }}</span>
            <app-number-stepper [(value)]="weight" (valueChange)="weightTouched = true" [step]="0.1" [min]="35" [max]="300" [decimals]="1" unit="kg" [label]="'setup.weight' | t"
              [minusLabel]="'weigh.minus' | t" [plusLabel]="'weigh.plus' | t" />
            <button type="button" class="btn btn-primary btn-block" (click)="next()">
              {{ 'setup.next' | t }} <app-icon name="arrowRight" />
            </button>
          </section>
        }
        @case ('check') {
          <!-- 1.17: the starting point read once more, big: a slip of a few kilos would follow the whole journey -->
          <section class="step check" [class.back]="backwards()">
            <p class="eyebrow">{{ 'setup.step' | t: { n: stepIndex() + 1, total: steps().length } }}</p>
            <h1 class="display title">{{ 'setup.checkTitle' | t }}</h1>
            <div class="card check-card">
              <span class="label">{{ 'setup.checkWeight' | t }}</span>
              <span class="check-kg num">{{ i18n.number(weight(), 1) }} <small>kg</small></span>
              <span class="small muted num">{{ 'setup.checkHeight' | t: { m: i18n.number(height() / 100, 2), bmi: i18n.number(bmi(), 1) } }}</span>
            </div>
            @if (!weightTouched) {
              <p class="notice notice-accent" role="alert"><app-icon name="alert" /> {{ 'setup.checkUntouched' | t: { kg: i18n.number(weight(), 1) } }}</p>
            }
            <p class="muted">{{ 'setup.checkText' | t }}</p>
            <button type="button" class="btn btn-primary btn-block" (click)="toGoal()">
              <app-icon name="check" /> {{ 'setup.checkOk' | t }}
            </button>
            <button type="button" class="btn btn-secondary btn-block" (click)="previous()">
              <app-icon name="pencil" /> {{ 'setup.checkFix' | t }}
            </button>
          </section>
        }
        @case ('goal') {
          <section class="step" [class.back]="backwards()">
            <p class="eyebrow">{{ 'setup.step' | t: { n: stepIndex() + 1, total: steps().length } }}</p>
            <h1 class="display title">{{ 'setup.goalTitle' | t }}</h1>
            <p class="muted">{{ 'setup.goalText' | t }}</p>
            <span class="label">{{ 'setup.goalWeight' | t }}</span>
            <app-number-stepper [(value)]="goal" (valueChange)="goalTouched = true" [step]="0.5" [min]="minGoal()" [max]="300" [decimals]="1" unit="kg" [label]="'setup.goalWeight' | t" />
            <p class="hint">{{ 'setup.goalMin' | t: { kg: i18n.number(minGoal(), 1) } }}</p>

            <app-pace-picker [weight]="weight()" [goal]="goal()" [(pace)]="pace" />
            @if (eta(); as date) {
              <p class="eta"><app-icon name="target" [size]="18" /> {{ 'setup.eta' | t: { date: date } }}</p>
            }

            <app-activity-picker [(job)]="job" [(sessions)]="sessions" />
            @if (error()) {
              <p class="notice notice-danger" role="alert"><app-icon name="alert" /> {{ error() }}</p>
            }
            <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="save()">
              {{ 'setup.finish' | t }} <app-icon name="arrowRight" />
            </button>
          </section>
        }
        @case ('plan') {
          @if (plan(); as p) {
            <section class="step plan">
              <span class="badge"><app-icon name="sparkles" [size]="30" [stroke]="2" /></span>
              <h1 class="display title">{{ 'setup.planTitle' | t }}</h1>
              <p class="muted">{{ 'setup.planText' | t }}</p>
              <div class="plan-grid">
                <div class="card big-card">
                  <span class="label">{{ 'setup.planKcal' | t }}</span>
                  <span class="big num">{{ i18n.number(p.energy.targetKcal) }}</span>
                  <span class="small muted">{{ 'setup.planKcalUnit' | t }}</span>
                </div>
                <div class="card">
                  <span class="label">{{ 'setup.planChange' | t }}</span>
                  <span class="mid num">{{ i18n.number(Math.abs(p.goal.remainingKg), 1) }} kg</span>
                </div>
                <div class="card">
                  <span class="label">{{ 'setup.planDate' | t }}</span>
                  <span class="mid">{{ p.goal.planDate ? i18n.date(p.goal.planDate, { day: 'numeric', month: 'long' }) : '—' }}</span>
                </div>
              </div>
              <app-monthly-forecast [fromKg]="p.current.weightKg ?? p.profile.startWeightKg" [goalKg]="p.goal.goalKg" [kgPerWeek]="p.profile.weeklyRateKg" />
              @if (p.energy.floorApplied) {
                <p class="notice notice-accent"><app-icon name="alert" /> {{ 'setup.planFloor' | t }}</p>
              }
              <button type="button" class="btn btn-primary btn-block" (click)="start()">{{ 'setup.start' | t }} <app-icon name="flame" /></button>
              <p class="tiny faint">{{ 'setup.medical' | t }}</p>
            </section>
          }
        }
      }
    </main>
  `,
  styles: `
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 52px;
    }
    .spacer-44 {
      width: 44px;
    }
    .dots {
      display: flex;
      gap: 6px;
    }
    .check-card {
      display: grid;
      justify-items: center;
      gap: 4px;
      padding: var(--space-5) var(--space-4);
      text-align: center;
    }
    .check-kg {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-size: clamp(3rem, 16vw, 4.4rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.05;
      animation: kg-in 520ms var(--ease-out) both 120ms;
    }
    .check-kg small {
      font-size: 0.42em;
      font-weight: 700;
      color: var(--fg-2);
    }
    @keyframes kg-in {
      from {
        opacity: 0;
        transform: scale(0.92);
      }
    }
    .dots span {
      width: 22px;
      height: 6px;
      border-radius: 3px;
      background: var(--surface-3);
      transition: background-color var(--dur-3), width var(--dur-3) var(--ease-out);
    }
    .dots span.on {
      width: 30px;
      background: var(--flame);
    }
    .step {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
      animation: step-in 420ms var(--ease-out) both;
    }
    .step.back {
      animation-name: step-back;
    }
    @keyframes step-in {
      from {
        opacity: 0;
        transform: translateX(28px);
      }
    }
    @keyframes step-back {
      from {
        opacity: 0;
        transform: translateX(-28px);
      }
    }
    .title {
      font-size: 2.3rem;
    }
    .badge {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 22px;
      background: var(--flame);
      color: var(--accent-ink);
      box-shadow: 0 14px 30px -10px var(--accent-glow);
      animation: pop 600ms var(--ease-out) both;
    }
    @keyframes pop {
      from {
        transform: scale(0.6) rotate(-10deg);
        opacity: 0;
      }
    }
    .block {
      display: block;
      margin-top: 4px;
      font-weight: 400;
    }
    .link {
      color: var(--accent-text);
      font-weight: 600;
    }
    .label {
      margin-top: var(--space-2);
    }
    .choices {
      display: grid;
      gap: var(--space-2);
    }
    .choices.two {
      grid-template-columns: 1fr 1fr;
    }
    .choice {
      display: grid;
      gap: 2px;
      padding: 14px 16px;
      border-radius: var(--radius-m);
      background: var(--surface);
      border: 1.5px solid var(--line);
      text-align: left;
      transition: border-color var(--dur-2), background-color var(--dur-2), transform var(--dur-1) var(--ease-out);
    }
    .choice.is-pressed {
      transform: scale(0.98);
    }
    .choice[aria-checked='true'] {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .row-choice {
      grid-template-columns: auto 1fr;
      align-items: baseline;
      gap: 10px;
    }
    .row-choice .small {
      text-align: right;
    }
    .eta {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--cool-soft);
      color: var(--cool);
      font-weight: 650;
      font-size: var(--fs-s);
    }
    .plan-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .plan-grid .card {
      display: grid;
      gap: 4px;
      animation: rise 500ms var(--ease-out) both;
    }
    .plan-grid .card:nth-child(2) {
      animation-delay: 80ms;
    }
    .plan-grid .card:nth-child(3) {
      animation-delay: 160ms;
    }
    .big-card {
      grid-column: 1 / -1;
      background:
        radial-gradient(120% 120% at 0% 0%, var(--accent-soft), transparent 60%),
        var(--surface);
    }
    .big {
      font-family: var(--font-display);
      font-stretch: 122%;
      font-weight: 800;
      font-size: 3.4rem;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .mid {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-weight: 800;
      font-size: 1.4rem;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
  `,
})
export class WelcomePage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly tracking = inject(TrackingStore);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);
  protected readonly Math = Math;

  protected readonly sexes: Sex[] = ['FEMALE', 'MALE', 'OTHER'];
  protected readonly maxBirth = localDay(new Date(new Date().getFullYear() - 18, new Date().getMonth(), new Date().getDate()));

  protected adult = false;
  protected health = false;
  protected readonly sex = signal<Sex | null>(null);
  protected readonly birthDate = signal<string>('');
  protected readonly height = signal(170);
  protected readonly weight = signal(75);
  /** 1.17: the weight offered at first was never changed (said on the check step) */
  protected weightTouched = false;
  protected readonly bmi = computed(() => this.weight() / (this.height() / 100) ** 2);
  protected readonly goal = signal(70);
  /** until the person picks a goal, it follows their weight (5 kg lower) */
  protected goalTouched = false;
  protected readonly pace = signal<number>(0.5);
  protected readonly job = signal<Job>('SEATED');
  protected readonly sessions = signal(2);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly plan = signal<Summary | null>(null);
  protected readonly backwards = signal(false);

  protected readonly steps = computed<Step[]>(() =>
    this.session.account()?.onboarded ? ['about', 'body', 'check', 'goal', 'plan'] : ['consent', 'about', 'body', 'check', 'goal', 'plan'],
  );
  protected readonly step = signal<Step>(this.steps()[0]);
  protected readonly stepIndex = computed(() => this.steps().indexOf(this.step()));
  protected readonly name = computed(() => this.session.account()?.displayName ?? '');
  protected readonly prefix = computed(() => (this.i18n.lang() === 'en' ? '/en' : ''));
  protected readonly birthOk = computed(() => !!this.birthDate() && this.birthDate() <= this.maxBirth);
  protected readonly minGoal = signal(53);

  /** the date at the chosen pace, worked out here (the server gives the final one) */
  protected readonly eta = computed(() => {
    const kg = Math.abs(this.weight() - this.goal());
    if (kg < 0.1) return null;
    const days = Math.ceil((kg / this.pace()) * 7);
    const d = new Date();
    d.setDate(d.getDate() + days);
    return this.i18n.date(localDay(d), { day: 'numeric', month: 'long', year: 'numeric' });
  });


  protected next(): void {
    this.backwards.set(false);
    const i = this.stepIndex();
    this.step.set(this.steps()[Math.min(i + 1, this.steps().length - 1)]);
  }

  protected previous(): void {
    this.backwards.set(true);
    this.step.set(this.steps()[Math.max(0, this.stepIndex() - 1)]);
  }

  protected toGoal(): void {
    const m = this.height() / 100;
    this.minGoal.set(Math.ceil(18.5 * m * m * 10) / 10);
    if (!this.goalTouched || this.goal() >= this.weight() || this.goal() < this.minGoal()) {
      this.goal.set(Math.max(this.minGoal(), Math.round((this.weight() - 5) * 2) / 2));
    }
    this.next();
  }

  protected async consent(): Promise<void> {
    this.busy.set(true);
    try {
      this.session.setAccount(await this.api.consent());
      // the consent step disappears from the list: carry on with the first profile step
      this.backwards.set(false);
      this.step.set('about');
    } catch (e) {
      this.error.set(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    const sex = this.sex();
    if (!sex) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const summary = await this.tracking.saveProfile({
        sex,
        birthDate: this.birthDate(),
        heightCm: this.height(),
        job: this.job(),
        sessionsPerWeek: this.sessions(),
        currentWeightKg: this.weight(),
        goalWeightKg: this.goal(),
        weeklyRateKg: this.pace(),
      });
      this.plan.set(summary);
      this.next();
    } catch (e) {
      this.error.set(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async start(): Promise<void> {
    await this.router.navigateByUrl('/app');
  }
}
