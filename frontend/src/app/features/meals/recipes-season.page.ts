import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { SeasonData, SeasonProduce } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { richIn } from '../../core/meals/micros';
import { PRODUCE_EMOJI, shiftMonth } from '../../core/meals/season';
import { localDay } from '../../core/tracking/tracking.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { IconComponent } from '../../shared/icon.component';
import { ServingPipe } from '../../shared/serving.pipe';
import { MicrosGuideComponent } from './micros-guide.component';
import { TYPE_EMOJI } from './recipes.page';

/** the months already read while the app is open (back from a recipe: no new request) */
const cache = new Map<number, SeasonData>();

/**
 * 1.21: « De saison »: the fruits and vegetables of the month in France (the previous and next months a tap away), what
 * each one brings the most per 100 g raw (the Ciqual table), its recipes (« Que faire avec ce que j'ai ? » with it already
 * chosen), then the recipes that use the most of them.
 */
@Component({
  selector: 'app-recipes-season',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, ServingPipe, IconComponent, BackButtonComponent, HealthScoreComponent, MicrosGuideComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'meals.season.title' | t }}</h1>
      </header>
      <p class="lead small muted">{{ 'meals.season.lead' | t }}</p>

      <div class="month" role="group">
        <button type="button" class="icon-btn" [attr.aria-label]="'meals.season.previous' | t" (click)="month.set(shift(-1))"><app-icon name="chevronLeft" /></button>
        <h2 class="h3 month-name" aria-live="polite">{{ monthName() }}</h2>
        <button type="button" class="icon-btn" [attr.aria-label]="'meals.season.next' | t" (click)="month.set(shift(1))"><app-icon name="chevronRight" /></button>
      </div>

      @if (data(); as d) {
        <div class="body" [class.stale]="loading()">
          @for (g of groups(); track g.kind) {
            @if (g.list.length) {
              <h2 class="section-title">{{ g.title | t }} <span class="muted num">{{ g.list.length }}</span></h2>
              <ul class="tiles" role="list">
                @for (p of g.list; track p.id; let i = $index) {
                  <li [style.--i]="i">
                    @if (p.recipes > 0) {
                      <a class="tile" [routerLink]="['/app/meals/recipes/with']" [queryParams]="{ k: p.key }"
                        [attr.aria-label]="'meals.season.open' | t: { name: ('meals.season.items.' + p.id | t) }">
                        <ng-container *ngTemplateOutlet="tile; context: { $implicit: p }" />
                      </a>
                    } @else {
                      <div class="tile off">
                        <ng-container *ngTemplateOutlet="tile; context: { $implicit: p }" />
                      </div>
                    }
                  </li>
                }
              </ul>
            }
          }

          <h2 class="section-title">{{ 'meals.season.recipesTitle' | t }}</h2>
          @if (d.recipes.length) {
            <div class="list">
              @for (s of d.recipes; track s.recipe.id) {
                <a class="list-item found" [routerLink]="['/app/meals/recipes', s.recipe.id]">
                  <span class="pic">
                    @if (s.recipe.thumbUrl) {
                      <img [src]="s.recipe.thumbUrl" alt="" loading="lazy" />
                    } @else {
                      <span aria-hidden="true">{{ emoji[s.recipe.type] }}</span>
                    }
                  </span>
                  <span class="list-body">
                    <span class="list-title">{{ s.recipe.name }}</span>
                    <span class="list-sub with">{{ 'meals.season.with' | t: { list: names(s.produce) } }}</span>
                    <span class="list-sub">{{ s.recipe | serving }}</span>
                  </span>
                  @if (s.recipe.health) {
                    <app-health-score [score]="s.recipe.health.score" />
                  }
                </a>
              }
            </div>
          } @else {
            <div class="empty">
              <span class="empty-icon"><app-icon name="leaf" /></span>
              <p class="small">{{ 'meals.season.noRecipes' | t }}</p>
            </div>
          }
          <p class="tiny muted">{{ 'meals.season.note' | t }}</p>
          <button type="button" class="btn btn-ghost btn-s guide-link" (click)="guide.open()"><app-icon name="info" [size]="16" /> {{ 'meals.micros.guideLink' | t }}</button>
        </div>
      } @else {
        <div class="skeleton" style="height: 320px; border-radius: 24px"></div>
      }

      <!-- the emoji beside the name, the vitamins under them on the whole width (one line each) -->
      <ng-template #tile let-p>
        <span class="t-head">
          <span class="t-emoji" aria-hidden="true">{{ produceEmoji[p.id] ?? '🥬' }}</span>
          <b class="t-name">{{ 'meals.season.items.' + p.id | t }}</b>
        </span>
        @if (rich(p); as r) {
          @if (r.length) {
            <span class="t-rich">
              @for (x of r; track x.key) {
                <span class="pill">{{ 'meals.micros.names.' + x.key | t }} <b class="num">{{ x.pct }}&nbsp;%</b></span>
              }
            </span>
          }
        }
        <span class="tiny t-count">
          {{ p.recipes === 0 ? ('meals.season.noRecipe' | t) : p.recipes === 1 ? ('meals.season.recipesOne' | t) : ('meals.season.recipes' | t: { n: p.recipes }) }}
        </span>
      </ng-template>
      <app-micros-guide #guide />
    </main>
  `,
  styles: `
    .lead {
      margin-top: calc(-1 * var(--space-2));
    }
    .month {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .month-name {
      margin: 0;
      text-transform: capitalize;
    }
    .body {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
      transition: opacity var(--dur-2);
    }
    .stale {
      opacity: 0.6;
    }
    .section-title {
      margin: var(--space-2) 0 0;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tiles li {
      display: grid;
    }
    .tile {
      display: grid;
      align-content: start;
      gap: 6px;
      padding: 12px;
      border-radius: var(--radius-m);
      background: var(--surface);
      border: 1px solid var(--line);
      color: inherit;
      text-decoration: none;
      transition: transform var(--dur-2) var(--ease-out);
    }
    a.tile.is-pressed {
      transform: scale(0.97);
    }
    .tile.off .t-count {
      color: var(--fg-3);
    }
    .t-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .t-emoji {
      flex: none;
      font-size: 1.4rem;
      line-height: 1.2;
    }
    .t-name {
      min-width: 0;
      font-size: var(--fs-s);
      overflow-wrap: anywhere;
    }
    .t-rich {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .pill {
      padding: 2px 7px;
      border-radius: 999px;
      background: color-mix(in srgb, #d6336c 9%, var(--surface-2));
      font-size: 11.5px;
      line-height: 1.4;
      white-space: nowrap;
    }
    .t-count {
      color: var(--accent-text);
      font-weight: 650;
    }
    .found {
      align-items: flex-start;
    }
    .pic {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      flex: none;
      border-radius: 16px;
      overflow: hidden;
      background: var(--accent-soft);
      font-size: 1.8rem;
    }
    .pic img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .found .list-title,
    .found .list-sub {
      white-space: normal;
    }
    .with {
      font-weight: 650;
      color: var(--success);
    }
    .guide-link {
      justify-self: start;
      margin-left: calc(var(--space-2) * -1);
    }
  `,
})
export class RecipesSeasonPage {
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly emoji = TYPE_EMOJI;
  protected readonly produceEmoji = PRODUCE_EMOJI;
  private readonly current = Number(localDay().slice(5, 7));
  protected readonly month = signal(this.current);
  protected readonly data = signal<SeasonData | null>(cache.get(this.current) ?? null);
  protected readonly loading = signal(false);
  private seq = 0;

  protected readonly monthName = computed(() => {
    const m = this.month();
    const year = Number(localDay().slice(0, 4));
    return this.i18n.date(`${year}-${String(m).padStart(2, '0')}-15`, { month: 'long' });
  });

  protected readonly groups = computed(() => {
    const list = this.data()?.produce ?? [];
    return [
      { kind: 'VEGETABLE', title: 'meals.season.vegetables', list: list.filter((p) => p.kind === 'VEGETABLE') },
      { kind: 'FRUIT', title: 'meals.season.fruits', list: list.filter((p) => p.kind === 'FRUIT') },
    ];
  });

  constructor() {
    effect(() => {
      const m = this.month();
      const seq = ++this.seq;
      const known = cache.get(m);
      if (known) {
        this.data.set(known);
        return;
      }
      this.loading.set(true);
      this.api
        .season(m)
        .then((d) => {
          cache.set(m, d);
          if (seq === this.seq) this.data.set(d);
        })
        .catch((e) => this.toast.error(this.i18n.error(errorCode(e))))
        .finally(() => {
          if (seq === this.seq) this.loading.set(false);
        });
    });
  }

  protected shift(by: number): number {
    return shiftMonth(this.month(), by);
  }

  /** what 100 g raw brings the most: the 2 richest at 15 % of the daily reference or more */
  protected rich(p: SeasonProduce): { key: string; pct: number }[] {
    return richIn(p.micros).slice(0, 2);
  }

  /** « poireau, carotte » */
  protected names(ids: string[]): string {
    return ids.map((id) => this.i18n.t('meals.season.items.' + id).toLowerCase()).join(', ');
  }
}
