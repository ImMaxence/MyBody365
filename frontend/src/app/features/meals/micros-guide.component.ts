import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MICROS, OFTEN_SHORT, UPPER, type Micro, type MicroKey } from '../../core/meals/micros';
import { IconComponent } from '../../shared/icon.component';

/**
 * 1.21: « À quoi servent les vitamines et les minéraux »: why all of them are essential, which ones are stored, those most
 * often short in France, then each one, what it is for, its daily reference, where to find it and its safety limit. Opened
 * from a recipe, the day's score and the stats, on the one tapped when there is one.
 */
@Component({
  selector: 'app-micros-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #dlg [attr.aria-label]="'meals.micros.guide.title' | t">
      <div class="sheet-grip"></div>
      <div class="stack">
        <div>
          <h2 class="h3">{{ 'meals.micros.guide.title' | t }}</h2>
          <p class="small muted">{{ 'meals.micros.guide.intro' | t }}</p>
        </div>
        <p class="small">{{ 'meals.micros.guide.store' | t }}</p>
        <p class="small often-text"><span class="o-ico"><app-icon name="alert" [size]="16" /></span> <span>{{ 'meals.micros.guide.oftenText' | t }}</span></p>
        <ul class="items" role="list">
          @for (m of micros; track m.key) {
            <li [id]="'micro-' + m.key" [class.focus]="focus() === m.key">
              <span class="head">
                <b>{{ 'meals.micros.names.' + m.key | t }}</b>
                @if (often.includes(m.key)) {
                  <span class="tag">{{ 'meals.micros.guide.often' | t }}</span>
                }
              </span>
              <span class="small">{{ 'meals.micros.guide.roles.' + m.key | t }}</span>
              <span class="small muted"><b>{{ 'meals.micros.guide.where' | t }}</b> {{ 'meals.micros.sources.' + m.key | t }}</span>
              <span class="tiny muted">
                {{ 'meals.micros.guide.ref' | t: { v: amount(m, m.nrv) } }}
                @if (upper[m.key]; as up) {
                  · {{ 'meals.micros.guide.upper' | t: { v: amount(m, up) } }}
                }
              </span>
            </li>
          }
        </ul>
        <p class="tiny muted">{{ 'meals.micros.guide.source' | t }}</p>
      </div>
    </dialog>
  `,
  styles: `
    .often-text {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0;
      padding: 10px 12px;
      border-radius: 14px;
      background: color-mix(in srgb, #e2711d 10%, var(--surface-2));
    }
    /* the icon keeps its size beside a long text (app-icon itself is display: contents) */
    .o-ico {
      display: grid;
      flex: none;
      margin-top: 2px;
      color: #e2711d;
    }
    .items {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      gap: 3px;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--surface-2);
      scroll-margin-top: var(--space-4);
      transition: box-shadow var(--dur-2) var(--ease-out);
    }
    li.focus {
      box-shadow: inset 0 0 0 2px var(--accent);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    /* the calendar's pastel, its ink mixed with the text colour: readable (4.5:1) in both themes */
    .tag {
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--cal-over);
      color: color-mix(in srgb, var(--cal-over-ink) 70%, var(--fg));
      font-size: 11.5px;
      font-weight: 700;
    }
  `,
})
export class MicrosGuideComponent {
  private readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly micros = MICROS;
  protected readonly often = OFTEN_SHORT;
  protected readonly upper = UPPER;
  /** the one tapped, outlined and scrolled to */
  protected readonly focus = signal<MicroKey | null>(null);

  /** « 1,1 mg », « 800 µg » */
  protected amount(m: Micro, v: number): string {
    return `${this.i18n.number(v, v < 10 && !Number.isInteger(v) ? 1 : 0)} ${m.unit}`;
  }

  open(key?: MicroKey | string | null): void {
    const k = MICROS.find((m) => m.key === key)?.key ?? null;
    this.focus.set(k);
    const dlg = this.dialog().nativeElement;
    dlg.showModal();
    if (k) requestAnimationFrame(() => dlg.querySelector('#micro-' + k)?.scrollIntoView({ block: 'start' }));
  }
}
