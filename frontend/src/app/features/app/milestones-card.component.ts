import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import type { Milestone } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TrackingStore } from '../../core/tracking/tracking.store';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';

/**
 * « Mes paliers » (1.8): steps of one's own on the way to the goal, each with a reward if one wants (« un resto »).
 * The next one shows how far it still is; a reached one keeps its day. None yet: some are proposed (a step every few
 * kilos between the start and the goal), one tap and they are there.
 */
@Component({
  selector: 'app-milestones-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, NumberStepperComponent],
  template: `
    <section class="card ms-card" [attr.aria-label]="'progress.milestones.title' | t">
      <div class="ms-head">
        <h2 class="h3">{{ 'progress.milestones.title' | t }}</h2>
        @if (list().length && list().length < 10) {
          <button type="button" class="btn btn-ghost btn-s" (click)="open()"><app-icon name="plus" [size]="16" /> {{ 'progress.milestones.add' | t }}</button>
        }
      </div>
      @if (list().length) {
        <ul class="ms-list" role="list">
          @for (m of rows(); track m.id) {
            <li class="ms" [class.reached]="m.reachedOn" [class.next]="m.id === nextId()">
              <span class="ms-ico" aria-hidden="true">{{ m.reachedOn ? '🏅' : m.id === nextId() ? '🎯' : '⛳' }}</span>
              <span class="ms-body">
                <span class="ms-line">
                  <b class="num">{{ kg(m.targetKg) }} kg</b>
                  <span class="tiny muted">
                    {{ m.reachedOn ? ('progress.milestones.reached' | t: { date: i18n.date(m.reachedOn, { day: 'numeric', month: 'long' }) })
                      : ('progress.milestones.left' | t: { kg: i18n.number(m.left, 1) }) }}
                  </span>
                </span>
                @if (m.reward) {
                  <span class="small reward">🎁 {{ m.reward }}</span>
                }
                @if (!m.reachedOn) {
                  <span class="bar" aria-hidden="true"><i [style.width.%]="m.pct"></i></span>
                }
              </span>
              <button type="button" class="icon-btn" [attr.aria-label]="'progress.milestones.editOf' | t: { kg: kg(m.targetKg) }" (click)="open(m)">
                <app-icon name="pencil" [size]="18" />
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="small muted">{{ 'progress.milestones.empty' | t }}</p>
        <div class="ms-actions">
          @if (suggestions().length) {
            <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="suggest()">
              <app-icon name="sparkles" [size]="18" /> {{ 'progress.milestones.suggest' | t: { list: suggestionText() } }}
            </button>
          }
          <button type="button" class="btn btn-ghost" (click)="open()"><app-icon name="plus" [size]="18" /> {{ 'progress.milestones.addOwn' | t }}</button>
        </div>
      }
    </section>

    <dialog class="sheet" #sheet [attr.aria-label]="(editing() ? 'progress.milestones.edit' : 'progress.milestones.add') | t">
      <div class="sheet-grip"></div>
      <form class="stack" (ngSubmit)="save()">
        <h2 class="h3">{{ (editing() ? 'progress.milestones.edit' : 'progress.milestones.add') | t }}</h2>
        <span class="label">{{ 'progress.milestones.target' | t }}</span>
        <app-number-stepper [(value)]="target" [step]="0.5" [min]="30" [max]="300" [decimals]="1" unit="kg" [label]="'progress.milestones.target' | t" />
        <div class="field">
          <label class="label" for="ms-reward">{{ 'progress.milestones.reward' | t }}</label>
          <input class="input" id="ms-reward" name="reward" maxlength="80" autocomplete="off" [placeholder]="'progress.milestones.rewardPlaceholder' | t" [(ngModel)]="reward" />
        </div>
        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()"><app-icon name="check" /> {{ 'common.save' | t }}</button>
        @if (editing(); as m) {
          <button type="button" class="btn btn-ghost btn-block danger" [disabled]="busy()" (click)="remove(m)"><app-icon name="trash" [size]="18" /> {{ 'progress.milestones.delete' | t }}</button>
        }
      </form>
    </dialog>
  `,
  styles: `
    .ms-card {
      display: grid;
      gap: var(--space-3);
    }
    .ms-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .ms-head .h3 {
      margin: 0;
    }
    .ms-list {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ms {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--space-3);
      padding: 10px 6px 10px 10px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .ms.next {
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent);
    }
    .ms-ico {
      font-size: 1.5rem;
      line-height: 1;
    }
    .ms.reached .ms-ico {
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2));
    }
    .ms-body {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .ms-line {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }
    .reward {
      overflow-wrap: anywhere;
    }
    .bar {
      height: 6px;
      border-radius: 99px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--flame);
      transition: width var(--dur-3) var(--ease-out);
    }
    .ms-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .danger {
      color: var(--danger);
    }
  `,
})
export class MilestonesCardComponent {
  protected readonly i18n = inject(I18nService);
  private readonly tracking = inject(TrackingStore);
  private readonly toast = inject(ToastService);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');
  protected readonly busy = signal(false);
  protected readonly editing = signal<Milestone | null>(null);
  protected readonly target = signal(70);
  protected reward = '';

  protected readonly list = computed(() => this.tracking.milestones() ?? []);
  private readonly start = computed(() => this.tracking.summary()?.profile.startWeightKg ?? null);
  private readonly goal = computed(() => this.tracking.summary()?.profile.goalWeightKg ?? null);
  private readonly current = computed(() => this.tracking.lastWeight());
  private readonly gaining = computed(() => (this.goal() ?? 0) > (this.start() ?? 0));

  /** each milestone with how far it still is, and the way already done towards it */
  protected readonly rows = computed(() => {
    const start = this.start();
    const now = this.current();
    return this.list().map((m) => {
      const left = now == null ? 0 : Math.max(0, this.gaining() ? m.targetKg - now : now - m.targetKg);
      const span = start == null ? 0 : Math.abs(start - m.targetKg);
      const pct = span > 0 && now != null && start != null ? Math.max(0, Math.min(100, (Math.abs(start - now) / span) * 100)) : 0;
      return { ...m, left, pct };
    });
  });
  /** the first one still ahead */
  protected readonly nextId = computed(() => this.list().find((m) => !m.reachedOn)?.id ?? null);

  /** a step every 5 kg on a long way, every 3 or 2 on a shorter one, between the start and the goal (5 at most) */
  protected readonly suggestions = computed(() => {
    const s = this.start();
    const g = this.goal();
    if (s == null || g == null || Math.abs(s - g) < 2) return [];
    const d = Math.abs(s - g);
    const step = d > 20 ? 5 : d > 8 ? 3 : 2;
    const out: number[] = [];
    const down = g < s;
    for (let k = 1; out.length < 5; k++) {
      const kg = down ? Math.floor(s) - k * step : Math.ceil(s) + k * step;
      if (down ? kg <= g : kg >= g) break;
      out.push(kg);
    }
    return out;
  });
  protected readonly suggestionText = computed(() => this.suggestions().map((kg) => this.i18n.number(kg)).join(', ') + ' kg');

  constructor() {
    if (!this.tracking.milestones()) void this.tracking.loadMilestones().catch(() => undefined);
  }

  /** « 73 kg », « 72,5 kg » */
  protected kg(v: number): string {
    return this.i18n.number(v, Number.isInteger(v) ? 0 : 1);
  }

  protected open(m?: Milestone): void {
    this.editing.set(m ?? null);
    this.target.set(m?.targetKg ?? this.suggestions()[0] ?? Math.round((this.current() ?? 70) - 2));
    this.reward = m?.reward ?? '';
    this.sheet().nativeElement.showModal();
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    const input = { targetKg: this.target(), reward: this.reward.trim() || undefined };
    try {
      const m = this.editing();
      await (m ? this.tracking.updateMilestone(m.id, input) : this.tracking.addMilestone(input));
      closeSheet(this.sheet().nativeElement);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(m: Milestone): Promise<void> {
    this.busy.set(true);
    try {
      await this.tracking.deleteMilestone(m.id);
      closeSheet(this.sheet().nativeElement);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  /** the proposed steps, all at once */
  protected async suggest(): Promise<void> {
    this.busy.set(true);
    try {
      for (const kg of this.suggestions()) await this.tracking.addMilestone({ targetKg: kg });
      this.toast.show(this.i18n.t('progress.milestones.added', { n: this.suggestions().length }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
