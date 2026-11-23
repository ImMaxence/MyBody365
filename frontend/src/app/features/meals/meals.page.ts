import { WaitingNoteComponent } from '../../shared/waiting-note.component';
import { ShareSheetComponent } from '../../shared/share-sheet.component';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { MacroSplit, MealEntry, Slot } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { DayStatus, MealsStore, PENDING, SLOTS, dayStatus, monthGrid, shiftDay, shiftMonth, weekOf } from '../../core/meals/meals.store';
import { HabitsApi } from '../../core/api/habits-api';
import { SwipeRowDirective } from '../../shared/swipe-row.directive';
import { MealsApi } from '../../core/meals/meals-api';
import { macroPlan } from '../../core/meals/macro-plan';
import { trends } from '../../core/meals/trends';
import { GuidesSheetComponent } from './guides-sheet.component';
import { TrendsCardComponent } from './trends-card.component';
import { TrackingStore, localDay } from '../../core/tracking/tracking.store';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { KcalRingComponent } from '../../shared/kcal-ring.component';
import { NumberStepperComponent } from '../../shared/number-stepper.component';
import { HealthScoreComponent } from '../../shared/health-score.component';
import { KnowCardComponent } from './know-card.component';
import { RichInComponent } from './rich-in.component';
import { dayScore } from '../../core/meals/day-score';
import { healthAlerts } from '../../core/meals/health';
import type { HealthDto, Food } from '../../core/api/models';
import { DayScoreComponent } from './day-score.component';
import { ShoppingStore } from '../../core/meals/shopping.store';
import { FoodThumbComponent } from '../../shared/food-thumb.component';
import { BarsPlan, NutrientBarsComponent } from '../../shared/nutrient-bars.component';
import type { Nutrients } from '../../core/api/models';

const SLOT_ICON: Record<Slot, string> = { BREAKFAST: 'sun', LUNCH: 'utensils', DINNER: 'moon', SNACK: 'leaf' };
const STATUS_ICON: Record<Exclude<DayStatus, null>, string | null> = { ok: 'check', over: 'arrowUp', under: 'arrowDown', ongoing: null, logged: null };

/** The Meals tab: a day's calories against the target, the macros, and the four meals. */
@Component({
  selector: 'app-meals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SwipeRowDirective, ShareSheetComponent, GuidesSheetComponent, TrendsCardComponent, DayScoreComponent, RouterLink, TranslatePipe, IconComponent, KcalRingComponent, HealthScoreComponent, KnowCardComponent, NumberStepperComponent, FoodThumbComponent, NutrientBarsComponent, RichInComponent, WaitingNoteComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <h1 class="title">{{ 'meals.title' | t }}</h1>
      </header>
      <nav class="shortcuts" [attr.aria-label]="'meals.title' | t">
        <a routerLink="/app/meals/stats" class="btn btn-secondary tile"><app-icon name="bars" [size]="20" /> {{ 'meals.stats.title' | t }}</a>
        <a routerLink="/app/meals/recipes" class="btn btn-secondary tile"><app-icon name="book" [size]="20" /> {{ 'meals.recipes' | t }}</a>
        <!-- 1.11: the shopping list, with the lines left to buy -->
        <a routerLink="/app/meals/shopping" class="btn btn-secondary tile" [attr.aria-label]="shoppingLabel()">
          <span class="tile-ico">
            <app-icon name="cart" [size]="20" />
            <!-- 1.12: a dot, as on the tabs, rather than a count -->
            @if (shopping.left() > 0) {
              <i class="dot" aria-hidden="true"></i>
            }
          </span>
          {{ 'shopping.short' | t }}
        </a>
      </nav>

      <nav class="days" [attr.aria-label]="'meals.title' | t">
        <button type="button" class="icon-btn" [attr.aria-label]="'meals.previousDay' | t" (click)="go(-1)"><app-icon name="chevronLeft" /></button>
        <button type="button" class="day-label" aria-haspopup="dialog" (click)="openCalendar()">
          <app-icon name="calendar" [size]="17" />
          @for (k of [dayLabel()]; track k) {
            <span class="day-text" [class.from-left]="dir() < 0" [class.from-right]="dir() > 0">{{ k }}</span>
          }
          <app-icon name="chevronDown" [size]="15" />
        </button>
        <button type="button" class="icon-btn" [attr.aria-label]="'meals.nextDay' | t" [disabled]="isTomorrow()" (click)="go(1)">
          <app-icon name="chevronRight" />
        </button>
      </nav>

      @for (w of [week()]; track w[0]) {
        <div class="week" role="group" [attr.aria-label]="'meals.calendar.week' | t" [class.from-left]="dir() < 0" [class.from-right]="dir() > 0">
          @for (day of w; track day) {
            <button type="button" class="wday" [attr.aria-pressed]="day === store.day()" [class.today]="day === today()" [disabled]="day > maxDay()"
              [attr.aria-label]="dayAria(day)" (click)="pick(day)">
              <span class="wd">{{ weekday(day) }}</span>
              <span class="dn num">{{ dayNumber(day) }}</span>
              <span class="st" [attr.data-s]="status(day)">
                @if (iconOf(day); as ico) {
                  <app-icon [name]="ico" [size]="11" [stroke]="3" />
                }
              </span>
            </button>
          }
        </div>
      }

      @if (store.data(); as d) {
          <div class="day-pane" [class.calm]="shown() > 0" [class.swap-a]="shown() > 0 && shown() % 2 === 1" [class.swap-b]="shown() > 0 && shown() % 2 === 0">
        <section class="card summary">
          <app-kcal-ring [eaten]="d.totals.kcal" [target]="d.targetKcal" [size]="128" />
          <div class="macros">
            <!-- the day's limit stays in view: the ring tells the gap, this says what it was measured against -->
            @if (d.targetKcal) {
              <p class="target">
                <span class="tiny muted">{{ 'meals.dayTarget' | t }}</span>
                <span class="target-v"><b class="num">{{ i18n.number(d.targetKcal) }}</b> kcal</span>
                <span class="tiny muted">{{ 'meals.eatenKcal' | t: { kcal: i18n.number(Math.round(d.totals.kcal)) } }}</span>
              </p>
            }
            @for (m of macros(); track m.key) {
              <div class="macro">
                <div class="macro-head small"><span>{{ m.label | t }}</span><span class="num">{{ i18n.number(m.value) }} / {{ m.target }} g</span></div>
                <div class="bar" aria-hidden="true"><i [style.width.%]="m.pct" [style.background]="m.color"></i></div>
              </div>
            }
          </div>
          @if (targetWhy(); as why) {
            <!-- 1.18: folded on one line: the meals come first; a dot when a suggestion waits inside -->
            <!-- 1.19: the line and what it unfolds are one block of the card (folded, it sits in the middle of its space) -->
            <div class="why-box">
            <button type="button" class="why-toggle small" [attr.aria-expanded]="whyOpen()" aria-controls="meals-whys" (click)="whyOpen.set(!whyOpen())">
              <span class="why-ico"><app-icon name="target" [size]="15" /></span>
              <span class="why-q">{{ (d.targetKcal ? 'meals.whyTarget' : 'meals.whyTargetNone') | t: { kcal: i18n.number(d.targetKcal ?? 0) } }}</span>
              @if (realNote()?.action && !realNote()?.on) {
                <span class="why-dot" aria-hidden="true"></span>
              }
              <span class="why-chev" aria-hidden="true"><app-icon name="chevronDown" [size]="16" /></span>
            </button>
            <div class="whys-wrap" id="meals-whys" [class.open]="whyOpen()" [attr.inert]="whyOpen() ? null : ''">
            <div class="whys">
              <p class="why small"><span class="why-ico"><app-icon name="info" [size]="15" /></span><span>{{ why }}</span></p>
              @if (activityNote(); as a) {
                <p class="why small">
                  <span class="why-ico cool"><app-icon name="dumbbell" [size]="15" /></span>
                  <span>{{ a }} <a routerLink="/app/account/goal" class="why-link">{{ 'meals.activity.change' | t }}</a></span>
                </p>
              }
              @if (realNote(); as rn) {
                <div class="why real small" [class.on]="rn.on">
                  <span class="why-ico real-ico"><app-icon name="activity" [size]="15" /></span>
                  <span class="real-body">
                    <span>{{ rn.text }}</span>
                    @if (rn.action) {
                      <button type="button" class="why-link real-btn" [disabled]="busy()" (click)="setAdaptive(!rn.on)">{{ rn.action }}</button>
                    }
                    @if (!rn.on && rn.action) {
                      <span class="tiny muted">{{ 'meals.real.honest' | t }}</span>
                    }
                  </span>
                </div>
              }
            </div>
            </div>
            </div>
          }
        </section>

        @for (slot of slots; track slot; let i = $index) {
          <section class="card slot" [style.--i]="i">
            <header class="slot-head">
              <span class="slot-ico"><app-icon [name]="slotIcon[slot]" [size]="18" /></span>
              <h2 class="slot-title">{{ 'meals.slots.' + slot | t }}</h2>
              <span class="slot-kcal num">{{ i18n.number(slotKcal(slot)) }} kcal</span>
            </header>
            @if (store.bySlot()[slot].length) {
              <ul class="entries" role="list">
                @for (e of store.bySlot()[slot]; track e.id) {
                  <li class="swipe">
                    <!-- 1.19: a swipe to the left uncovers « Dupliquer » and « Retirer », as in a phone's lists (the sheet keeps them too) -->
                    @if (!e.pending) {
                      <div class="swipe-actions" aria-hidden="true">
                        <button type="button" class="act dup" tabindex="-1" (click)="duplicate(e)"><app-icon name="copy" [size]="18" /> {{ 'meals.entry.duplicate' | t }}</button>
                        <button type="button" class="act del" tabindex="-1" (click)="removeLine(e)"><app-icon name="trash" [size]="18" /> {{ 'meals.entry.delete' | t }}</button>
                      </div>
                    }
                    <!-- 1.17: done without network, greyed until it is sent; it comes back to colour once there -->
                    <button type="button" class="entry" [appSwipeRow]="!e.pending" [class.is-waiting]="e.pending" [class.is-deleted]="e.pending === 'delete'"
                      [class.is-arrived]="store.arrived().has(e.id)" (click)="edit(e)">
                      <app-food-thumb class="entry-thumb" [url]="e.thumbUrl" [group]="e.group" />
                      <span class="entry-body">
                        <span class="entry-name">{{ e.name }}</span>
                        @if (e.pending) {
                          <app-waiting-note [waitId]="e.waitId" [kind]="e.pending" />
                        } @else {
                          <span class="entry-sub small muted">{{ amount(e) }}{{ e.detail ? ' · ' + e.detail : '' }}</span>
                        }
                      </span>
                      @if (e.health != null) {
                        <app-health-score [score]="e.health" />
                      }
                      <span class="entry-kcal num">{{ i18n.number(e.nutrients.kcal) }}</span>
                    </button>
                  </li>
                }
              </ul>
            }
            <div class="slot-actions">
              <a class="btn btn-ghost btn-s add" routerLink="/app/meals/add" [queryParams]="{ slot, day: store.day() }">
                <app-icon name="plus" [size]="18" /> {{ 'meals.add' | t }}
              </a>
              @if (!store.bySlot()[slot].length) {
                <button type="button" class="btn btn-ghost btn-s" (click)="copy(slot)"><app-icon name="repeat" [size]="16" /> {{ 'meals.copyYesterday' | t }}</button>
              } @else if (canKeep(slot)) {
                <!-- 1.19: kept as « un repas habituel », added again in one tap from « Ajouter » -->
                <button type="button" class="btn btn-ghost btn-s" (click)="openHabit(slot)"><app-icon name="bookmark" [size]="16" /> {{ 'meals.habits.keep' | t }}</button>
              }
            </div>
          </section>
        }
        <!-- 1.18: the day's analysis after its meals: its score, the week's trends, one thing worth knowing -->
        <app-day-score [day]="d" [shares]="plan().shares" />
        <app-trends-card [trends]="weekTrends()" />
        <!-- 1.13: one thing worth knowing to eat well, the one the day calls for -->
        <app-know-card [day]="d" [kcal]="planKcal()" />
        <button type="button" class="guides-link tiny" (click)="guides.open()">
          <app-icon name="info" [size]="14" />
          <span>{{ 'meals.guides.link' | t: { p: plan().proteinG, c: plan().carbsG, f: plan().fatG, fi: plan().fiberG } }}</span>
        </button>
        <!-- 1.9: what was eaten, shown to the friends or sent as a picture -->
        @if ((store.data()?.entries?.length ?? 0) > 0 && store.day() <= today()) {
          <button type="button" class="btn btn-secondary btn-block share-day" (click)="shareSheet.open('DAY', store.day())">
            <app-icon name="share" [size]="18" /> {{ (store.day() === today() ? 'friends.posts.share.dayCta' : 'friends.posts.share.dayCtaOther') | t }}
          </button>
        }
          </div>
      } @else {
        <div class="skeleton" style="height: 168px; border-radius: 24px"></div>
        <div class="skeleton" style="height: 110px; border-radius: 24px"></div>
      }

      <app-share-sheet #shareSheet />
      <!-- 1.19: a meal of the day kept under a name -->
      <dialog class="sheet" #habitDialog [attr.aria-label]="'meals.habits.saveTitle' | t">
        <div class="sheet-grip"></div>
        <form class="stack" (submit)="$event.preventDefault(); saveHabit(habitName.value)">
          <div>
            <h2 class="h3">{{ 'meals.habits.saveTitle' | t }}</h2>
            <p class="small muted">{{ 'meals.habits.saveText' | t }}</p>
          </div>
          <label class="field">
            <span class="label">{{ 'meals.habits.name' | t }}</span>
            <input #habitName class="input" name="habitName" maxlength="80" [value]="habitDefault()" autocomplete="off" />
          </label>
          <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()"><app-icon name="check" /> {{ 'meals.habits.save' | t }}</button>
        </form>
      </dialog>
      <dialog class="sheet" #calDialog [attr.aria-label]="'meals.calendar.title' | t">
        <div class="sheet-grip"></div>
        <div class="stack">
          <div class="cal-head">
            <button type="button" class="icon-btn" [attr.aria-label]="'meals.calendar.previous' | t" (click)="moveMonth(-1)"><app-icon name="chevronLeft" /></button>
            <h2 class="h3 cal-title">{{ monthLabel() }}</h2>
            <button type="button" class="icon-btn" [attr.aria-label]="'meals.calendar.next' | t" [disabled]="month() >= maxDay().slice(0, 7)" (click)="moveMonth(1)">
              <app-icon name="chevronRight" />
            </button>
          </div>
          <div class="cal-week tiny" aria-hidden="true">
            @for (day of weekLetters(); track $index) {
              <span>{{ day }}</span>
            }
          </div>
          @for (m of [month()]; track m) {
            <div class="cal-grid" [class.from-left]="monthDir() < 0" [class.from-right]="monthDir() > 0">
              @for (day of grid(); track day; let i = $index) {
                <button type="button" class="cal-day" [class.out]="day.slice(0, 7) !== m" [class.sel]="day === store.day()" [class.today]="day === today()"
                  [attr.data-s]="status(day)" [disabled]="day > maxDay()" [style.--i]="i" [attr.aria-label]="dayAria(day)"
                  [attr.aria-current]="day === store.day() ? 'date' : null" (click)="pickFromCalendar(day)">
                  <span class="num">{{ dayNumber(day) }}</span>
                  <span class="ci">
                    @if (iconOf(day); as ico) {
                      <app-icon [name]="ico" [size]="12" [stroke]="3" />
                    } @else if (status(day)) {
                      <i class="dot"></i>
                    }
                  </span>
                </button>
              }
            </div>
          }
          @if (monthSummary(); as ms) {
            <p class="small cal-sum">{{ (ms.target ? 'meals.calendar.summary' : 'meals.calendar.summaryNoTarget') | t: ms }}</p>
          }
          <div class="cal-legend tiny">
            <span><i class="key" data-s="ok"><app-icon name="check" [size]="10" [stroke]="3" /></i>{{ 'meals.calendar.ok' | t }}</span>
            <span><i class="key" data-s="over"><app-icon name="arrowUp" [size]="10" [stroke]="3" /></i>{{ 'meals.calendar.over' | t }}</span>
            <span><i class="key" data-s="under"><app-icon name="arrowDown" [size]="10" [stroke]="3" /></i>{{ 'meals.calendar.under' | t }}</span>
            <span><i class="key" data-s="ongoing"><i class="dot"></i></i>{{ 'meals.calendar.ongoing' | t }}</span>
          </div>
          <a routerLink="/app/meals/stats" class="btn btn-secondary btn-block"><app-icon name="bars" /> {{ 'meals.calendar.seeStats' | t }}</a>
        </div>
      </dialog>

      <dialog class="sheet" #entryDialog (close)="selected.set(null)">
        <div class="sheet-grip"></div>
        @if (selected(); as e) {
          <div class="stack">
            <div class="entry-head">
              <app-food-thumb class="sheet-thumb" [url]="e.thumbUrl" [group]="e.group" />
              <div>
                <h2 class="h3">{{ e.name }}</h2>
                @if (e.detail) {
                  <p class="small muted">{{ e.detail }}</p>
                }
              </div>
            </div>
            <!-- 1.14: a recipe of the day opens in one tap, its ingredients and its steps -->
            @if (e.recipeId; as rid) {
              <button type="button" class="btn btn-secondary btn-s see-recipe" (click)="openRecipe(rid)">
                <app-icon name="book" [size]="18" /> {{ 'meals.entry.seeRecipe' | t }} <app-icon name="chevronRight" [size]="16" />
              </button>
            }
            <!-- 1.14: its health score and why, its warnings, and where the day stands -->
            @if (e.health != null) {
              <div class="entry-health">
                <app-health-score [score]="e.health" size="full" />
                @if (selectedHealth(); as h) {
                  @if (h.pros.length || h.cons.length) {
                    <ul class="reasons" role="list">
                      @for (p of h.pros; track p) {
                        <li class="pro"><app-icon name="check" [size]="13" [stroke]="3" /> {{ 'meals.health.pros.' + p | t }}</li>
                      }
                      @for (c of h.cons; track c) {
                        <li class="con"><app-icon name="minus" [size]="13" [stroke]="3" /> {{ 'meals.health.cons.' + c | t }}</li>
                      }
                    </ul>
                  }
                }
              </div>
            }
            @for (a of selectedAlerts(); track a.key) {
              <p class="alert small"><app-icon name="alert" [size]="16" /> <span>{{ 'meals.health.alerts.' + a.key | t: { v: i18n.number(a.value, 1), u: e.liquid ? 'ml' : 'g' } }}</span></p>
            }
            @if (dayNow(); as dn) {
              <p class="small day-now">
                <span class="dn-ico"><app-icon name="sparkles" [size]="18" /></span>
                <span>{{ (dn.ongoing ? 'meals.entry.dayOngoing' : 'meals.entry.dayDone') | t: { score: i18n.number(dn.score, dn.score % 1 ? 1 : 0), share: dn.share } }}</span>
              </p>
            }
            <span class="label">{{ 'meals.entry.quantity' | t }}</span>
            @if (e.grams != null && e.liquid) {
              <app-number-stepper [(value)]="qty" [step]="10" [min]="1" [max]="5000" [decimals]="0" unit="ml" [label]="'meals.quantity.mlLabel' | t" />
            } @else if (e.grams != null) {
              <app-number-stepper [(value)]="qty" [step]="5" [min]="1" [max]="5000" [decimals]="0" unit="g" [label]="'meals.quantity.gramsLabel' | t" />
            } @else {
              <app-number-stepper [(value)]="qty" [step]="0.5" [min]="0.25" [max]="20" [decimals]="2" [label]="'meals.quantity.servingsLabel' | t" />
            }
            <!-- 1.12: what this line brings, with the bars of the day (the rest of the day paler) -->
            <span class="label">{{ 'meals.bars.title' | t }}</span>
            <app-nutrient-bars [item]="liveNutrients()" [plan]="barsPlan()" [dayTotals]="restOfDay()" [entry]="true" />
            <!-- 1.14: the vitamins and minerals this line brings the most of (its micros are for its amount as noted) -->
            <app-rich-in [micros]="e.micros" [factor]="qty() / (e.grams ?? e.servings ?? 1)" />
            <span class="label">{{ 'meals.entry.move' | t }}</span>
            <div class="seg" role="group" [attr.aria-label]="'meals.entry.move' | t">
              @for (s of slots; track s) {
                <button type="button" [attr.aria-pressed]="moveTo() === s" (click)="moveTo.set(s)">{{ 'meals.slots.' + s | t }}</button>
              }
            </div>
            <button type="button" class="btn btn-primary btn-block" [disabled]="busy()" (click)="save(e)"><app-icon name="check" /> {{ 'meals.entry.save' | t }}</button>
            <button type="button" class="btn btn-ghost btn-block" [disabled]="busy()" (click)="duplicate(e)"><app-icon name="copy" /> {{ 'meals.entry.duplicate' | t }}</button>
            <button type="button" class="btn btn-ghost btn-block danger" [disabled]="busy()" (click)="remove(e)"><app-icon name="trash" /> {{ 'meals.entry.delete' | t }}</button>
          </div>
        }
      </dialog>

      <app-guides-sheet #guides [plan]="plan()" [kcal]="planKcal()" />
    </main>
  `,
  styles: `
    /* 1.14: the health of a line, in its sheet */
    .entry-health {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
    }
    .entry-health .reasons {
      display: flex;
      flex: 1 1 100%;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .entry-health .reasons li {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px 4px 7px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 650;
    }
    .entry-health .pro {
      background: color-mix(in srgb, var(--success, #1f9d55) 13%, transparent);
      color: color-mix(in srgb, var(--success, #1f9d55) 55%, var(--fg));
    }
    .entry-health .con {
      background: color-mix(in srgb, #e2711d 13%, transparent);
      color: color-mix(in srgb, #e2711d 50%, var(--fg));
    }
    .alert {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0;
      padding: var(--space-3);
      border-radius: 16px;
      background: color-mix(in srgb, #e2711d 10%, transparent);
    }
    .alert app-icon {
      flex: none;
      margin-top: 1px;
      color: #e2711d;
    }
    .day-now {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 10px 12px;
      border-radius: 16px;
      background: var(--accent-soft);
    }
    .dn-ico {
      display: grid;
      place-items: center;
      flex: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--surface);
      color: var(--accent-text);
    }
    .spacer {
      flex: 1;
    }
    .share-day {
      margin-top: var(--space-2);
    }
    .shortcuts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-2);
      margin-top: calc(-1 * var(--space-2));
    }
    /* three side by side: the icon above its word, so that each fits a phone */
    .tile {
      position: relative;
      flex-direction: column;
      gap: 4px;
      height: auto;
      min-height: 64px;
      padding: 10px 6px;
      font-size: var(--fs-s);
      white-space: normal;
      text-align: center;
      line-height: 1.15;
    }
    .tile-ico {
      position: relative;
      display: grid;
      place-items: center;
    }
    /* the same red dot as on the tabs: something waits there */
    .tile-ico .dot {
      position: absolute;
      top: -3px;
      right: -6px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #e5341c;
      box-shadow: 0 0 0 2px var(--surface);
      animation: dot-in 420ms cubic-bezier(0.34, 1.6, 0.5, 1) both;
    }
    @keyframes dot-in {
      from {
        transform: scale(0);
      }
    }
    .entry-thumb {
      --thumb: 40px;
      --thumb-radius: 11px;
    }
    .entry-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .see-recipe {
      justify-self: start;
    }
    .sheet-thumb {
      --thumb: 56px;
      --thumb-radius: 16px;
    }
    .days {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      margin-top: calc(-1 * var(--space-2));
    }
    .day-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      justify-self: center;
      min-height: 40px;
      padding: 0 14px;
      border-radius: var(--radius-pill);
      font-weight: 700;
      overflow: hidden;
      transition: background-color var(--dur-2);
    }
    @media (hover: hover) and (pointer: fine) {
      .day-label:hover {
        background: var(--surface-3);
      }
    }
    .day-label app-icon {
      color: var(--fg-2);
    }
    .day-text {
      display: inline-block;
      text-transform: capitalize;
    }
    /* another week (or month), another date: a quick fade in place, nothing slides */
    .from-right,
    .from-left {
      animation: swap-in 200ms ease both;
    }
    @keyframes swap-in {
      from {
        opacity: 0;
      }
    }
    /* the date itself only fades: it changes in place */
    .day-text.from-left,
    .day-text.from-right {
      animation: day-text 200ms ease both;
    }
    @keyframes day-text {
      from {
        opacity: 0;
      }
    }
    /*
     * the day's content stays in place: once the new day is there, it brightens up, nothing moves
     * (two identical animations, alternated, so each change plays it again); the ring and the bars
     * glide to their new values
     */
    .day-pane.swap-a {
      animation: day-a 220ms ease;
    }
    .day-pane.swap-b {
      animation: day-b 220ms ease;
    }
    @keyframes day-a {
      from {
        opacity: 0.35;
      }
    }
    @keyframes day-b {
      from {
        opacity: 0.35;
      }
    }
    .day-pane.calm .bar i {
      animation: none;
    }
    .day-pane {
      display: grid;
      gap: var(--space-5);
      grid-template-columns: minmax(0, 1fr);
    }
    .week {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
      margin-top: calc(-1 * var(--space-2));
      --seg-radius: 16px;
    }
    .wday {
      display: grid;
      justify-items: center;
      gap: 3px;
      padding: 7px 0 8px;
      border-radius: 16px;
      color: var(--fg-2);
      transition: color var(--dur-2), transform var(--dur-1) var(--ease-out);
    }
    .wday:active {
      transform: scale(0.94);
    }
    .wday:disabled {
      opacity: 0.35;
    }
    /* the chosen day: its highlight appears where it is, with a light press (nothing travels across the week) */
    .wday[aria-pressed='true'] {
      color: var(--accent-text);
      background: var(--accent-soft);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent);
      animation: day-on 260ms var(--ease-out);
    }
    @keyframes day-on {
      from {
        transform: scale(0.9);
        background-color: transparent;
      }
    }
    .wd {
      font-size: 11px;
      font-weight: 650;
      text-transform: uppercase;
    }
    .dn {
      font-weight: 750;
      font-size: 1.05rem;
      color: var(--fg);
    }
    .wday.today .dn {
      color: var(--accent-text);
    }
    .st {
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
    }
    [data-s='ok'] {
      --st-bg: var(--cal-done);
      --st-ink: var(--cal-done-ink);
    }
    [data-s='over'] {
      --st-bg: var(--cal-over);
      --st-ink: var(--cal-over-ink);
    }
    [data-s='under'] {
      --st-bg: var(--cal-under);
      --st-ink: var(--cal-under-ink);
    }
    [data-s='ongoing'] {
      --st-bg: var(--cal-today);
      --st-ink: var(--cal-today-ink);
    }
    [data-s='logged'] {
      --st-bg: var(--surface-3);
      --st-ink: var(--fg-2);
    }
    .st[data-s] {
      background: var(--st-bg);
      color: var(--st-ink);
      animation: pop 320ms var(--ease-out) both;
    }
    .st[data-s='ongoing']::after,
    .st[data-s='logged']::after {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    @keyframes pop {
      from {
        transform: scale(0.4);
        opacity: 0;
      }
    }
    .cal-head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
    }
    .cal-title {
      text-align: center;
      text-transform: capitalize;
    }
    .cal-week,
    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 5px;
    }
    .cal-week {
      color: var(--fg-3);
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
    }
    .cal-day {
      position: relative;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 2px;
      aspect-ratio: 1;
      border-radius: 14px;
      background: var(--st-bg, var(--surface-2));
      color: var(--fg);
      font-weight: 700;
      animation: pop 300ms var(--ease-out) both;
      animation-delay: calc(min(var(--i), 41) * 6ms);
      transition: transform var(--dur-1) var(--ease-out);
    }
    .cal-day:active {
      transform: scale(0.92);
    }
    .cal-day .num {
      font-size: var(--fs-s);
      line-height: 1;
    }
    .cal-day .ci {
      display: grid;
      place-items: center;
      height: 12px;
      color: var(--st-ink, var(--fg-3));
    }
    /* the days of the months around: quieter, still readable (contrast kept) */
    .cal-day.out {
      background: transparent;
      box-shadow: inset 0 0 0 1px var(--line);
      color: var(--fg-3);
      font-weight: 600;
    }
    .cal-day:disabled {
      opacity: 0.25;
    }
    .cal-day.today {
      box-shadow: inset 0 0 0 2px var(--cal-today-ink);
    }
    .cal-day.sel {
      box-shadow: inset 0 0 0 2px var(--accent);
    }
    .dot {
      display: block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .cal-sum {
      text-align: center;
      color: var(--fg-2);
      font-weight: 600;
    }
    .cal-legend {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 6px 14px;
      color: var(--fg-2);
      font-weight: 600;
    }
    .cal-legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .cal-legend .key {
      display: grid;
      place-items: center;
      width: 16px;
      height: 16px;
      border-radius: 5px;
      background: var(--st-bg);
      color: var(--st-ink);
    }
    @media (prefers-reduced-motion: reduce) {
      .day-pane.swap-a,
      .day-pane.swap-b,
      .from-right,
      .from-left,
      .cal-day,
      .st[data-s] {
        animation: none;
      }
    }
    .summary {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: var(--space-5);
      padding: var(--space-5);
    }
    .macros {
      display: grid;
      gap: var(--space-3);
    }
    .target {
      display: grid;
      gap: 1px;
      margin: 0;
      line-height: 1.2;
    }
    .target-v {
      font-size: 1.05rem;
      font-weight: 600;
    }
    .target-v b {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    /* where the target comes from, in a sentence or three, under the ring */
    /* 1.19: one block for the line and what it unfolds: a folded part used to leave the card's gap under the line
       (a negative margin cannot shrink a grid row below nothing), so the line sat high in its space */
    .why-box {
      grid-column: 1 / -1;
      display: grid;
      margin: calc(-1 * var(--space-2)) 0 calc(-1 * var(--space-1));
    }
    .why-toggle {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: var(--space-4) 0 0;
      border: 0;
      border-top: 1px solid var(--line);
      background: none;
      color: var(--fg-2);
      font: inherit;
      text-align: left;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .why-q {
      flex: 1;
      min-width: 0;
      font-weight: 650;
    }
    .why-dot {
      width: 8px;
      height: 8px;
      flex: none;
      border-radius: 50%;
      background: var(--accent);
    }
    .why-chev {
      display: grid;
      place-items: center;
      flex: none;
      transition: transform 320ms var(--ease-out);
    }
    .why-toggle[aria-expanded='true'] .why-chev {
      transform: rotate(180deg);
    }
    .whys-wrap {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 360ms var(--ease-out);
    }
    .whys-wrap.open {
      grid-template-rows: 1fr;
    }
    .whys {
      display: grid;
      gap: 10px;
      min-height: 0;
      overflow: hidden;
      opacity: 0;
      transition: opacity 240ms ease;
    }
    /* the room under the line, inside what folds away */
    .whys > :first-child {
      margin-top: var(--space-3);
    }
    .whys-wrap.open .whys {
      opacity: 1;
    }
    @media (prefers-reduced-motion: reduce) {
      .whys-wrap,
      .whys,
      .why-chev {
        transition: none;
      }
    }
    .why {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0;
      color: var(--fg-2);
      line-height: 1.45;
    }
    .why-ico.cool {
      background: var(--cool-soft);
      color: var(--cool);
    }
    .real-body {
      display: grid;
      gap: 4px;
      justify-items: start;
    }
    .real-ico {
      background: var(--success-soft, color-mix(in srgb, var(--success) 14%, transparent));
      color: var(--success);
    }
    .real-btn {
      padding: 2px 0;
    }
    .why-link {
      color: var(--accent-text);
      font-weight: 700;
      white-space: nowrap;
    }
    /* the guides, discreet at the bottom: a tap explains them */
    .guides-link {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: var(--space-2);
      color: var(--fg-2);
      text-align: center;
      line-height: 1.45;
    }
    .guides-link span {
      text-decoration: underline;
      text-decoration-color: var(--line-strong);
      text-underline-offset: 3px;
    }
    .why-ico {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      flex: none;
      border-radius: 8px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .macro {
      display: grid;
      gap: 5px;
    }
    .macro-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-weight: 650;
    }
    .macro-head .num {
      color: var(--fg-2);
      font-weight: 600;
    }
    .bar {
      height: 7px;
      border-radius: 4px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 4px;
      transition: width 700ms var(--ease-out);
      animation: grow 900ms var(--ease-out) both;
    }
    @keyframes grow {
      from {
        width: 0 !important;
      }
    }
    .slot {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-4);
    }
    .slot-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .slot-ico {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 12px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .slot-title {
      flex: 1;
      font-size: 1.05rem;
      font-weight: 750;
    }
    .slot-kcal {
      font-weight: 700;
      color: var(--fg-2);
    }
    .entries {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .entry {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 2px;
      border-top: 1px solid var(--line);
      text-align: left;
    }
    /* 1.19: the actions behind a line, uncovered by a swipe to the left */
    .swipe {
      position: relative;
      overflow: hidden;
    }
    .swipe .entry {
      position: relative;
      z-index: 1;
      background: var(--surface);
    }
    .swipe-actions {
      position: absolute;
      top: 1px;
      right: 0;
      bottom: 0;
      display: flex;
      width: 152px;
      visibility: hidden;
    }
    /* only while the line is moved: else their edges would bleed around it, or show through a line fading in */
    .swipe[data-swiping] .swipe-actions {
      visibility: visible;
    }
    .act {
      display: grid;
      flex: 1;
      place-content: center;
      justify-items: center;
      gap: 2px;
      border: 0;
      color: #fff;
      font: inherit;
      font-size: 12px;
      font-weight: 750;
      cursor: pointer;
    }
    /* the same deep colours in light and dark: white text stays readable on both */
    .act.dup {
      background: #2f5bd3;
    }
    .act.del {
      background: #d92d16;
    }
    .entry-body {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .entry-name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entry-sub {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entry-kcal {
      min-width: 3ch;
      text-align: right;
      font-weight: 700;
    }
    .slot-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .add {
      color: var(--accent-text);
    }
    .hint {
      text-align: center;
    }
    .live {
      margin-top: -4px;
      text-align: center;
      font-weight: 750;
      font-size: 1.15rem;
    }
    .danger {
      color: var(--danger);
    }
    @media (max-width: 360px) {
      .summary {
        grid-template-columns: 1fr;
        justify-items: center;
      }
      .macros {
        width: 100%;
      }
    }
  `,
})
export class MealsPage {
  // ── 1.19: « Mes repas habituels » ───────────────────────────────────────
  private readonly habits = inject(HabitsApi);
  private readonly habitDialog = viewChild.required<ElementRef<HTMLDialogElement>>('habitDialog');
  private habitSlot: Slot = 'BREAKFAST';
  protected readonly habitDefault = signal('');

  /** a meal of the server (nothing waiting for the network in it) can be kept */
  protected canKeep(slot: Slot): boolean {
    const lines = this.store.bySlot()[slot];
    return lines.length > 0 && lines.every((e) => !e.pending);
  }

  protected openHabit(slot: Slot): void {
    this.habitSlot = slot;
    this.habitDefault.set(this.i18n.t('meals.habits.defaultName', { slot: this.i18n.t('meals.slots.' + slot).toLowerCase() }));
    this.habitDialog().nativeElement.showModal();
  }

  protected async saveHabit(name: string): Promise<void> {
    const n = name.trim() || this.habitDefault();
    this.busy.set(true);
    try {
      await this.habits.saveTemplate(n, this.store.day(), this.habitSlot);
      closeSheet(this.habitDialog().nativeElement);
      this.toast.show(this.i18n.t('meals.habits.saved', { name: n }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  /** 1.18: the notes explaining the day's target, folded under the ring until asked for */
  protected readonly whyOpen = signal(false);
  protected readonly store = inject(MealsStore);
  protected readonly shopping = inject(ShoppingStore);
  protected readonly shoppingLabel = computed(() =>
    this.shopping.left() > 0 ? this.i18n.t('shopping.shortLeft', { n: this.shopping.left() }) : this.i18n.t('shopping.title'),
  );
  private readonly tracking = inject(TrackingStore);
  protected readonly i18n = inject(I18nService);
  protected readonly Math = Math;
  private readonly toast = inject(ToastService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('entryDialog');
  private readonly calDialog = viewChild.required<ElementRef<HTMLDialogElement>>('calDialog');
  private readonly mealsApi = inject(MealsApi);
  protected readonly statusIcon = STATUS_ICON;
  /** -1: going back in time, 1: forward (the side the new day slides in from) */
  protected readonly dir = signal(0);
  /** how many other days were shown since the page opened (0: the first one, no animation) */
  protected readonly shown = signal(0);
  private lastDay: string | null = null;
  protected readonly monthDir = signal(0);
  /** 1.17: moves at midnight (the store follows the calendar day) */
  protected readonly today = this.store.calendarDay;
  protected readonly maxDay = computed(() => shiftDay(this.today(), 1));
  protected readonly week = computed(() => weekOf(this.store.day()));
  protected readonly month = signal(localDay().slice(0, 7));
  protected readonly grid = computed(() => monthGrid(this.month()));
  protected readonly monthLabel = computed(() => this.i18n.date(this.month() + '-01', { month: 'long', year: 'numeric' }));
  protected readonly weekLetters = computed(() => weekOf(this.today()).map((d) => this.weekday(d)));
  protected readonly monthSummary = computed(() => {
    const m = this.month();
    const target = this.store.target();
    let logged = 0;
    let ok = 0;
    for (const d of this.grid()) {
      if (d.slice(0, 7) !== m) continue;
      const s = this.status(d);
      if (s) logged++;
      if (s === 'ok') ok++;
    }
    return logged ? { logged, ok, target: target ? 1 : 0 } : null;
  });

  protected readonly slots = SLOTS;
  protected readonly slotIcon = SLOT_ICON;
  protected readonly selected = signal<MealEntry | null>(null);
  private readonly router = inject(Router);

  /** 1.14: the recipe of a line of the day; the sheet goes at once, the recipe screen comes in over it */
  protected openRecipe(id: string): void {
    this.dialog().nativeElement.close();
    void this.router.navigate(['/app/meals/recipes', id]);
  }
  protected readonly qty = signal(100);
  protected readonly moveTo = signal<Slot>('LUNCH');
  protected readonly busy = signal(false);

  protected readonly isTomorrow = computed(() => this.store.day() >= shiftDay(this.today(), 1));
  protected readonly dayLabel = computed(() => {
    const d = this.store.day();
    const today = this.today();
    if (d === today) return this.i18n.t('meals.today');
    if (d === shiftDay(today, -1)) return this.i18n.t('meals.yesterday');
    if (d === shiftDay(today, 1)) return this.i18n.t('meals.tomorrow');
    return this.i18n.date(d, { weekday: 'long', day: 'numeric', month: 'long' });
  });
  /** the day's guides in grams: the split chosen, protein by the kilo (core/meals/macro-plan.ts) */
  protected readonly split = computed<MacroSplit>(() => this.tracking.summary()?.profile.macroSplit ?? 'BALANCED');
  protected readonly planKcal = computed(() => this.store.data()?.targetKcal ?? this.tracking.summary()?.energy.targetKcal ?? 2000);
  protected readonly plan = computed(() => {
    const s = this.tracking.summary();
    return macroPlan(this.planKcal(), this.split(), s?.current.weightKg ?? s?.profile.startWeightKg, s?.profile.goalWeightKg);
  });
  protected readonly macros = computed(() => {
    const d = this.store.data();
    const t = this.plan();
    const rows = [
      { key: 'p', label: 'meals.protein', value: d?.totals.proteinG ?? 0, target: t.proteinG, color: 'var(--macro-protein)' },
      { key: 'c', label: 'meals.carbs', value: d?.totals.carbsG ?? 0, target: t.carbsG, color: 'var(--macro-carbs)' },
      { key: 'f', label: 'meals.fat', value: d?.totals.fatG ?? 0, target: t.fatG, color: 'var(--macro-fat)' },
      { key: 'fi', label: 'meals.fiber', value: d?.totals.fiberG ?? 0, target: t.fiberG, color: 'var(--success)' },
    ];
    return rows.map((r) => ({ ...r, pct: Math.min(100, (r.value / Math.max(1, r.target)) * 100) }));
  });
  protected readonly liveKcal = computed(() => {
    const e = this.selected();
    if (!e) return 0;
    const base = e.grams ?? e.servings ?? 1;
    return Math.round((e.nutrients.kcal * this.qty()) / base);
  });
  /** 1.12: the line's nutrients for the amount being chosen */
  protected readonly liveNutrients = computed<Nutrients>(() => {
    const e = this.selected();
    if (!e) return { kcal: 0 };
    const f = this.qty() / (e.grams ?? e.servings ?? 1);
    const n = e.nutrients;
    const x = (v?: number) => (v == null ? undefined : v * f);
    return { kcal: n.kcal * f, proteinG: x(n.proteinG), carbsG: x(n.carbsG), fatG: x(n.fatG), fiberG: x(n.fiberG), sugarsG: x(n.sugarsG), saltG: x(n.saltG), satFatG: x(n.satFatG) };
  });
  /** the day without this line: the paler part of its bars */
  protected readonly restOfDay = computed<Nutrients | null>(() => {
    const e = this.selected();
    const d = this.store.data();
    if (!e || !d) return null;
    const t = d.totals;
    const n = e.nutrients;
    const minus = (a?: number, b?: number) => Math.max(0, (a ?? 0) - (b ?? 0));
    return { kcal: minus(t.kcal, n.kcal), proteinG: minus(t.proteinG, n.proteinG), carbsG: minus(t.carbsG, n.carbsG), fatG: minus(t.fatG, n.fatG), fiberG: minus(t.fiberG, n.fiberG) };
  });
  protected readonly barsPlan = computed<BarsPlan>(() => ({ kcal: this.planKcal(), ...this.plan() }));

  /**
   * The target in plain words: for losing (or gaining) how much a week, from what maintenance, and that it
   * follows the weight: recomputed at each weigh-in, about 10 kcal × the activity factor per kilo.
   */
  protected readonly targetWhy = computed(() => {
    const s = this.tracking.summary();
    if (!s) return null;
    const { targetKcal: target, tdee, bmr, floorApplied } = s.energy;
    const params = {
      target: this.i18n.number(target),
      tdee: this.i18n.number(tdee),
      diff: this.i18n.number(Math.abs(tdee - target)),
      rate: this.i18n.number(s.profile.weeklyRateKg, 2),
      perKg: this.i18n.number(Math.round((10 * tdee) / Math.max(1, bmr))),
    };
    const key = floorApplied ? 'floor' : target < tdee ? 'lose' : target > tdee ? 'gain' : 'keep';
    return this.i18n.t('meals.targetWhy.' + key, params);
  });

  /**
   * What the target counts on for the activity: the day and the sessions, the sport already in it (no need to
   * eat more on a training day); a profile from before 1.7 shows its level and asks for the two answers.
   */
  protected readonly activityNote = computed(() => {
    const p = this.tracking.summary()?.profile;
    if (!p) return null;
    if (!p.job) return this.i18n.t('meals.activity.level', { level: this.i18n.t('setup.activities.' + p.activityLevel + '.label').toLowerCase() });
    const n = p.sessionsPerWeek ?? 0;
    const day = this.i18n.t('meals.activity.jobs.' + p.job);
    return this.i18n.t(n === 0 ? 'meals.activity.none' : n === 1 ? 'meals.activity.one' : 'meals.activity.many', { day, n });
  });

  /**
   * What the member's own numbers say of their needs (4 weeks of meals and weigh-ins): offered when they differ
   * from the formula by 100 kcal or more, and said when the target counts on them.
   */
  protected readonly realNote = computed(() => {
    const s = this.tracking.summary();
    if (!s?.energy) return null;
    const e = s.energy;
    const n = (v: number) => this.i18n.number(v);
    if (e.adaptive && e.realTdee != null) {
      return { on: true, text: this.i18n.t('meals.real.on', { real: n(e.realTdee), days: e.realDays ?? 0 }), action: this.i18n.t('meals.real.off') };
    }
    if (s.profile.adaptiveTdee) return { on: true, text: this.i18n.t('meals.real.notEnough'), action: this.i18n.t('meals.real.off') };
    if (e.realTdee != null && Math.abs(e.realTdee - e.estimatedTdee) >= 100) {
      return {
        on: false,
        text: this.i18n.t('meals.real.offer', { real: n(e.realTdee), estimated: n(e.estimatedTdee), days: e.realDays ?? 0 }),
        action: this.i18n.t('meals.real.use'),
      };
    }
    return null;
  });

  protected async setAdaptive(on: boolean): Promise<void> {
    this.busy.set(true);
    try {
      await this.tracking.setAdaptive(on);
      // the target of the day comes from the server: the day again
      await this.store.load().catch(() => undefined);
      this.toast.show(this.i18n.t(on ? 'meals.real.usedToast' : 'meals.real.offToast'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  /** what stands out in the last 7 days (core/meals/trends.ts) */
  private readonly weekStats = this.store.weekStats;
  protected readonly weekTrends = computed(() => trends(this.weekStats(), this.plan()));

  constructor() {
    void this.shopping.ensure().catch(() => undefined);
    // 1.16: what was seen less than 30 s ago stays as it is (core/api/kept.ts)
    void this.store.ensure().catch(() => undefined);
    void this.tracking.ensure();
    void this.store.ensureWeekStats();
    // a new day on screen (once its data is there): its content fades in
    effect(() => {
      const day = this.store.data()?.day ?? null;
      if (!day || day === this.lastDay) return;
      if (this.lastDay !== null) this.shown.update((n) => n + 1);
      this.lastDay = day;
    });
    // the totals of the week on screen (icons of the strip)
    effect(() => {
      const w = this.week();
      void this.store.loadRange(w[0], w[6]);
    });
  }

  protected go(delta: number): void {
    this.pick(shiftDay(this.store.day(), delta));
  }

  protected pick(day: string): void {
    const current = this.store.day();
    if (day === current || day > this.maxDay()) return;
    this.dir.set(day > current ? 1 : -1);
    void this.store.ensure(day).catch(() => undefined);
  }

  protected status(day: string): DayStatus {
    return dayStatus(this.store.totals()[day]?.kcal, this.store.target(), day, this.today());
  }

  protected iconOf(day: string): string | null {
    const s = this.status(day);
    return s ? STATUS_ICON[s] : null;
  }

  protected weekday(day: string): string {
    return this.i18n.date(day, { weekday: 'narrow' });
  }

  protected dayNumber(day: string): string {
    return String(Number(day.slice(8, 10)));
  }

  protected dayAria(day: string): string {
    const date = this.i18n.date(day, { weekday: 'long', day: 'numeric', month: 'long' });
    const s = this.status(day);
    if (!s) return date;
    const kcal = this.i18n.number(Math.round(this.store.totals()[day]?.kcal ?? 0));
    return date + ', ' + this.i18n.t('meals.calendar.aria.' + s, { kcal });
  }

  protected openCalendar(): void {
    this.store.checkDay();
    this.monthDir.set(0);
    this.month.set(this.store.day().slice(0, 7));
    this.loadMonth();
    this.calDialog().nativeElement.showModal();
  }

  protected moveMonth(delta: number): void {
    this.monthDir.set(delta);
    this.month.set(shiftMonth(this.month(), delta));
    this.loadMonth();
  }

  private loadMonth(): void {
    const g = this.grid();
    void this.store.loadRange(g[0], g[g.length - 1]);
  }

  protected pickFromCalendar(day: string): void {
    this.pick(day);
    closeSheet(this.calDialog().nativeElement);
  }

  protected slotKcal(slot: Slot): number {
    // 1.17: a line deleted without network, still shown crossed out, no longer counts
    return Math.round(this.store.bySlot()[slot].reduce((s, e) => s + (e.pending === 'delete' ? 0 : e.nutrients.kcal), 0));
  }

  /** 1.14: the food of the line opened (its reasons, its warnings), or the health of its recipe */
  protected readonly selectedFood = signal<Food | null>(null);
  protected readonly selectedRecipeHealth = signal<HealthDto | null>(null);
  protected readonly selectedHealth = computed<HealthDto | null>(() => this.selectedFood()?.health ?? this.selectedRecipeHealth());
  protected readonly selectedAlerts = computed(() => {
    const f = this.selectedFood();
    if (!f) return [];
    return healthAlerts({ ...f.per100, drink: !!f.liquid && f.kind !== 'Milk and yogurt' && f.category !== 'laits' });
  });
  /** the day's score as it stands, and this line's share of its calories */
  protected readonly dayNow = computed(() => {
    const d = this.store.data();
    const e = this.selected();
    if (!d || !e) return null;
    const s = dayScore(d, this.today(), this.plan().shares);
    if (!s) return null;
    return { score: s.score, ongoing: s.ongoing, share: d.totals.kcal > 0 ? Math.round((100 * e.nutrients.kcal) / d.totals.kcal) : 0 };
  });

  protected amount(e: MealEntry): string {
    if (e.grams != null && e.liquid) return this.i18n.t('meals.ml', { ml: this.i18n.number(e.grams) });
    if (e.grams != null) return this.i18n.t('meals.grams', { g: this.i18n.number(e.grams) });
    return this.i18n.t('meals.servings', { n: this.i18n.number(e.servings ?? 1, (e.servings ?? 1) % 1 ? 1 : 0) });
  }

  /** noted, changed or deleted offline, not sent yet: shown, not editable until the server has it */
  protected isPending(e: MealEntry): boolean {
    return !!e.pending || e.id.startsWith(PENDING);
  }

  protected edit(e: MealEntry): void {
    if (this.isPending(e)) {
      this.toast.show(this.i18n.t('offline.notYet'));
      return;
    }
    this.selected.set(e);
    this.selectedFood.set(null);
    this.selectedRecipeHealth.set(null);
    // 1.14: why it has its score: what its food or its recipe says of itself
    if (e.foodId) {
      const id = e.foodId;
      void this.mealsApi.food(id).then((f) => this.selected()?.foodId === id && this.selectedFood.set(f)).catch(() => undefined);
    } else if (e.recipeId) {
      const id = e.recipeId;
      void this.mealsApi.recipe(id).then((r) => this.selected()?.recipeId === id && this.selectedRecipeHealth.set(r.health ?? null)).catch(() => undefined);
    }
    this.qty.set(e.grams ?? e.servings ?? 1);
    this.moveTo.set(e.slot);
    this.dialog().nativeElement.showModal();
  }

  protected async save(e: MealEntry): Promise<void> {
    this.busy.set(true);
    try {
      const patch: { slot?: Slot; grams?: number; servings?: number } = { slot: this.moveTo() };
      if (e.grams != null) patch.grams = this.qty();
      else patch.servings = this.qty();
      await this.store.update(e.id, patch);
      this.dialog().nativeElement.close();
      if (this.store.lastQueued()) this.toast.show(this.i18n.t('offline.queued'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }

  /** 1.19: from the line's swipe or its sheet: the same again (a second coffee), noted now */
  protected async duplicate(e: MealEntry): Promise<void> {
    const input =
      e.foodId && e.grams
        ? { foodId: e.foodId, grams: e.grams }
        : e.recipeId && e.servings
          ? { recipeId: e.recipeId, servings: e.servings }
          : { quick: { ...e.nutrients, name: e.name } };
    this.busy.set(true);
    try {
      await this.store.add({ day: e.day, slot: e.slot, ...input }, { name: e.name, nutrients: e.nutrients });
      this.dialog().nativeElement.close();
      this.toast.show(this.store.lastQueued() ? this.i18n.t('offline.queued') : this.i18n.t('meals.entry.duplicated', { name: e.name }));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }

  /** 1.19: from the line's swipe, without opening its sheet */
  protected async removeLine(e: MealEntry): Promise<void> {
    try {
      await this.store.remove(e.id);
      this.toast.show(this.i18n.t(this.store.lastQueued() ? 'offline.queued' : 'meals.entry.deleted'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    }
  }

  protected async remove(e: MealEntry): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.remove(e.id);
      this.dialog().nativeElement.close();
      this.toast.show(this.i18n.t(this.store.lastQueued() ? 'offline.queued' : 'meals.entry.deleted'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(slot: Slot): Promise<void> {
    try {
      const copied = await this.store.copyFromYesterday(slot);
      this.toast.show(this.i18n.t(copied ? 'meals.copied' : 'meals.nothingToCopy'));
    } catch (err) {
      this.toast.error(this.i18n.error(errorCode(err)));
    }
  }
}
