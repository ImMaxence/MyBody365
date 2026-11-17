import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import type { RecipeDraft } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';

/**
 * The first link of a pasted text (« Regarde ça https://… trop bon ! »), https first, without the
 * punctuation that follows it; null when there is none.
 */
export function firstLink(text: string): string | null {
  const all = [...(text ?? '').matchAll(/https?:\/\/[^\s<>"'«»]+/gi)].map((m) => m[0].replace(/[.,;:!?)\]}»]+$/, ''));
  return all.find((u) => /^https:/i.test(u)) ?? all[0] ?? null;
}

/**
 * « Importer une recette »: the link (or a whole message with it), a cross to clear it, then the draft read by the
 * server, handed to the recipe form (which closes the sheet once it is filled).
 */
@Component({
  selector: 'app-recipe-import-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent],
  template: `
    <dialog class="sheet" #importDialog [attr.aria-label]="'meals.recipe.import.title' | t">
      <div class="sheet-grip"></div>
      <form class="stack" (ngSubmit)="run()">
        <div>
          <h2 class="h3">{{ 'meals.recipe.import.title' | t }}</h2>
          <p class="small muted">{{ 'meals.recipe.import.text' | t }}</p>
        </div>
        <div class="field">
          <label class="label" for="r-url">{{ 'meals.recipe.import.label' | t }}</label>
          <div class="url-field">
            <input #urlInput class="input" id="r-url" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false"
              placeholder="https://…" [ngModel]="importUrl" (ngModelChange)="setImportUrl($event)" (blur)="importUrl = link(importUrl) ?? importUrl.trim()" />
            @if (importUrl) {
              <button type="button" class="url-clear" [attr.aria-label]="'meals.recipe.import.clear' | t" (click)="clearImport(urlInput)"><app-icon name="x" [size]="16" /></button>
            }
          </div>
          <p class="tiny muted">{{ 'meals.recipe.import.pasteHint' | t }}</p>
        </div>
        <button type="submit" class="btn btn-primary btn-block" [disabled]="importing() || !link(importUrl)">
          <app-icon [name]="importing() ? 'refresh' : 'download'" [class.spin]="importing()" /> {{ (importing() ? 'meals.recipe.import.reading' : 'meals.recipe.import.run') | t }}
        </button>
        <p class="tiny muted note"><app-icon name="info" [size]="14" /> {{ 'meals.recipe.import.note' | t }}</p>
      </form>
    </dialog>
  `,
  styles: `
    .url-field {
      position: relative;
    }
    .url-field .input {
      padding-right: 44px;
    }
    .url-clear {
      position: absolute;
      top: 50%;
      right: 6px;
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      color: var(--fg-2);
      transform: translateY(-50%);
    }
    .url-clear:active {
      background: var(--surface-2);
    }
    .note {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .spin {
      animation: spin 900ms linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class RecipeImportSheetComponent {
  /** the draft read from the site */
  readonly imported = output<RecipeDraft>();
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly importDialog = viewChild.required<ElementRef<HTMLDialogElement>>('importDialog');
  protected readonly importing = signal(false);
  protected importUrl = '';
  protected readonly link = firstLink;

  /** with a link (shared from the phone, ?import=…): read at once */
  open(url?: string | null): void {
    this.importUrl = url ?? '';
    this.importDialog().nativeElement.showModal();
    if (url) void this.run();
  }

  close(): void {
    closeSheet(this.importDialog().nativeElement);
  }

  /** a text pasted with a link in it: the link alone stays in the box */
  protected setImportUrl(value: string): void {
    const found = firstLink(value);
    this.importUrl = found && /\s/.test(value.trim()) ? found : value;
  }

  protected clearImport(input: HTMLInputElement): void {
    this.importUrl = '';
    input.focus();
  }

  protected async run(): Promise<void> {
    const url = firstLink(this.importUrl) ?? '';
    this.importUrl = url;
    if (!url) return;
    this.importing.set(true);
    try {
      this.imported.emit(await this.api.importRecipe(url));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.importing.set(false);
    }
  }
}
