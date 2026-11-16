import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';

/** Placeholder of the tabs built in the next lots (meals, photos, progress). */
@Component({
  selector: 'app-soon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <main class="page">
      <header class="page-head"><h1 class="title">{{ 'nav.' + section() | t }}</h1></header>
      <div class="card empty">
        <span class="empty-icon"><app-icon [name]="icon()" /></span>
        <h2 class="h3">{{ 'soon.title' | t }}</h2>
        <p>{{ 'soon.' + section() | t }}</p>
        <span class="chip chip-accent"><app-icon name="sparkles" /> {{ 'common.soon' | t }}</span>
      </div>
    </main>
  `,
})
export class SoonPage {
  readonly section = input<'meals' | 'photos' | 'progress'>('meals');
  protected readonly icon = computed(() => ({ meals: 'utensils', photos: 'camera', progress: 'chart' })[this.section()]);
}
