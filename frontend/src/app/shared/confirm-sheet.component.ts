import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, linkedSignal, viewChild } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { ConfirmAsk, ConfirmService } from '../core/ui/confirm';
import { closeSheet } from '../core/ui/sheets';
import { IconComponent } from './icon.component';

/**
 * 1.19: the sheet of ConfirmService, once in the shell: the question, what it means, the answer in red when something
 * is lost for good, « Annuler » under it (where the focus starts: Enter never deletes by surprise). Swiped down,
 * a tap outside or Escape: the same as « Annuler ».
 */
@Component({
  selector: 'app-confirm-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet confirm" #dlg role="alertdialog" aria-labelledby="confirm-title" [attr.aria-describedby]="ask()?.text ? 'confirm-text' : null"
      (close)="closed()">
      <div class="sheet-grip"></div>
      @if (ask(); as a) {
        <div class="stack body">
          <span class="ico" [class.danger]="a.danger" aria-hidden="true"><app-icon [name]="a.danger ? 'trash' : 'info'" [size]="22" /></span>
          <h2 class="h3" id="confirm-title">{{ a.title }}</h2>
          @if (a.text) {
            <p class="small muted" id="confirm-text">{{ a.text }}</p>
          }
          <div class="answers">
            <button type="button" class="btn btn-block" [class.danger-solid]="a.danger" [class.btn-primary]="!a.danger" (click)="answer(true)">{{ a.ok }}</button>
            <button type="button" class="btn btn-ghost btn-block" autofocus (click)="answer(false)">{{ a.cancel ?? ('common.cancel' | t) }}</button>
          </div>
        </div>
      }
    </dialog>
  `,
  styles: `
    .body {
      justify-items: center;
      text-align: center;
      padding-bottom: var(--space-2);
    }
    .ico {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border-radius: 18px;
      background: var(--surface-2);
      color: var(--fg-2);
    }
    .ico.danger {
      background: var(--danger-soft);
      color: var(--danger);
    }
    h2 {
      margin: 0;
      text-wrap: balance;
    }
    p {
      margin: 0;
      max-width: 34ch;
      text-wrap: pretty;
    }
    .answers {
      display: grid;
      gap: var(--space-2);
      width: 100%;
      margin-top: var(--space-2);
    }
    /* a red that stays readable under white text in light and dark */
    .danger-solid {
      background: #c81e1e;
      color: #fff;
    }
  `,
})
export class ConfirmSheetComponent {
  private readonly confirm = inject(ConfirmService);
  /** the question asked, kept while the sheet slides away once answered */
  protected readonly ask = linkedSignal<ConfirmAsk | null, ConfirmAsk | null>({
    source: this.confirm.asking,
    computation: (a, prev) => a ?? prev?.value ?? null,
  });
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    // after the question is drawn (its « Annuler » takes the focus)
    afterRenderEffect(() => {
      const open = !!this.confirm.asking();
      const d = this.dlg().nativeElement;
      if (open && !d.open) d.showModal();
      if (!open && d.open) closeSheet(d);
    });
  }

  protected answer(ok: boolean): void {
    this.confirm.answer(ok);
  }

  /** swiped down, a tap outside, Escape: no */
  protected closed(): void {
    this.confirm.answer(false);
  }
}
