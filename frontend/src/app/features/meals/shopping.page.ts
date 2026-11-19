import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { ShoppingItem } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { AISLE_EMOJI, ShoppingStore, splitName } from '../../core/meals/shopping.store';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

/**
 * The shopping list (1.11): the ingredients of the recipes added from their page, added up, by aisle in the order of
 * the shop (the frozen food last), plus the lines typed here. A tap puts a line in the basket.
 */
@Component({
  selector: 'app-shopping',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'shopping.title' | t }}</h1>
        <span class="spacer"></span>
        @if (canShare && left() > 0) {
          <button type="button" class="icon-btn" [attr.aria-label]="'shopping.share' | t" (click)="share()"><app-icon name="share" /></button>
        }
      </header>

      <form class="add-line" (ngSubmit)="addLine()">
        <input class="input" name="line" [(ngModel)]="line" maxlength="300" autocomplete="off" enterkeyhint="done"
          [placeholder]="'shopping.addPlaceholder' | t" [attr.aria-label]="'shopping.add' | t" />
        <button type="submit" class="btn btn-primary add-btn" [disabled]="busy() || !line.trim()" [attr.aria-label]="'shopping.add' | t">
          <app-icon name="plus" />
        </button>
      </form>

      @if (store.list(); as l) {
        @if (l.items.length) {
          <div class="progress card">
            <div class="progress-top">
              <span class="small"><b class="num">{{ inBasket() }}</b> {{ 'shopping.inBasket' | t: { total: l.items.length } }}</span>
              <span class="tiny muted">{{ 'shopping.order' | t }}</span>
            </div>
            <div class="bar" role="progressbar" [attr.aria-label]="'shopping.inBasket' | t: { total: l.items.length }" [attr.aria-valuenow]="inBasket()"
              aria-valuemin="0" [attr.aria-valuemax]="l.items.length">
              <i [style.width.%]="(100 * inBasket()) / l.items.length"></i>
            </div>
            @if (l.recipes.length) {
              <p class="for tiny muted">{{ 'shopping.for' | t: { recipes: l.recipes.join(', ') } }}</p>
            }
          </div>

          @for (g of store.aisles(); track g.aisle) {
            <section class="aisle">
              <h2 class="section-title"><span aria-hidden="true">{{ emoji[g.aisle] }}</span> {{ 'shopping.aisles.' + g.aisle | t }}
                <span class="faint num">· {{ g.items.length }}</span></h2>
              <ul class="list" role="list">
                @for (it of g.items; track it.id) {
                  <li class="row" [class.done]="it.checked">
                    <button type="button" class="tick" role="checkbox" [attr.aria-checked]="it.checked" (click)="toggle(it)">
                      <span class="box"><app-icon name="check" [size]="16" [stroke]="2.8" /></span>
                      <span class="what">
                        <span class="name">{{ parts(it).head }}</span>
                        @if (parts(it).rest) {
                          <span class="rest tiny muted">{{ parts(it).rest }}</span>
                        }
                      </span>
                      @if (qty(it); as q) {
                        <span class="qty num small">{{ q }}</span>
                      }
                    </button>
                    <button type="button" class="icon-btn mini" [attr.aria-label]="'shopping.remove' | t: { name: parts(it).head }" (click)="remove(it)">
                      <app-icon name="x" [size]="16" />
                    </button>
                  </li>
                }
              </ul>
            </section>
          }

          <div class="end">
            @if (inBasket() > 0) {
              <button type="button" class="btn btn-secondary btn-block" [disabled]="busy()" (click)="clear(true)">
                <app-icon name="check" /> {{ 'shopping.clearChecked' | t: { n: inBasket() } }}
              </button>
            }
            <button type="button" class="btn btn-ghost btn-block danger" (click)="confirm.showModal()"><app-icon name="trash" /> {{ 'shopping.clearAll' | t }}</button>
          </div>
        } @else {
          <div class="empty">
            <span class="empty-icon"><app-icon name="cart" /></span>
            <h2 class="h3">{{ 'shopping.emptyTitle' | t }}</h2>
            <p class="small">{{ 'shopping.emptyText' | t }}</p>
            <a class="btn btn-secondary" routerLink="/app/meals/recipes"><app-icon name="book" [size]="18" /> {{ 'shopping.toRecipes' | t }}</a>
          </div>
        }
      } @else {
        <div class="skeleton" style="height: 260px; border-radius: 24px"></div>
      }

      <dialog class="sheet" #confirm [attr.aria-label]="'shopping.clearAll' | t">
        <div class="sheet-grip"></div>
        <div class="stack">
          <p>{{ 'shopping.clearConfirm' | t }}</p>
          <button type="button" class="btn btn-danger btn-block" [disabled]="busy()" (click)="clear(false)"><app-icon name="trash" /> {{ 'shopping.clearAll' | t }}</button>
          <button type="button" class="btn btn-ghost btn-block" (click)="confirm.close()">{{ 'common.cancel' | t }}</button>
        </div>
      </dialog>
    </main>
  `,
  styles: `
    .spacer {
      flex: 1;
    }
    .add-line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-2);
    }
    .add-btn {
      width: 52px;
      padding: 0;
    }
    .progress {
      display: grid;
      gap: 10px;
      padding: var(--space-4);
    }
    .progress-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
    .bar {
      height: 8px;
      border-radius: 4px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: #16a34a;
      transition: width 420ms var(--ease-out);
    }
    .for {
      margin: 0;
    }
    /* 1.12: the name of the aisle above its card, never on it (the global section title pulls the next block up, which
       only works in a stack with a gap) */
    .aisle {
      display: grid;
      gap: 8px;
    }
    .aisle .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 0 4px;
      color: var(--fg-1);
      font-size: var(--fs-m);
      font-weight: 700;
    }
    .aisle .section-title .faint {
      font-weight: 600;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding-right: 8px;
    }
    .row + .row {
      border-top: 1px solid var(--line);
    }
    .tick {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 10px 6px 10px 16px;
      text-align: left;
      -webkit-tap-highlight-color: transparent;
    }
    .box {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      flex: none;
      border-radius: 50%;
      border: 2px solid var(--line-strong);
      color: transparent;
      transition:
        background-color var(--dur-2),
        border-color var(--dur-2),
        color var(--dur-2),
        transform var(--dur-2) var(--ease-out);
    }
    .tick:active .box {
      transform: scale(0.88);
    }
    .done .box {
      background: #16a34a;
      border-color: #16a34a;
      color: #fff;
    }
    .what {
      flex: 1;
      min-width: 0;
      display: grid;
    }
    .name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rest {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .qty {
      flex: none;
      color: var(--fg-2);
      font-weight: 600;
    }
    .done .name,
    .done .qty {
      text-decoration: line-through;
      color: var(--fg-3);
    }
    .icon-btn.mini {
      width: 32px;
      height: 32px;
      flex: none;
      color: var(--fg-3);
    }
    .end {
      display: grid;
      gap: var(--space-2);
    }
    .danger {
      color: var(--danger);
    }
  `,
})
export class ShoppingPage {
  protected readonly store = inject(ShoppingStore);
  private readonly api = inject(MealsApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly confirmDialog = viewChild.required<ElementRef<HTMLDialogElement>>('confirm');
  protected readonly emoji = AISLE_EMOJI;
  protected readonly busy = signal(false);
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  protected line = '';
  protected readonly left = this.store.left;
  protected readonly inBasket = computed(() => (this.store.list()?.items ?? []).filter((i) => i.checked).length);
  private readonly names = new Map<string, { head: string; rest: string }>();

  constructor() {
    void this.store.load().catch((e) => this.toast.error(this.i18n.error(errorCode(e))));
  }

  protected parts(it: ShoppingItem): { head: string; rest: string } {
    let p = this.names.get(it.name);
    if (!p) {
      p = splitName(it.name);
      this.names.set(it.name, p);
    }
    return p;
  }

  /** 900 g, 1,2 kg, 500 ml, 1,5 l, × 5 (eggs); nothing under 5 g (salt, spices: a pinch) */
  protected qty(it: ShoppingItem): string {
    if (it.unit === 'PIECE' && it.pieces) return `× ${it.pieces}`;
    const g = it.grams;
    if (g == null || g < 5) return '';
    const round = (v: number) => (v >= 100 ? Math.round(v / 10) * 10 : v >= 20 ? Math.round(v / 5) * 5 : Math.round(v));
    const r = round(g);
    if (r >= 1000) return `${this.i18n.number(r / 1000, 1)} ${it.unit === 'ML' ? 'l' : 'kg'}`;
    return `${this.i18n.number(r)} ${it.unit === 'ML' ? 'ml' : 'g'}`;
  }

  protected async toggle(it: ShoppingItem): Promise<void> {
    navigator.vibrate?.(10);
    try {
      await this.store.check(it, !it.checked);
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async addLine(): Promise<void> {
    const name = this.line.trim();
    if (!name) return;
    this.busy.set(true);
    try {
      this.store.set(await this.api.addShoppingLine(name));
      this.line = '';
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(it: ShoppingItem): Promise<void> {
    try {
      this.store.set(await this.api.deleteShopping(it.id));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async clear(onlyChecked: boolean): Promise<void> {
    this.busy.set(true);
    try {
      this.store.set(await this.api.clearShopping(onlyChecked));
      if (!onlyChecked) closeSheet(this.confirmDialog().nativeElement);
      this.toast.show(this.i18n.t(onlyChecked ? 'shopping.clearedChecked' : 'shopping.cleared'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  /** the lines left, by aisle, as text (for the one who goes shopping) */
  protected async share(): Promise<void> {
    const lines: string[] = [this.i18n.t('shopping.title')];
    for (const g of this.store.aisles()) {
      const items = g.items.filter((i) => !i.checked);
      if (!items.length) continue;
      lines.push('', `${this.emoji[g.aisle]} ${this.i18n.t('shopping.aisles.' + g.aisle)}`);
      for (const it of items) {
        const q = this.qty(it);
        lines.push(`- ${this.parts(it).head}${q ? ' (' + q + ')' : ''}`);
      }
    }
    try {
      await navigator.share({ text: lines.join('\n') });
    } catch {
      /* closed without sharing */
    }
  }
}
