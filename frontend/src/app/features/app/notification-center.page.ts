import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EngageApi, NotificationHistory, SentNotification } from '../../core/engage/engage-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TodoStore } from '../../core/support/support-api';
import { localDay } from '../../core/tracking/tracking.store';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { Network, NetEvent } from '../../core/offline/network';
import { spanOf } from '../../core/offline/when';
import { unreachable } from '../../core/offline/offline-cache';

/** a line of the centre: a notification of the server, or (1.18) a loss or a return of the network, kept on the phone */
type Line = SentNotification & { local?: boolean };

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
  RECIPE_SENT: 'send',
  FRIEND_POST: 'share',
  FRIEND_CHEER: 'thumbUp',
  FRIEND_CHALLENGE: 'trophy',
  CHALLENGE_REMINDER: 'trophy',
  MONTHLY_RECAP: 'calendar',
  NET_LOST: 'cloudOff',
  NET_BACK: 'cloud',
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
        @if (h.total === 0 && !netLines().length) {
          <div class="empty">
            <span class="empty-icon"><app-icon name="bell" /></span>
            <p class="empty-title">{{ 'engage.center.empty' | t }}</p>
            <p class="small muted">{{ 'engage.center.emptyHint' | t }}</p>
          </div>
        } @else {
          @if (h.total > 0) {
            <p class="small muted">{{ (h.total === 1 ? 'engage.center.countOne' : 'engage.center.count') | t: { n: i18n.number(h.total) } }}</p>
          }
          @if (away()) {
            <p class="small away"><app-icon name="cloudOff" [size]="16" /> {{ 'engage.center.away' | t }}</p>
          }
          @for (g of groups(); track g.day) {
            <section class="day" [attr.aria-labelledby]="'d-' + g.day">
              <h2 class="section-title" [id]="'d-' + g.day">{{ g.label }}</h2>
              <ul class="list" role="list">
                @for (n of g.items; track n.id; let i = $index) {
                  <li [style.--i]="i">
                    <button type="button" class="list-item note" [class.unread]="n.unread" [class.local]="n.local" (click)="open(n)">
                      <span class="list-icon" [attr.data-kind]="n.kind"><app-icon [name]="icon(n.kind)" /></span>
                      <span class="list-body">
                        <span class="note-head">
                          <span class="list-title">{{ n.title }}</span>
                          <time class="tiny muted num" [attr.datetime]="n.createdAt">{{ time(n.createdAt) }}</time>
                        </span>
                        <span class="list-sub">{{ n.body }}</span>
                        @if (n.local) {
                          <span class="tiny muted on-phone">{{ 'engage.center.net.onPhone' | t }}</span>
                        }
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
    .page-head {
      position: relative;
    }
    .page-head .settings {
      position: absolute;
      top: 0;
      right: -6px;
    }
    .away {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      color: var(--fg-2);
    }
    p {
      margin: 0;
    }
    .day {
      display: grid;
      gap: 10px;
    }
    /* 1.19: the day's name had the list right under it (the global title takes back the gap below it) */
    .day .section-title {
      margin: var(--space-2) 0 0 4px;
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
    .list-icon[data-kind='NET_LOST'] {
      background: color-mix(in srgb, var(--fg) 8%, var(--surface));
      color: var(--fg-2);
    }
    .list-icon[data-kind='NET_BACK'] {
      background: color-mix(in srgb, var(--success) 14%, var(--surface));
      color: var(--success);
    }
    .on-phone {
      display: block;
      margin-top: 2px;
    }
    .note.local {
      cursor: default;
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
  /** 1.18: shown without the server's notifications (no network, none kept): they come back with the network */
  protected readonly away = signal(false);

  private readonly network = inject(Network);

  /**
   * 1.18: the losses and returns of the network that fall within this page (the first page: everything newer than its last
   * line; the last one: everything older than its first), as lines of the centre
   */
  protected readonly netLines = computed<Line[]>(() => {
    const h = this.history();
    if (!h) return [];
    const at = (n: SentNotification) => new Date(n.createdAt).getTime();
    const newest = h.page === 0 || !h.items.length ? Infinity : at(h.items[0]);
    const oldest = h.page >= h.pages - 1 || !h.items.length ? -Infinity : at(h.items[h.items.length - 1]);
    const log = this.network.log();
    return log
      .filter((e) => e.at <= newest && e.at > oldest)
      .map((e) => this.lineOf(e, e === log[log.length - 1] && !this.network.online()));
  });

  private lineOf(e: NetEvent, stillOff: boolean): Line {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t('engage.center.net.' + k, p);
    let body: string;
    if (e.kind === 'lost') body = t(stillOff ? 'lostNow' : 'lostBody');
    else {
      const d = spanOf(e.at - (e.since ?? e.at), this.i18n);
      body = e.late
        ? t('backLate', { d })
        : !e.sent
          ? t('backBody', { d })
          : t(e.sent === 1 ? 'backSentOne' : 'backSentMany', { d, n: e.sent });
      if (e.late && e.sent) body += ' · ' + t(e.sent === 1 ? 'sentOne' : 'sentMany', { n: e.sent });
    }
    return {
      id: 'net-' + e.kind + e.at,
      kind: e.kind === 'lost' ? 'NET_LOST' : 'NET_BACK',
      title: t(e.kind),
      body,
      url: '',
      createdAt: new Date(e.at).toISOString(),
      unread: false,
      local: true,
    };
  }

  /** the page by day, each day under its name (« Aujourd'hui », « Hier », « lundi 16 novembre ») */
  protected readonly groups = computed(() => {
    const items: Line[] = [...(this.history()?.items ?? []), ...this.netLines()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const out: { day: string; label: string; items: Line[] }[] = [];
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
    // 1.18: back online, the server's notifications (and the return just written down) without leaving the screen
    const back = this.network.back.subscribe(() => {
      if (this.away()) {
        this.away.set(false);
        this.history.set(null);
        void this.go(0);
      }
    });
    inject(DestroyRef).onDestroy(() => back.unsubscribe());
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
    } catch (e) {
      // 1.18: no network and nothing kept from before: an empty page, so that the losses and returns kept on the phone show
      if (!this.history() && unreachable(e)) {
        this.history.set({ items: [], page: 0, pages: 1, total: 0 });
        this.away.set(true);
      } else if (!this.history()) this.failed.set(true);
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
  protected open(n: Line): void {
    if (n.local) return;
    if (n.url.startsWith('/') && !n.url.startsWith('//')) void this.router.navigateByUrl(n.url);
  }
}
