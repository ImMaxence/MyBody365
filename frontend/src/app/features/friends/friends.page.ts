import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorCode } from '../../core/api/api.service';
import { HttpErrorResponse } from '@angular/common/http';
import { Friend, FriendRequest, FriendRequests, FriendsApi, FriendsView, Member, SharedPhoto, inviteToken, normalizeUsername } from '../../core/friends/friends-api';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';
import { ReportSheetComponent } from '../../shared/report-sheet.component';

/** Friends: add by username or invite (QR code or link), requests, flames, nudges, photos shared with me. */
@Component({
  selector: 'app-friends',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, IconComponent, BackButtonComponent, ReportSheetComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'friends.title' | t }}</h1>
      </header>

      <section class="card find">
        <h2 class="find-title"><app-icon name="search" [size]="18" /> {{ 'friends.search.title' | t }}</h2>
        <form class="find-form" (ngSubmit)="search()">
          <label class="handle-input">
            <span aria-hidden="true">@</span>
            <input name="username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="21" enterkeyhint="search"
              role="combobox" aria-autocomplete="list" aria-controls="friend-suggestions" [attr.aria-expanded]="suggestions().length > 0"
              [attr.aria-activedescendant]="active() >= 0 ? 'suggestion-' + active() : null"
              [attr.aria-label]="'friends.search.label' | t" [placeholder]="'friends.search.placeholder' | t" [(ngModel)]="query"
              (ngModelChange)="typed($event)" (keydown)="keys($event)" (blur)="closeSuggestions()" />
          </label>
          <button type="submit" class="btn btn-primary find-btn" [disabled]="busy() || !query.trim()" [attr.aria-label]="'friends.search.submit' | t">
            <app-icon name="search" [size]="18" />
          </button>
        </form>
        <ul id="friend-suggestions" class="suggestions" role="listbox" [attr.aria-label]="'friends.search.suggestions' | t" [hidden]="!suggestions().length">
          @for (m of suggestions(); track m.id; let i = $index) {
            <li [id]="'suggestion-' + i" role="option" [attr.aria-selected]="i === active()" [class.active]="i === active()" [style.--i]="i"
              (mousedown)="$event.preventDefault()" (click)="pickSuggestion(m)">
              <span class="ava small-ava" [style.--h]="hue(m.name)">
                @if (m.avatarUrl && !broken().has(m.avatarUrl)) {
                  <img [src]="m.avatarUrl" (error)="markBroken(m.avatarUrl)" alt="" referrerpolicy="no-referrer" />
                } @else {
                  {{ m.name.charAt(0).toUpperCase() }}
                }
              </span>
              <span class="who-copy">
                <span class="name">{{ m.name }}</span>
                <span class="small muted">&#64;{{ m.username }}</span>
              </span>
              @if (m.relation !== 'NONE') {
                <span class="chip tiny">{{ 'friends.search.relation.' + m.relation | t }}</span>
              }
            </li>
          }
        </ul>
        @if (searchError(); as err) {
          <p class="small muted find-msg">{{ err }}</p>
        }
        @if (found(); as m) {
          <div class="member">
            <span class="ava" [style.--h]="hue(m.name)">
              @if (m.avatarUrl && !broken().has(m.avatarUrl)) {
                <img [src]="m.avatarUrl" (error)="markBroken(m.avatarUrl)" alt="" referrerpolicy="no-referrer" />
              } @else {
                {{ m.name.charAt(0).toUpperCase() }}
              }
            </span>
            <span class="who-copy">
              <span class="name">{{ m.name }}</span>
              <span class="small muted">&#64;{{ m.username }}</span>
            </span>
            @switch (m.relation) {
              @case ('NONE') {
                <button type="button" class="btn btn-primary btn-s" [disabled]="busy()" (click)="request(m)"><app-icon name="userPlus" [size]="16" /> {{ 'friends.search.request' | t }}</button>
              }
              @case ('SENT') {
                <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="cancel(m)">{{ 'friends.search.cancel' | t }}</button>
              }
              @case ('RECEIVED') {
                <button type="button" class="btn btn-primary btn-s" [disabled]="busy()" (click)="acceptMember(m)"><app-icon name="check" [size]="16" /> {{ 'friends.search.accept' | t }}</button>
              }
              @case ('FRIEND') {
                <span class="chip chip-success"><app-icon name="check" [size]="14" /> {{ 'friends.search.friend' | t }}</span>
              }
              @default {
                <span class="chip">{{ 'friends.search.self' | t }}</span>
              }
            }
          </div>
        }
        <div class="mine">
          <span class="small muted">{{ 'friends.search.mine' | t }}</span>
          <button type="button" class="handle" (click)="copyMine()" [attr.aria-label]="'friends.search.copy' | t">
            <span>&#64;{{ session.account()?.username }}</span><app-icon name="copy" [size]="14" />
          </button>
        </div>
      </section>

      @if (requests(); as r) {
        @if (r.received.length) {
          <h2 class="section-title">{{ 'friends.requests.received' | t }}</h2>
          <div class="friends">
            @for (q of r.received; track q.id; let i = $index) {
              <div class="card friend request" [style.--i]="i">
                <span class="ava" [style.--h]="hue(q.name)">
                  @if (q.avatarUrl && !broken().has(q.avatarUrl)) {
                    <img [src]="q.avatarUrl" (error)="markBroken(q.avatarUrl)" alt="" referrerpolicy="no-referrer" />
                  } @else {
                    {{ q.name.charAt(0).toUpperCase() }}
                  }
                </span>
                <span class="who-copy">
                  <span class="name">{{ q.name }}</span>
                  <span class="small muted">&#64;{{ q.username }}</span>
                </span>
                <button type="button" class="round no" [disabled]="busy()" [attr.aria-label]="'friends.search.decline' | t" (click)="decline(q)"><app-icon name="x" [size]="18" /></button>
                <button type="button" class="round yes" [disabled]="busy()" [attr.aria-label]="'friends.search.accept' | t" (click)="acceptRequest(q)"><app-icon name="check" [size]="18" [stroke]="2.6" /></button>
              </div>
            }
          </div>
        }
        @if (r.sent.length) {
          <h2 class="section-title">{{ 'friends.requests.sent' | t }}</h2>
          <div class="friends">
            @for (q of r.sent; track q.id; let i = $index) {
              <div class="card friend request" [style.--i]="i">
                <span class="ava" [style.--h]="hue(q.name)">{{ q.name.charAt(0).toUpperCase() }}</span>
                <span class="who-copy">
                  <span class="name">{{ q.name }}</span>
                  <span class="small muted">&#64;{{ q.username }} · {{ 'friends.search.sent' | t }}</span>
                </span>
                <button type="button" class="btn btn-ghost btn-s" [disabled]="busy()" (click)="withdraw(q)">{{ 'common.cancel' | t }}</button>
              </div>
            }
          </div>
        }
      }

      <h2 class="section-title">{{ 'friends.orLink' | t }}</h2>
      <div class="actions">
        <button type="button" class="btn btn-secondary" (click)="openInvite()"><app-icon name="qr" [size]="18" /> {{ 'friends.invite' | t }}</button>
        <button type="button" class="btn btn-secondary" (click)="openAdd()"><app-icon name="link" [size]="18" /> {{ 'friends.haveLink' | t }}</button>
      </div>

      @if (view()?.friends?.length) {
        <h2 class="section-title">{{ 'friends.title' | t }}</h2>
      }

      @if (view(); as v) {
        @if (v.friends.length) {
          <div class="friends">
            @for (f of v.friends; track f.id; let i = $index) {
              <div class="card friend" [style.--i]="i">
                <button type="button" class="who" (click)="openFriend(f)">
                  <span class="ava" [style.--h]="hue(f.name)">
                    @if (f.avatarUrl && !broken().has(f.avatarUrl)) {
                      <img [src]="f.avatarUrl" (error)="markBroken(f.avatarUrl)" alt="" referrerpolicy="no-referrer" loading="lazy" />
                    } @else {
                      {{ f.name.charAt(0).toUpperCase() }}
                    }
                  </span>
                  <span class="who-copy">
                    <span class="name">{{ f.name }}</span>
                    <span class="status small" [class.ok]="f.todayDone" [class.muted]="!f.todayDone">
                      @if (f.todayDone) {
                        <app-icon name="check" [size]="14" [stroke]="3" />
                      }
                      {{ (f.todayDone ? 'friends.doneToday' : 'friends.notYet') | t }}
                    </span>
                  </span>
                </button>
                <span class="flame num" [class.lit]="f.streak > 0" [attr.aria-label]="'friends.streak' | t: { n: f.streak }">
                  <app-icon name="flame" [size]="16" [stroke]="2.3" /> {{ f.streak }}
                </span>
                <button type="button" class="nudge" [class.sent]="f.nudgedToday" [disabled]="f.nudgedToday || busy()"
                  [attr.aria-label]="'friends.nudgeLabel' | t: { name: f.name }" [attr.title]="(f.nudgedToday ? 'friends.nudgeDone' : 'friends.nudge') | t" (click)="nudge(f)">
                  <app-icon [name]="f.nudgedToday ? 'check' : 'zap'" [size]="20" [stroke]="2.2" />
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="empty">
            <span class="empty-icon"><app-icon name="users" /></span>
            <p class="small">{{ 'friends.none' | t }}</p>
          </div>
        }

        @if (v.sharedWithMe.length) {
          <h2 class="section-title">{{ 'friends.sharedWithMe' | t }}</h2>
          <div class="grid">
            @for (p of v.sharedWithMe; track p.id) {
              <button type="button" class="tile" (click)="openPhoto(p)" [attr.aria-label]="'friends.sharedBy' | t: { name: p.ownerName, date: i18n.date(p.day) }">
                <img [src]="p.thumbUrl" alt="" loading="lazy" />
                <span class="tile-name">{{ p.ownerName }}</span>
              </button>
            }
          </div>
        }
      } @else {
        <div class="skeleton" style="height: 90px; border-radius: 24px"></div>
      }

      <!-- invite: QR code + link -->
      <dialog class="sheet" #inviteDialog>
        <div class="sheet-grip"></div>
        <div class="stack center">
          <h2 class="h3">{{ 'friends.invite' | t }}</h2>
          <p class="small muted">{{ 'friends.inviteText' | t }}</p>
          @if (qr()) {
            <img class="qr" [src]="qr()" width="240" height="240" [alt]="'friends.invite' | t" />
          } @else {
            <div class="qr skeleton"></div>
          }
          @if (invite(); as inv) {
            <p class="tiny muted">{{ 'friends.validUntil' | t: { date: i18n.date(inv.expiresAt, { day: 'numeric', month: 'long' }) } }}</p>
            <div class="row">
              @if (canShare) {
                <button type="button" class="btn btn-primary" (click)="shareLink(inv.url)"><app-icon name="share" [size]="18" /> {{ 'friends.shareLink' | t }}</button>
              }
              <button type="button" class="btn btn-secondary" (click)="copy(inv.url)"><app-icon name="copy" [size]="18" /> {{ 'friends.copyLink' | t }}</button>
            </div>
          }
          <button type="button" class="btn btn-ghost btn-block" (click)="inviteDialog.close()">{{ 'common.close' | t }}</button>
        </div>
      </dialog>

      <!-- add: scan or paste -->
      <dialog class="sheet" #addDialog (close)="stopScan()">
        <div class="sheet-grip"></div>
        <form class="stack" (ngSubmit)="accept(link)">
          <div>
            <h2 class="h3">{{ 'friends.add' | t }}</h2>
            <p class="small muted">{{ 'friends.addText' | t }}</p>
          </div>
          @if (scanning()) {
            <video #video class="scan" playsinline muted autoplay></video>
          } @else {
            <button type="button" class="btn btn-secondary" (click)="startScan()"><app-icon name="camera" [size]="18" /> {{ 'friends.scanQr' | t }}</button>
          }
          <div class="field">
            <label class="label" for="f-link">{{ 'friends.pasteLabel' | t }}</label>
            <input class="input" id="f-link" name="link" autocomplete="off" [placeholder]="'friends.pastePlaceholder' | t" [(ngModel)]="link" />
          </div>
          <button type="submit" class="btn btn-primary btn-block" [disabled]="busy() || !link.trim()"><app-icon name="userPlus" /> {{ 'friends.accept' | t }}</button>
        </form>
      </dialog>

      <!-- a friend -->
      <dialog class="sheet" #friendDialog>
        <div class="sheet-grip"></div>
        @if (selected(); as f) {
          <div class="stack">
            <div class="who big">
              <span class="ava" [style.--h]="hue(f.name)">
                @if (f.avatarUrl && !broken().has(f.avatarUrl)) {
                  <img [src]="f.avatarUrl" (error)="markBroken(f.avatarUrl)" alt="" referrerpolicy="no-referrer" />
                } @else {
                  {{ f.name.charAt(0).toUpperCase() }}
                }
              </span>
              <div>
                <h2 class="h3">{{ f.name }}</h2>
                <p class="small accent">&#64;{{ f.username }}</p>
                <p class="small muted">{{ 'friends.since' | t: { date: i18n.date(f.since, { day: 'numeric', month: 'long', year: 'numeric' }) } }}</p>
              </div>
            </div>
            <p class="small"><app-icon name="flame" [size]="16" /> {{ 'friends.streak' | t: { n: f.streak } }} · {{ 'friends.sharedCount' | t: { n: f.sharedWithMe } }}</p>
            <p class="small muted">{{ 'friends.removeConfirm' | t: { name: f.name } }}</p>
            <button type="button" class="btn btn-ghost btn-block danger" [disabled]="busy()" (click)="remove(f)"><app-icon name="trash" /> {{ 'friends.remove' | t }}</button>
          </div>
        }
      </dialog>

      <!-- a photo shared with me -->
      <dialog class="sheet photo-sheet" #photoDialog>
        <div class="sheet-grip"></div>
        @if (photo(); as p) {
          <div class="stack">
            <img class="shared" [src]="p.url" alt="" />
            <p class="small muted">{{ 'friends.sharedBy' | t: { name: p.ownerName, date: i18n.date(p.day, { day: 'numeric', month: 'long' }) } }}</p>
            <button type="button" class="btn btn-ghost btn-block" (click)="report(p)"><app-icon name="flag" /> {{ 'friends.report.title' | t }}</button>
          </div>
        }
      </dialog>
      <app-report-sheet />
    </main>
  `,
  styles: `
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }
    .find {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .find-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.02rem;
      font-weight: 750;
    }
    .find-title app-icon {
      color: var(--accent-text);
    }
    .find-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 48px;
      gap: var(--space-2);
    }
    .handle-input {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      min-width: 0;
      min-height: 48px;
      padding: 0 14px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      border: 1px solid var(--line-strong);
      font-weight: 700;
      color: var(--fg-2);
      transition: border-color var(--dur-2);
    }
    .handle-input:focus-within {
      border-color: var(--accent);
    }
    .handle-input input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: transparent;
      font: inherit;
      color: var(--fg);
      outline: none;
    }
    .suggestions {
      display: grid;
      margin: calc(-1 * var(--space-1)) 0 0;
      padding: 4px;
      list-style: none;
      border-radius: var(--radius-m);
      background: var(--surface);
      border: 1px solid var(--line-strong);
      box-shadow: var(--shadow-2);
      animation: rise 200ms var(--ease-out) both;
    }
    .suggestions[hidden] {
      display: none;
    }
    .suggestions li {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: 52px;
      padding: 6px 10px;
      border-radius: 12px;
      cursor: pointer;
      animation: rise 220ms var(--ease-out) both;
      animation-delay: calc(var(--i) * 25ms);
    }
    @media (hover: hover) and (pointer: fine) {
      .suggestions li.active,
      .suggestions li:hover {
        background: var(--accent-soft);
      }
    }
    .suggestions .who-copy {
      flex: 1;
    }
    .small-ava {
      width: 34px;
      height: 34px;
      font-size: 14px;
    }
    .find-btn {
      width: 48px;
      min-height: 48px;
      padding: 0;
    }
    .find-msg {
      animation: rise 300ms var(--ease-out) both;
    }
    .member {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-m);
      background: var(--surface-2);
      animation: rise 320ms var(--ease-out) both;
    }
    .mine {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--line);
    }
    .handle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 10px;
      border-radius: var(--radius-pill);
      background: var(--accent-soft);
      color: var(--accent-text);
      font-weight: 700;
    }
    .accent {
      color: var(--accent-text);
      font-weight: 650;
    }
    .round {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .round:active {
      transform: scale(0.88);
    }
    .round.yes {
      background: var(--cal-done);
      color: var(--cal-done-ink);
    }
    .round.no {
      background: var(--surface-3);
      color: var(--fg-2);
    }
    .request .who-copy,
    .member .who-copy {
      flex: 1;
    }
    .ava img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    .friends {
      display: grid;
      gap: var(--space-2);
    }
    .friend {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    .who {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .who.big {
      flex: none;
    }
    .ava {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      flex: none;
      overflow: hidden;
      border-radius: 50%;
      background: hsl(var(--h) 70% 86%);
      color: hsl(var(--h) 60% 26%);
      font-weight: 850;
    }
    .who-copy {
      display: grid;
      min-width: 0;
    }
    .name {
      font-weight: 750;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ok {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--success);
      font-weight: 650;
    }
    .flame {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-weight: 800;
      color: var(--fg-3);
    }
    .flame.lit {
      color: var(--accent-text);
    }
    .status {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    /* a nudge: one tap, a little bounce, then done for the day */
    .nudge {
      display: grid;
      place-items: center;
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent-text);
      transition: transform var(--dur-2) var(--ease-out), background-color var(--dur-2);
    }
    .nudge:active {
      transform: scale(0.88);
    }
    .nudge.sent {
      background: var(--success-soft);
      color: var(--success);
      animation: sent 420ms var(--ease-out);
    }
    @keyframes sent {
      40% {
        transform: scale(1.18) rotate(-8deg);
      }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .tile {
      position: relative;
      aspect-ratio: 3 / 4;
      border-radius: 14px;
      overflow: hidden;
      background: var(--surface-3);
    }
    .tile img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .tile-name {
      position: absolute;
      left: 6px;
      bottom: 6px;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      background: rgba(10, 10, 12, 0.6);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
    }
    .center {
      justify-items: center;
      text-align: center;
    }
    .qr {
      width: 240px;
      height: 240px;
      border-radius: 20px;
      background: #fff;
      padding: 10px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--space-2);
    }
    .scan {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: var(--radius-l);
      background: #000;
    }
    .shared {
      width: 100%;
      max-height: 62dvh;
      object-fit: contain;
      border-radius: var(--radius-l);
      background: #0a0a0c;
    }
    .danger {
      color: var(--danger);
    }
  `,
})
export class FriendsPage {
  private readonly api = inject(FriendsApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly inviteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('inviteDialog');
  private readonly addDialog = viewChild.required<ElementRef<HTMLDialogElement>>('addDialog');
  private readonly friendDialog = viewChild.required<ElementRef<HTMLDialogElement>>('friendDialog');
  private readonly photoDialog = viewChild.required<ElementRef<HTMLDialogElement>>('photoDialog');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly reportSheet = viewChild.required(ReportSheetComponent);

  protected readonly session = inject(SessionStore);
  protected readonly view = signal<FriendsView | null>(null);
  protected readonly requests = signal<FriendRequests | null>(null);
  /** pictures that could not be loaded: the initial instead */
  protected readonly broken = signal<Set<string>>(new Set());
  protected readonly found = signal<Member | null>(null);
  protected readonly searchError = signal<string | null>(null);
  protected query = '';
  protected readonly suggestions = signal<Member[]>([]);
  protected readonly active = signal(-1);
  private suggestTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly invite = signal<{ url: string; expiresAt: string } | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly selected = signal<Friend | null>(null);
  protected readonly photo = signal<SharedPhoto | null>(null);
  protected readonly busy = signal(false);
  protected readonly scanning = signal(false);
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  protected link = '';
  private stream: MediaStream | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private zxing: { stop(): void } | null = null;

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => this.stopScan());
  }

  private async load(): Promise<void> {
    const [view, requests] = await Promise.allSettled([this.api.list(), this.api.requests()]);
    this.view.set(view.status === 'fulfilled' ? view.value : { friends: [], sharedWithMe: [] });
    this.requests.set(requests.status === 'fulfilled' ? requests.value : { received: [], sent: [] });
  }

  protected markBroken(src: string): void {
    this.broken.update((s) => new Set(s).add(src));
  }

  /** suggestions from 3 characters, a moment after the last key (only members who accept to be suggested) */
  protected typed(value: string): void {
    this.found.set(null);
    this.searchError.set(null);
    if (this.suggestTimer) clearTimeout(this.suggestTimer);
    const q = normalizeUsername(value);
    if (!q) {
      this.suggestions.set([]);
      this.active.set(-1);
      return;
    }
    this.suggestTimer = setTimeout(async () => {
      try {
        const list = await this.api.suggest(q);
        // a newer key may have been typed meanwhile
        if (normalizeUsername(this.query) === q) {
          this.suggestions.set(list);
          this.active.set(-1);
        }
      } catch {
        this.suggestions.set([]);
      }
    }, 250);
  }

  /** ↓ ↑ to move in the suggestions, Enter to pick one, Escape to close them */
  protected keys(e: KeyboardEvent): void {
    const list = this.suggestions();
    if (!list.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      this.active.set((this.active() + d + list.length) % list.length);
    } else if (e.key === 'Enter' && this.active() >= 0) {
      e.preventDefault();
      this.pickSuggestion(list[this.active()]);
    } else if (e.key === 'Escape') {
      this.closeSuggestions();
    }
  }

  protected pickSuggestion(m: Member): void {
    this.query = m.username;
    this.closeSuggestions();
    this.searchError.set(null);
    this.found.set(m);
  }

  protected closeSuggestions(): void {
    this.suggestions.set([]);
    this.active.set(-1);
  }

  /** an exact username (also what Enter does without a suggestion picked) */
  protected async search(): Promise<void> {
    this.closeSuggestions();
    const u = normalizeUsername(this.query);
    this.found.set(null);
    if (!u) {
      this.searchError.set(this.i18n.t('friends.search.invalid'));
      return;
    }
    this.busy.set(true);
    try {
      this.found.set(await this.api.search(u));
      this.searchError.set(null);
    } catch (e) {
      const notFound = e instanceof HttpErrorResponse && e.status === 404;
      this.searchError.set(notFound ? this.i18n.t('friends.search.notFound') : this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async request(m: Member): Promise<void> {
    this.busy.set(true);
    try {
      const { relation } = await this.api.request(m.username);
      this.found.set({ ...m, relation });
      this.toast.show(this.i18n.t(relation === 'FRIEND' ? 'friends.search.matched' : 'friends.search.requested', { name: m.name }));
      await this.load();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(m: Member): Promise<void> {
    await this.drop(m.id, 'friends.search.cancelled');
    this.found.set({ ...m, relation: 'NONE' });
  }

  protected async acceptMember(m: Member): Promise<void> {
    await this.acceptRequest({ id: m.id, name: m.name, username: m.username, sentAt: '' });
    this.found.set({ ...m, relation: 'FRIEND' });
  }

  protected async acceptRequest(q: FriendRequest): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.acceptRequest(q.id);
      this.toast.show(this.i18n.t('friends.requests.accepted', { name: q.name }));
      await this.load();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected decline(q: FriendRequest): Promise<void> {
    return this.drop(q.id, 'friends.search.declined');
  }

  protected withdraw(q: FriendRequest): Promise<void> {
    return this.drop(q.id, 'friends.search.cancelled');
  }

  private async drop(id: string, done: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.dropRequest(id);
      this.toast.show(this.i18n.t(done));
      await this.load();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copyMine(): Promise<void> {
    const u = this.session.account()?.username;
    if (!u) return;
    try {
      await navigator.clipboard.writeText('@' + u);
      this.toast.show(this.i18n.t('friends.search.copied'));
    } catch {
      /* no clipboard: the username stays on screen */
    }
  }

  protected hue(name: string): number {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }

  protected async openInvite(): Promise<void> {
    this.inviteDialog().nativeElement.showModal();
    try {
      const inv = await this.api.invite();
      this.invite.set(inv);
      // a CommonJS package: its functions sit under default once bundled
      const mod = await import('qrcode');
      const QR = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
      this.qr.set(await QR.toDataURL(inv.url, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#141417', light: '#ffffff' } }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    }
  }

  protected async shareLink(url: string): Promise<void> {
    try {
      await navigator.share({ title: this.i18n.t('friends.inviteShareTitle'), text: this.i18n.t('friends.inviteShareText'), url });
    } catch {
      /* cancelled */
    }
  }

  protected async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.toast.show(this.i18n.t('friends.linkCopied'));
    } catch {
      this.toast.error(this.i18n.error('generic'));
    }
  }

  protected openAdd(): void {
    this.link = '';
    this.addDialog().nativeElement.showModal();
  }

  protected async accept(text: string): Promise<void> {
    const token = inviteToken(text);
    if (!token) {
      this.toast.error(this.i18n.error('invite_invalid'));
      return;
    }
    this.busy.set(true);
    try {
      const f = await this.api.accept(token);
      this.addDialog().nativeElement.close();
      this.toast.show(this.i18n.t('friends.added', { name: f.name }));
      await this.load();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  /** the QR code holds the friend link: read with the browser's detector or ZXing */
  protected async startScan(): Promise<void> {
    this.scanning.set(true);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } });
      await new Promise((r) => setTimeout(r));
      const v = this.video()!.nativeElement;
      v.srcObject = this.stream;
      await v.play().catch(() => undefined);
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } })
        .BarcodeDetector;
      const found = (text: string) => {
        if (!inviteToken(text)) return;
        this.link = text;
        this.stopScan();
        void this.accept(text);
      };
      if (Native) {
        const detector = new Native({ formats: ['qr_code'] });
        this.scanTimer = setInterval(async () => {
          const codes = await detector.detect(v).catch(() => []);
          if (codes[0]?.rawValue) found(codes[0].rawValue);
        }, 300);
      } else {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        this.zxing = await new BrowserQRCodeReader().decodeFromVideoElement(v, (result) => result && found(result.getText()));
      }
    } catch {
      this.stopScan();
      this.toast.error(this.i18n.t('photos.camera.unavailable'));
    }
  }

  protected stopScan(): void {
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.scanTimer = null;
    this.zxing?.stop();
    this.zxing = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.scanning.set(false);
  }

  protected async nudge(f: Friend): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.api.nudge(f.id);
      this.toast.show(this.i18n.t(r.sent > 0 ? 'friends.nudged' : 'friends.nudgedNoDevice', { name: f.name }));
      this.view.update((v) => v && { ...v, friends: v.friends.map((x) => (x.id === f.id ? { ...x, nudgedToday: true } : x)) });
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected openFriend(f: Friend): void {
    this.selected.set(f);
    this.friendDialog().nativeElement.showModal();
  }

  protected async remove(f: Friend): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.remove(f.id);
      this.friendDialog().nativeElement.close();
      this.toast.show(this.i18n.t('friends.removed', { name: f.name }));
      await this.load();
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected openPhoto(p: SharedPhoto): void {
    this.photo.set(p);
    this.photoDialog().nativeElement.showModal();
  }

  protected report(p: SharedPhoto): void {
    this.photoDialog().nativeElement.close();
    this.reportSheet().open('PHOTO', p.id);
  }
}
