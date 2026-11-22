import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { BpSettings, HealthStore, Medication } from '../../core/health/health.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

/** Monday first, ISO numbers */
const DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * 1.17: « Santé » in the profile: the two optional modules, off until turned on. The blood pressure (its reminders of the
 * morning and the evening, how to measure well) and the pill box (one's treatments: a name, a dose, the times, the days,
 * a reminder or not). Shown on Today and on Progress once on; nobody else sees any of it.
 */
@Component({
  selector: 'app-health',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'health.title' | t }}</h1>
      </header>
      <p class="small muted intro">{{ 'health.intro' | t }}</p>

      <section class="card module">
        <label class="pref">
          <span class="m-ico bp"><app-icon name="heartPulse" /></span>
          <span class="pref-body">
            <span class="pref-title">{{ 'health.bp.title' | t }}</span>
            <span class="small muted">{{ 'health.bp.hint' | t }}</span>
          </span>
          <input type="checkbox" role="switch" class="switch" [checked]="bpOn()" [disabled]="busy()" (change)="setModule('bpEnabled', $event)" />
        </label>
        @if (bpOn()) {
          @if (settings(); as s) {
            <label class="pref sub">
              <span class="pref-body">
                <span class="pref-title small">{{ 'health.bp.reminders' | t }}</span>
                <span class="tiny muted">{{ 'health.bp.remindersHint' | t }}</span>
              </span>
              <input type="checkbox" role="switch" class="switch" [checked]="s.reminder" (change)="saveSettings({ reminder: $any($event.target).checked })" />
            </label>
            @if (s.reminder) {
              <div class="times">
                <label class="time">
                  <span class="small"><app-icon name="sun" [size]="15" /> {{ 'health.bp.short.MORNING' | t }}</span>
                  <span class="input-icon">
                    <input class="input" type="time" step="300" [value]="s.morning" (change)="setTime('morning', $event)" />
                    <span class="end"><app-icon name="clock" [size]="17" /></span>
                  </span>
                </label>
                <label class="time">
                  <span class="small"><app-icon name="moon" [size]="15" /> {{ 'health.bp.short.EVENING' | t }}</span>
                  <span class="input-icon">
                    <input class="input" type="time" step="300" [value]="s.evening" (change)="setTime('evening', $event)" />
                    <span class="end"><app-icon name="clock" [size]="17" /></span>
                  </span>
                </label>
              </div>
            }
          }
          <div class="how">
            <h2 class="label">{{ 'health.bp.howTitle' | t }}</h2>
            <ul class="small">
              @for (k of howSteps; track k) {
                <li>{{ 'health.bp.how.' + k | t }}</li>
              }
            </ul>
          </div>
        }
      </section>

      <section class="card module">
        <label class="pref">
          <span class="m-ico pills"><app-icon name="pill" /></span>
          <span class="pref-body">
            <span class="pref-title">{{ 'health.pills.title' | t }}</span>
            <span class="small muted">{{ 'health.pills.hint' | t }}</span>
          </span>
          <input type="checkbox" role="switch" class="switch" [checked]="pillsOn()" [disabled]="busy()" (change)="setModule('pillsEnabled', $event)" />
        </label>
        @if (pillsOn()) {
          @if (store.box(); as b) {
            @if (b.items.length) {
              <ul class="meds" role="list">
                @for (m of b.items; track m.id) {
                  <li>
                    <button type="button" class="med" (click)="edit(m)">
                      <span class="med-body">
                        <span class="med-name">{{ m.name }}{{ m.dose ? ' · ' + m.dose : '' }}</span>
                        <span class="tiny muted num">{{ m.times.join(' · ') }} · {{ daysText(m.days) }}</span>
                      </span>
                      @if (!m.reminders) {
                        <span class="tiny muted no-bell"><app-icon name="bell" [size]="13" /> {{ 'health.pills.noReminder' | t }}</span>
                      }
                      <app-icon name="pencil" [size]="16" />
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="small muted">{{ 'health.pills.empty' | t }}</p>
            }
            <button type="button" class="btn btn-secondary btn-block" [disabled]="b.items.length >= 20" (click)="edit(null)">
              <app-icon name="plus" /> {{ 'health.pills.add' | t }}
            </button>
          } @else {
            <div class="skeleton" style="height: 60px"></div>
          }
          <p class="tiny muted">{{ 'health.pills.warning' | t }}</p>
        }
      </section>

      @if (bpOn() || pillsOn()) {
        <a class="small push-link" routerLink="/app/account/notifications">{{ 'health.push' | t }} <app-icon name="chevronRight" [size]="15" /></a>
      }
      <p class="tiny muted">{{ 'health.private' | t }}</p>

      <dialog class="sheet" #medDialog [attr.aria-label]="'health.pills.' + (editing() ? 'edit' : 'add') | t">
        <div class="sheet-grip"></div>
        <form class="stack" (submit)="$event.preventDefault(); saveMed()">
          <h2 class="h3">{{ 'health.pills.' + (editing() ? 'edit' : 'add') | t }}</h2>
          <label class="field">
            <span class="label">{{ 'health.pills.name' | t }}</span>
            <input class="input" maxlength="60" autocomplete="off" [placeholder]="'health.pills.namePlaceholder' | t" [value]="name()" (input)="name.set($any($event.target).value)" />
          </label>
          <label class="field">
            <span class="label">{{ 'health.pills.dose' | t }}</span>
            <input class="input" maxlength="40" autocomplete="off" [placeholder]="'health.pills.dosePlaceholder' | t" [value]="dose()" (input)="dose.set($any($event.target).value)" />
          </label>
          <div class="field">
            <span class="label">{{ 'health.pills.times' | t }}</span>
            @for (t of times(); track $index; let i = $index) {
              <div class="time-row">
                <span class="input-icon">
                  <input class="input" type="time" step="300" [value]="t" [attr.aria-label]="'health.pills.timeOf' | t: { n: i + 1 }" (change)="setMedTime(i, $event)" />
                  <span class="end"><app-icon name="clock" [size]="17" /></span>
                </span>
                @if (times().length > 1) {
                  <button type="button" class="icon-btn mini" [attr.aria-label]="'health.pills.removeTime' | t: { n: i + 1 }" (click)="removeTime(i)">
                    <app-icon name="x" [size]="16" />
                  </button>
                }
              </div>
            }
            @if (times().length < 6) {
              <button type="button" class="btn btn-ghost btn-s add-time" (click)="addTime()"><app-icon name="plus" [size]="16" /> {{ 'health.pills.addTime' | t }}</button>
            }
          </div>
          <div class="field">
            <span class="label">{{ 'health.pills.days' | t }}</span>
            <div class="days" role="group" [attr.aria-label]="'health.pills.days' | t">
              @for (d of allDays; track d) {
                <button type="button" class="day" [attr.aria-pressed]="days().includes(d)" [attr.aria-label]="dayName(d)" (click)="toggleDay(d)">{{ dayLetter(d) }}</button>
              }
            </div>
          </div>
          <label class="pref sub">
            <span class="pref-body"><span class="pref-title small">{{ 'health.pills.reminders' | t }}</span></span>
            <input type="checkbox" role="switch" class="switch" [checked]="reminders()" (change)="reminders.set($any($event.target).checked)" />
          </label>
          <button type="submit" class="btn btn-primary btn-block" [disabled]="busy() || !medValid()"><app-icon name="check" /> {{ 'health.pills.save' | t }}</button>
          @if (editing()) {
            <button type="button" class="btn btn-ghost btn-block danger" [disabled]="busy()" (click)="removeMed()"><app-icon name="trash" /> {{ 'health.pills.delete' | t }}</button>
          }
        </form>
      </dialog>
    </main>
  `,
  styles: `
    .small-title {
      font-size: 1.6rem;
    }
    .intro,
    p {
      margin: 0;
    }
    .module {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .pref {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .pref-body {
      flex: 1;
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .pref-title {
      font-weight: 700;
    }
    .pref.sub {
      padding-top: var(--space-2);
      border-top: 1px solid var(--line);
    }
    .m-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 38px;
      height: 38px;
      border-radius: 12px;
    }
    .m-ico.bp {
      background: color-mix(in srgb, #e5484d 13%, var(--surface));
      color: color-mix(in srgb, #e5484d 75%, var(--fg));
    }
    .m-ico.pills {
      background: color-mix(in srgb, #8a6fd1 14%, var(--surface));
      color: color-mix(in srgb, #8a6fd1 75%, var(--fg));
    }
    .times {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }
    .time {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .time > span:first-child {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-weight: 650;
    }
    .how {
      display: grid;
      gap: 4px;
      padding: 12px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .how .label {
      margin: 0;
    }
    .how ul {
      display: grid;
      gap: 4px;
      margin: 0;
      padding-left: 18px;
      color: var(--fg-2);
    }
    .meds {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .med {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px 10px 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      text-align: left;
      color: var(--fg);
    }
    .med-body {
      flex: 1;
      display: grid;
      min-width: 0;
    }
    .med-name {
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .no-bell {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      flex: none;
    }
    .push-link {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: var(--accent-text);
      font-weight: 650;
    }
    .field {
      display: grid;
      gap: 6px;
    }
    .time-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .time-row .input-icon {
      flex: 1;
    }
    .add-time {
      justify-self: start;
    }
    .days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 6px;
    }
    .day {
      height: 40px;
      border-radius: 12px;
      box-shadow: inset 0 0 0 1px var(--line-strong);
      color: var(--fg-2);
      font-weight: 750;
    }
    .day[aria-pressed='true'] {
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent);
      color: var(--accent-text);
    }
    .danger {
      color: var(--danger);
    }
  `,
})
export class HealthPage {
  protected readonly store = inject(HealthStore);
  private readonly session = inject(SessionStore);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly medDialog = viewChild.required<ElementRef<HTMLDialogElement>>('medDialog');

  protected readonly bpOn = computed(() => !!this.session.account()?.bpEnabled);
  protected readonly pillsOn = computed(() => !!this.session.account()?.pillsEnabled);
  protected readonly settings = this.store.settings;
  protected readonly busy = signal(false);
  protected readonly howSteps = ['seated', 'arm', 'three', 'when', 'days'];
  protected readonly allDays = DAYS;

  protected readonly editing = signal<Medication | null>(null);
  protected readonly name = signal('');
  protected readonly dose = signal('');
  protected readonly times = signal<string[]>(['08:00']);
  protected readonly days = signal<number[]>([...DAYS]);
  protected readonly reminders = signal(true);
  protected readonly medValid = computed(() => this.name().trim().length > 0 && this.times().length > 0 && this.days().length > 0);

  constructor() {
    effect(() => {
      const bp = this.bpOn();
      const pills = this.pillsOn();
      untracked(() => {
        if (bp && !this.settings()) void this.store.loadSettings().catch(() => undefined);
        if (pills) void this.store.ensureBox();
      });
    });
  }

  protected async setModule(key: 'bpEnabled' | 'pillsEnabled', e: Event): Promise<void> {
    const on = (e.target as HTMLInputElement).checked;
    this.busy.set(true);
    try {
      this.session.setAccount(await this.api.updateMe({ [key]: on }));
      this.toast.show(this.i18n.t(on ? 'health.on' : 'health.off'));
    } catch (err) {
      (e.target as HTMLInputElement).checked = !on;
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveSettings(change: Partial<BpSettings>): Promise<void> {
    const s = this.settings();
    if (!s) return;
    try {
      await this.store.saveSettings({ ...s, ...change });
      this.toast.show(this.i18n.t('engage.notifications.saved'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
      void this.store.loadSettings().catch(() => undefined);
    }
  }

  protected setTime(which: 'morning' | 'evening', e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    if (/^\d{2}:\d{2}$/.test(v)) void this.saveSettings({ [which]: v });
  }

  // ── a treatment ───────────────────────────────────────────────────────

  protected edit(m: Medication | null): void {
    this.editing.set(m);
    this.name.set(m?.name ?? '');
    this.dose.set(m?.dose ?? '');
    this.times.set(m ? [...m.times] : ['08:00']);
    this.days.set(m ? [...m.days] : [...DAYS]);
    this.reminders.set(m?.reminders ?? true);
    this.medDialog().nativeElement.showModal();
  }

  protected setMedTime(i: number, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    if (/^\d{2}:\d{2}$/.test(v)) this.times.update((t) => t.map((x, j) => (j === i ? v : x)));
  }

  protected addTime(): void {
    this.times.update((t) => (t.length < 6 ? [...t, t.length ? '20:00' : '08:00'] : t));
  }

  protected removeTime(i: number): void {
    this.times.update((t) => t.filter((_, j) => j !== i));
  }

  protected toggleDay(d: number): void {
    this.days.update((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));
  }

  protected dayLetter(d: number): string {
    return this.i18n.date(dayOfWeek(d), { weekday: 'narrow' });
  }

  protected dayName(d: number): string {
    return this.i18n.date(dayOfWeek(d), { weekday: 'long' });
  }

  /** « Tous les jours », « lun., mer., ven. » */
  protected daysText(days: number[]): string {
    if (days.length === 7) return this.i18n.t('health.pills.everyDay');
    return days.map((d) => this.i18n.date(dayOfWeek(d), { weekday: 'short' })).join(', ');
  }

  protected async saveMed(): Promise<void> {
    if (!this.medValid()) return;
    const input = { name: this.name().trim(), dose: this.dose().trim() || null, times: [...new Set(this.times())], days: this.days(), reminders: this.reminders() };
    this.busy.set(true);
    try {
      const m = this.editing();
      if (m) await this.store.updateMedication(m.id, input);
      else await this.store.addMedication(input);
      closeSheet(this.medDialog().nativeElement);
      this.toast.show(this.i18n.t('health.pills.saved'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async removeMed(): Promise<void> {
    const m = this.editing();
    if (!m || !confirm(this.i18n.t('health.pills.deleteConfirm', { name: m.name }))) return;
    this.busy.set(true);
    try {
      await this.store.deleteMedication(m.id);
      closeSheet(this.medDialog().nativeElement);
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }
}

/** a date of the week of 2024-01-01 (a Monday) for an ISO day number, to name it */
function dayOfWeek(d: number): string {
  return `2024-01-0${d}`;
}
