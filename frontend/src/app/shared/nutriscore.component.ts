import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Grade } from '../core/api/models';
import { I18nService } from '../core/i18n/i18n.service';

/** The Nutri-Score letter in its colour; dashed when estimated by the app. */
@Component({
  selector: 'app-nutriscore',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()', '[class]': '"ns ns-" + grade()', '[class.estimated]': 'estimated()' },
  template: `{{ grade().toUpperCase() }}`,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 22px;
      height: 22px;
      border-radius: 7px;
      font-weight: 850;
      font-size: 12px;
      line-height: 1;
      color: #fff;
    }
    :host(.ns-a) {
      background: #038141;
    }
    :host(.ns-b) {
      background: #4a7a12;
    }
    :host(.ns-c) {
      background: #8a6900;
    }
    :host(.ns-d) {
      background: #a84309;
    }
    :host(.ns-e) {
      background: #c7290f;
    }
    :host(.estimated) {
      outline: 1.5px dashed var(--fg-3);
      outline-offset: 1.5px;
      color: #fff;
    }
  `,
})
export class NutriscoreComponent {
  readonly grade = input.required<Grade>();
  readonly estimated = input(false);
  private readonly i18n = inject(I18nService);
  protected readonly label = computed(() =>
    this.i18n.t(this.estimated() ? 'meals.nutriscoreEstimated' : 'meals.nutriscore', { grade: this.grade().toUpperCase() }),
  );
}
