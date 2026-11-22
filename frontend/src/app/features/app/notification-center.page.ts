import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EngageApi, NotificationHistory, SentNotification } from '../../core/engage/engage-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TodoStore } from '../../core/support/support-api';
import { localDay } from '../../core/tracking/tracking.store';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

/** the icon of each kind of notification (PushService.Kind) */
const ICONS: Record<string, string> = {
  DAILY_WEIGH: 'flame',
  DAILY_PHOTO: 'camera',
  GYM: 'dumbbell',
  NUDGE: 'users',
  FRIEND_REQUEST: 'userPlus',
  FRIEND_ACCEPTED: 'users',
  WATER: 'droplet',
  UPDATE: 'sparkles',
  FEEDBACK: 'mail',
  FRIEND_RECIPE: 'book',
  FRIEND_POST: 'share',
  FRIEND_CHEER: 'thumbUp',
  FRIEND_CHALLENGE: 'trophy',
  CHALLENGE_REMINDER: 'trophy',
};

/**
 * 1.17: « Notifications », from the bell on Today: every notification the app sent, latest first, by day with its time,
 * 20 a page, kept 90 days. The new ones (since the last visit) carry a dot; leaving the screen marks them read. A tap
 * opens what it was about.
 */
@Component({
  selector: 'app-notification-center',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'engage.center.title' | t }}</h1>
        <a class="icon-btn settings" routerLink="/app/account/notifications" [attr.aria-label]="'engage.center.settings' | t">
          <app-icon name="sliders" [size]="20" />
        </a>
      </header>

      @if (history(); as h) {
        @if (h.total === 0) {
          <div class="empty">
            <span class="empty-icon"><app-icon name="bell" /></span>
            <p class="empty-title">{{ 'engage.center.empty' | t }}</p>
            <p class="small muted">{{ 'engage.center.emptyHint' | t }}</p>
          </div>
        } @else {
          <p class="small muted">{{ (h.total === 1 ? 'engage.center.countOne' : 'engage.center.count') | t: { n: i18n.number(h.total) } }}</p>
          @for (g of groups(); track g.day) {
            <section class="day" [attr.aria-labelledby]="'d-' + g.day">
              <h2 class="section-title" [id]="'d-' + g.day">{{ g.label }}</h2>
              <ul class="list" role="list">
                @for (n of g.items; track n.id; let i = $index) {
                  <li [style.--i]="i">
                    <button type="button" class="list-item note" [class.unread]="n.unread" (click)="open(n)">
                      <span class="list-icon" [attr.data-kind]="n.kind"><app-icon [name]="icon(n.kind)" /></span>
                      <span class="list-body">
                        <span class="note-head">
                          <span class="list-title">{{ n.title }}</span>
                          <time class="tiny muted num" [attr.datetime]="n.createdAt">{{ time(n.createdAt) }}</time>
                        </span>
                        <span class="list-sub">{{ n.body }}</span>
                      </span>
                      @if (n.unread) {
                        <span class="dot" role="img" [attr.aria-label]="'engage.center.new' | t"></span>
                      }
                    </button>
                  </li>
                }
              </ul>
            </section>
          }

          @if (h.pages > 1) {
            <nav class="pager" [attr.aria-label]="'engage.center.pages' | t">
              <button type="button" class="btn btn-secondary btn-s" [disabled]="busy() || h.page === 0" (click)="go(h.page - 1)">
                <app-icon name="chevronLeft" [size]="18" /> {{ 'engage.center.newer' | t }}
              </button>
              <span class="small muted num" aria-live="polite">{{ 'engage.center.page' | t: { n: h.page + 1, total: h.pages } }}</span>
              <button type="button" class="btn btn-secondary btn-s" [disabled]="busy() || h.page >= h.pages - 1" (click)="go(h.page + 1)">
                {{ 'engage.center.older' | t }} <app-icon name="chevronRight" [size]="18" />
              </button>
            </nav>
          }
          <p class="tiny muted center">{{ 'engage.center.kept' | t }}</p>
        }
      } @else if (failed()) {
        <div class="empty">
          <span class="empty-icon"><app-icon name="cloudOff" /></span>
          <p class="small muted">{{ 'engage.center.failed' | t }}</p>
          <button type="button" class="btn btn-secondary" (click)="go(0)">{{ 'engage.center.retry' | t }}</button>
        </div>
      } @else {
        <div class="skeleton" style="height: 360px; border-radius: 24px"></div>
      }
    </main>
  `,
  styles: `
    .small-title {
      font-size: 1.6rem;
    }
    .page-head .settings {
      margin-left: auto;
    }
    p {
      margin: 0;
    }
    .day {
      display: grid;
      gap: var(--space-2);
    }
    ul.list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .list li + li .list-item {
      border-top: 1px solid var(--line);
    }
    .empty-title {
      font-weight: 700;
      color: var(--fg);
    }
    .list li {
      animation: note-in 360ms var(--ease-out) both;
      animation-delay: calc(min(var(--i, 0), 8) * 30ms);
    }
    @keyframes note-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
    .note {
      align-items: flex-start;
      width: 100%;
      text-align: left;
    }
    .note-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .note-head time {
      flex: none;
    }
    .note .list-title {
      white-space: normal;
    }
    .note .list-sub {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .note.unread .list-title {
      font-weight: 750;
    }
    .list-icon[data-kind='DAILY_WEIGH'],
    .list-icon[data-kind='FRIEND_CHALLENGE'],
    .list-icon[data-kind='CHALLENGE_REMINDER'] {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .list-icon[data-kind='WATER'] {
      background: color-mix(in srgb, #2b8cee 14%, var(--surface));
      color: color-mix(in srgb, #2b8cee 70%, var(--fg));
    }
    .dot {
      flex: none;
      align-self: center;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--flame);
      box-shadow: 0 0 0 3px color-mix(in srgb, #ff6a3d 18%, transparent);
    }
    .pager {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: var(--space-2);
    }
    .pager .btn {
      min-width: 0;
      white-space: normal;
    }
    .pager .btn:last-child {
      justify-self: end;
    }
    .center {
      text-align: center;
    }
  `,
})
export class NotificationCenterPage {
  private readonly api = inject(EngageApi);
  private readonly todo = inject(TodoStore);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  protected readonly history = signal<NotificationHistory | null>(null);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  /** the page by day, each day under its name (« Aujourd'hui », « Hier », « lundi 16 novembre ») */
  protected readonly groups = computed(() => {
    const items = this.history()?.items ?? [];
    const out: { day: string; label: string; items: SentNotification[] }[] = [];
    for (const n of items) {
      const day = localDay(new Date(n.createdAt));
      let g = out.at(-1);
      if (!g || g.day !== day) out.push((g = { day, label: this.dayLabel(day), items: [] }));
      g.items.push(n);
    }
    return out;
  });

  constructor() {
    void this.go(0);
    // left: what was there is read (the bell on Today loses its number)
    inject(DestroyRef).onDestroy(() => {
      if (!this.history()?.items.some((n) => n.unread)) return;
      void this.api
        .seen()
        .then(() => this.todo.refresh())
        .catch(() => undefined);
    });
  }

  protected async go(page: number): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      this.history.set(await this.api.history(page));
      if (page > 0 || globalThis.scrollY > 0) globalThis.scrollTo?.({ top: 0 });
    } catch {
      if (!this.history()) this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected icon(kind: string): string {
    return ICONS[kind] ?? 'bell';
  }

  protected time(at: string): string {
    return new Date(at).toLocaleTimeString(this.i18n.lang() === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  private dayLabel(day: string): string {
    const today = localDay();
    const yesterday = localDay(new Date(Date.now() - 86_400_000));
    if (day === today) return this.i18n.t('meals.today');
    if (day === yesterday) return this.i18n.t('meals.yesterday');
    return this.i18n.date(day, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  /** what it was about (an address of the app only) */
  protected open(n: SentNotification): void {
    if (n.url.startsWith('/') && !n.url.startsWith('//')) void this.router.navigateByUrl(n.url);
  }
}
