import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Recipe } from '../../core/api/models';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { ClearableDirective } from '../../shared/clearable.directive';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { IconComponent } from '../../shared/icon.component';
import { TYPE_EMOJI } from '../meals/recipes.page';

interface AdminList {
  total: number;
  noPhoto: number;
  hidden: number;
  recipes: Recipe[];
}
type Filter = 'all' | 'nophoto' | 'hidden';

/**
 * 1.14: « Recettes »: the community's recipes, by name, the ones without a photo or hidden apart. A recipe opens in the
 * recipe editor of the app (name, ingredients, steps, photo: an admin may change a community recipe), hidden or shown
 * again from here.
 */
@Component({
  selector: 'app-admin-recipes-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, HealthScoreComponent, ClearableDirective],
  template: `
    <label class="search">
      <app-icon name="search" [size]="18" />
      <span class="sr-only">{{ 'admin.recipes.search' | t }}</span>
      <input type="search" enterkeyhint="search" autocomplete="off" [placeholder]="'admin.recipes.search' | t" [value]="query()"
        (input)="search($any($event.target).value)" />
    </label>

    <div class="slide-chips" role="group" [attr.aria-label]="'admin.recipes.filter' | t">
      @for (f of filters; track f) {
        <button type="button" [attr.aria-pressed]="filter() === f" (click)="setFilter(f)">
          {{ 'admin.recipes.filters.' + f | t }}
          @if (counts(); as c) {
            <span class="num count">{{ f === 'all' ? c.total : f === 'nophoto' ? c.noPhoto : c.hidden }}</span>
          }
        </button>
      }
    </div>

    <p class="small muted">{{ 'admin.recipes.text' | t }}</p>

    @if (list(); as rs) {
      @if (rs.length) {
        <ul class="list" role="list">
          @for (r of rs; track r.id) {
            <li class="card row" [class.is-hidden]="r.hidden">
              <a class="open" [routerLink]="['/app/meals/recipes', r.id, 'edit']">
                <span class="thumb">
                  @if (r.thumbUrl) {
                    <img [src]="r.thumbUrl" alt="" loading="lazy" />
                  } @else {
                    <span aria-hidden="true">{{ emoji(r) }}</span>
                  }
                </span>
                <span class="body">
                  <span class="name">{{ r.name }}</span>
                  <span class="tiny muted">
                    {{ i18n.number(r.perServing.kcal) }} kcal {{ 'meals.perServing' | t }}
                    @if (!r.thumbUrl) {
                      · <span class="warn">{{ 'admin.recipes.noPhoto' | t }}</span>
                    }
                    @if (r.hidden) {
                      · <span class="warn">{{ 'admin.recipes.hiddenTag' | t }}</span>
                    }
                  </span>
                </span>
                @if (r.health) {
                  <app-health-score [score]="r.health.score" />
                }
              </a>
              <button type="button" class="icon-btn" [disabled]="busy() === r.id" (click)="toggleHidden(r)"
                [attr.aria-label]="(r.hidden ? 'admin.recipes.show' : 'admin.recipes.hide') | t: { name: r.name }">
                <app-icon [name]="r.hidden ? 'eye' : 'eyeOff'" [size]="18" />
              </button>
            </li>
          }
        </ul>
        @if (more()) {
          <button type="button" class="btn btn-secondary btn-block" [disabled]="loading()" (click)="loadMore()">{{ 'admin.recipes.more' | t }}</button>
        }
      } @else {
        <p class="empty muted">{{ 'admin.recipes.empty' | t }}</p>
      }
    } @else {
      <p class="muted">{{ 'common.loading' | t }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-3);
    }
    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      padding: 0 10px 0 14px;
      border-radius: var(--radius-pill);
      background: var(--surface);
      border: 1px solid var(--line);
      color: var(--fg-3);
    }
    .search input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      outline: none;
      font-size: 16px;
      color: var(--fg);
    }
    .search:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-soft);
    }
    .count {
      margin-left: 6px;
      opacity: 0.7;
    }
    .list {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    }
    .row.is-hidden {
      opacity: 0.6;
    }
    .open {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex: 1;
      min-width: 0;
      color: inherit;
      text-decoration: none;
    }
    .thumb {
      display: grid;
      place-items: center;
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      overflow: hidden;
      background: var(--surface-2);
      font-size: 22px;
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .body {
      display: grid;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .name {
      overflow: hidden;
      font-weight: 700;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .warn {
      color: var(--accent-text);
      font-weight: 700;
    }
    .empty {
      padding: var(--space-8) 0;
      text-align: center;
    }
  `,
})
export class AdminRecipesTab {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly filters: Filter[] = ['all', 'nophoto', 'hidden'];
  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly list = signal<Recipe[] | null>(null);
  protected readonly counts = signal<Omit<AdminList, 'recipes'> | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal<string | null>(null);
  private page = 0;
  private last = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  protected readonly more = computed(() => this.last === 50 && (this.list()?.length ?? 0) > 0);

  constructor() {
    void this.load(0);
  }

  protected emoji(r: Recipe): string {
    return TYPE_EMOJI[r.type] ?? '🍽️';
  }

  protected search(q: string): void {
    this.query.set(q);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(0), 250);
  }

  protected setFilter(f: Filter): void {
    this.filter.set(f);
    void this.load(0);
  }

  protected loadMore(): void {
    void this.load(this.page + 1);
  }

  private async load(page: number): Promise<void> {
    this.loading.set(true);
    const q = this.query();
    const filter = this.filter();
    try {
      const res = await firstValueFrom(this.http.get<AdminList>('/api/admin/recipes', { params: { q, filter, page } }));
      // an older answer arriving after a newer search is dropped
      if (q !== this.query() || filter !== this.filter()) return;
      this.page = page;
      this.last = res.recipes.length;
      this.counts.set({ total: res.total, noPhoto: res.noPhoto, hidden: res.hidden });
      this.list.set(page === 0 ? res.recipes : [...(this.list() ?? []), ...res.recipes]);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleHidden(r: Recipe): Promise<void> {
    this.busy.set(r.id);
    try {
      await firstValueFrom(this.http.post('/api/admin/recipes/' + r.id + (r.hidden ? '/restore' : '/hide'), {}));
      this.list.update((l) => l?.map((x) => (x.id === r.id ? { ...x, hidden: !r.hidden } : x)) ?? l);
      this.counts.update((c) => (c ? { ...c, hidden: c.hidden + (r.hidden ? -1 : 1) } : c));
      this.toast.show(this.i18n.t(r.hidden ? 'admin.recipes.shown' : 'admin.recipes.hidden'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(null);
    }
  }
}
