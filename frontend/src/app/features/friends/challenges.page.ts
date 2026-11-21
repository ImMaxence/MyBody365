import { FriendsStore } from '../../core/friends/friends.store';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import { challengeDay, challengeStanding } from '../../core/friends/challenge-text';
import { CHALLENGE_EMOJI, Challenge, ChallengeKind, Friend, FriendsApi } from '../../core/friends/friends-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { HapticDirective } from '../../core/ui/haptics';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarImgComponent } from '../../shared/avatar-img.component';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

const KINDS: ChallengeKind[] = ['WEIGH', 'WATER', 'MEALS', 'PHOTO'];
const LENGTHS = [7, 14, 30];
const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Challenges between friends (1.9): the invitations to answer, the challenges going on with their scoreboard (a dot a
 * day, green when done), the ones over with who won, and a new one: what to do every day, for how long, with whom.
 */
@Component({
  selector: 'app-challenges',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, BackButtonComponent, AvatarImgComponent, HapticDirective],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'friends.challenges.title' | t }}</h1>
      </header>
      <p class="small muted">{{ 'friends.challenges.intro' | t }}</p>
      <span class="haptic block">
        <button type="button" class="btn btn-primary btn-block" (click)="openNew()"><app-icon name="trophy" /> {{ 'friends.challenges.start' | t }}</button><input appHaptic="success" />
      </span>

      @if (list(); as all) {
        @if (invitations().length) {
          <h2 class="section-title">{{ 'friends.challenges.invitations' | t }}</h2>
          @for (c of invitations(); track c.id) {
            <section class="card ch invite">
              <div class="ch-head">
                <span class="ch-emoji" aria-hidden="true">{{ emoji[c.kind] }}</span>
                <div class="ch-copy">
                  <h3 class="h3">{{ 'friends.challenges.kinds.' + c.kind + '.title' | t }}</h3>
                  <p class="small muted">{{ 'friends.challenges.invitedBy' | t: { name: c.ownerName } }} · {{ 'friends.challenges.new.days' | t: { n: c.length } }}</p>
                </div>
              </div>
              <p class="small">{{ 'friends.challenges.kinds.' + c.kind + '.hint' | t }}</p>
              <div class="faces" aria-hidden="true">
                @for (m of c.members; track m.id) {
                  <span class="avatar face"><app-avatar-img [src]="m.avatarUrl" [name]="m.name" [size]="28" /></span>
                }
              </div>
              <div class="row-btns">
                <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="respond(c, false)">{{ 'friends.challenges.decline' | t }}</button>
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="respond(c, true)"><app-icon name="check" /> {{ 'friends.challenges.join' | t }}</button>
              </div>
            </section>
          }
        }

        @for (group of groups(); track group.key) {
          @if (group.list.length) {
            <h2 class="section-title">{{ 'friends.challenges.' + group.key | t }}</h2>
            @for (c of group.list; track c.id) {
              <section class="card ch" [class.over]="c.ended">
                <div class="ch-head">
                  <span class="ch-emoji" aria-hidden="true">{{ emoji[c.kind] }}</span>
                  <div class="ch-copy">
                    <h3 class="h3">{{ 'friends.challenges.kinds.' + c.kind + '.title' | t }}</h3>
                    <p class="small muted">
                      @if (c.ended) {
                        {{ 'friends.challenges.dates' | t: { from: date(c.startDay), to: date(c.endDay) } }}
                      } @else {
                        {{ day(c) }} · {{ 'friends.challenges.kinds.' + c.kind + '.hint' | t }}
                      }
                    </p>
                  </div>
                </div>
                @if (standing(c); as s) {
                  <p class="standing" [class.won]="c.ended">{{ c.ended ? '🏆 ' : '' }}{{ s }}</p>
                }
                <ol class="board" role="list">
                  @for (m of c.members; track m.id) {
                    <li class="member" [class.me]="m.me" [class.pending]="m.status === 'INVITED'">
                      <span class="rank" aria-hidden="true">{{ m.status === 'JOINED' ? (c.ended && m.rank <= 3 ? medals[m.rank - 1] : m.rank) : '·' }}</span>
                      <span class="avatar face"><app-avatar-img [src]="m.avatarUrl" [name]="m.name" [size]="32" /></span>
                      <span class="who">
                        <b>{{ m.name }}@if (m.me) { <span class="muted"> ({{ 'friends.challenges.you' | t }})</span>}</b>
                        @if (m.status === 'JOINED') {
                          <span class="dots" role="img" [attr.aria-label]="'friends.challenges.score' | t: { done: m.done, total: c.length }">
                            @for (d of slots(c); track $index; let i = $index) {
                              <i [class.done]="m.days[i]" [class.today]="!c.ended && i === c.elapsed - 1" [class.later]="i >= c.elapsed"></i>
                            }
                          </span>
                        } @else {
                          <span class="tiny muted">{{ 'friends.challenges.pending' | t }}</span>
                        }
                      </span>
                      @if (m.status === 'JOINED') {
                        <span class="score num">{{ m.done }}<small>/{{ c.length }}</small></span>
                      }
                    </li>
                  }
                </ol>
                @if (!c.ended) {
                  <!-- two taps: a slip of the finger does not stop it for everyone -->
                  <button type="button" class="btn btn-ghost btn-s quit" [class.armed]="armed() === c.id" [disabled]="busy()" (click)="leave(c)">
                    {{ (armed() === c.id ? 'friends.challenges.confirm' : c.owner ? 'friends.challenges.stop' : 'friends.challenges.leave') | t }}
                  </button>
                }
              </section>
            }
          }
        }

        @if (!all.length) {
          <div class="empty">
            <span class="empty-icon"><app-icon name="trophy" /></span>
            <p class="small">{{ 'friends.challenges.empty' | t }}</p>
          </div>
        }
      } @else {
        <div class="skeleton" style="height: 180px; border-radius: 24px"></div>
      }

      <!-- a new challenge: what, how long, with whom -->
      <dialog class="sheet" #newDialog [attr.aria-label]="'friends.challenges.new.title' | t">
        <div class="sheet-grip"></div>
        <div class="stack">
          <h2 class="h3">{{ 'friends.challenges.new.title' | t }}</h2>
          <span class="label" id="ch-what">{{ 'friends.challenges.new.what' | t }}</span>
          <div class="kinds" role="radiogroup" aria-labelledby="ch-what">
            @for (k of kinds; track k) {
              <button type="button" role="radio" class="kind" [attr.aria-checked]="kind() === k" (click)="kind.set(k)">
                <span class="kind-emoji" aria-hidden="true">{{ emoji[k] }}</span>
                <b>{{ 'friends.challenges.kinds.' + k + '.title' | t }}</b>
                <span class="tiny muted">{{ 'friends.challenges.kinds.' + k + '.hint' | t }}</span>
              </button>
            }
          </div>
          <span class="label" id="ch-length">{{ 'friends.challenges.new.length' | t }}</span>
          <div class="seg" role="radiogroup" aria-labelledby="ch-length">
            @for (n of lengths; track n) {
              <button type="button" role="radio" [attr.aria-checked]="days() === n" (click)="days.set(n)">{{ 'friends.challenges.new.days' | t: { n: n } }}</button>
            }
          </div>
          <span class="label" id="ch-with">{{ 'friends.challenges.new.with' | t }}</span>
          @if (friends(); as fs) {
            @if (fs.length) {
              <div class="pick" role="group" aria-labelledby="ch-with">
                @for (f of fs; track f.id) {
                  <button type="button" class="friend" [attr.aria-pressed]="picked().has(f.id)" (click)="toggle(f.id)">
                    <span class="avatar face"><app-avatar-img [src]="f.avatarUrl" [name]="f.name" [size]="32" /></span>
                    <span>{{ f.name }}</span>
                    @if (picked().has(f.id)) {
                      <app-icon name="check" [size]="16" [stroke]="2.6" />
                    }
                  </button>
                }
              </div>
            } @else {
              <p class="small muted">{{ 'friends.challenges.new.noFriends' | t }}</p>
              <a class="btn btn-secondary btn-block" routerLink="/app/friends" (click)="closeNew()"><app-icon name="userPlus" /> {{ 'friends.invite' | t }}</a>
            }
          } @else {
            <div class="skeleton" style="height: 48px; border-radius: 16px"></div>
          }
          <p class="tiny muted">{{ 'friends.challenges.new.note' | t }}</p>
          <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || !picked().size" (click)="create()">
            <app-icon name="trophy" /> {{ 'friends.challenges.new.create' | t }}
          </button>
        </div>
      </dialog>
    </main>
  `,
  styles: `
    .ch {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .ch.invite {
      border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
    }
    .ch-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .ch-emoji {
      display: grid;
      place-items: center;
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 16px;
      background: var(--accent-soft);
      font-size: 1.6rem;
    }
    .ch-copy {
      display: grid;
      min-width: 0;
    }
    .ch-copy .h3,
    .ch-copy p {
      margin: 0;
    }
    .standing {
      margin: 0;
      font-weight: 750;
      color: var(--accent-text);
    }
    .standing.won {
      color: var(--success, #1f9d55);
    }
    .faces {
      display: flex;
    }
    .face {
      width: 32px;
      height: 32px;
      flex: none;
      font-size: 0.85rem;
    }
    .faces .face {
      width: 28px;
      height: 28px;
      margin-right: -6px;
      box-shadow: 0 0 0 2px var(--surface);
    }
    .row-btns {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: var(--space-2);
    }
    .board {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .member {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 6px 8px;
      border-radius: var(--radius-m);
    }
    .member.me {
      background: var(--accent-soft);
    }
    .member.pending {
      opacity: 0.7;
    }
    .rank {
      flex: none;
      width: 24px;
      text-align: center;
      font-weight: 800;
      color: var(--fg-2);
    }
    .who {
      display: grid;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .who b {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dots {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
    }
    .dots i {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--surface-3);
    }
    .dots i.done {
      background: var(--success, #1f9d55);
      animation: dot 360ms var(--ease-out) both;
    }
    .dots i.today:not(.done) {
      box-shadow: inset 0 0 0 1.5px var(--accent);
      background: transparent;
    }
    .dots i.later {
      background: transparent;
      box-shadow: inset 0 0 0 1.5px var(--line-strong);
    }
    @keyframes dot {
      from {
        transform: scale(0.3);
      }
    }
    .score {
      flex: none;
      font-weight: 850;
      font-size: 1.1rem;
    }
    .score small {
      color: var(--fg-2);
      font-weight: 650;
      font-size: 0.8rem;
    }
    .quit {
      justify-self: start;
      color: var(--fg-2);
    }
    .quit.armed {
      color: var(--danger);
    }
    .kinds {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }
    .kind {
      display: grid;
      gap: 2px;
      align-content: start;
      padding: 12px;
      border-radius: var(--radius-m);
      border: 1px solid var(--line);
      background: var(--surface);
      text-align: left;
      color: inherit;
      transition:
        border-color var(--dur-2),
        background-color var(--dur-2);
    }
    .kind[aria-checked='true'] {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .kind-emoji {
      font-size: 1.4rem;
    }
    .pick {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .friend {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px 4px 4px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--line-strong);
      background: var(--surface);
      color: inherit;
      font-weight: 650;
    }
    .friend[aria-pressed='true'] {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    @media (prefers-reduced-motion: reduce) {
      .dots i.done {
        animation: none;
      }
    }
  `,
})
export class ChallengesPage {
  private readonly api = inject(FriendsApi);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  private readonly newDialog = viewChild.required<ElementRef<HTMLDialogElement>>('newDialog');

  protected readonly emoji = CHALLENGE_EMOJI;
  protected readonly medals = MEDALS;
  protected readonly kinds = KINDS;
  protected readonly lengths = LENGTHS;
  protected readonly list = signal<Challenge[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly invitations = computed(() => (this.list() ?? []).filter((c) => c.myStatus === 'INVITED' && !c.ended));
  protected readonly groups = computed(() => {
    const mine = (this.list() ?? []).filter((c) => c.myStatus === 'JOINED');
    return [
      { key: 'current', list: mine.filter((c) => !c.ended) },
      { key: 'ended', list: mine.filter((c) => c.ended) },
    ];
  });

  // the new challenge
  protected readonly kind = signal<ChallengeKind>('WEIGH');
  protected readonly days = signal(7);
  protected readonly friends = signal<Friend[] | null>(null);
  protected readonly picked = signal<Set<string>>(new Set());

  constructor() {
    // 1.16: what is done here (a challenge joined, a friend added) shows on Today on the way back
    inject(FriendsStore).stale();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.list.set(await this.api.challenges());
    } catch {
      this.list.set(this.list() ?? []);
    }
  }

  protected day(c: Challenge): string {
    return challengeDay(c, this.i18n);
  }

  protected standing(c: Challenge): string {
    return challengeStanding(c, this.i18n);
  }

  protected date(d: string): string {
    return this.i18n.date(d, { day: 'numeric', month: 'long' });
  }

  /** every day of the challenge, the ones to come too */
  protected slots(c: Challenge): number[] {
    return Array.from({ length: c.length }, (_, i) => i);
  }

  protected openNew(): void {
    this.picked.set(new Set());
    this.newDialog().nativeElement.showModal();
    this.api
      .list()
      .then((v) => this.friends.set(v.friends))
      .catch(() => this.friends.set([]));
  }

  protected closeNew(): void {
    closeSheet(this.newDialog().nativeElement);
  }

  protected toggle(id: string): void {
    this.picked.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      const c = await this.api.createChallenge(this.kind(), this.days(), [...this.picked()]);
      this.list.update((l) => [c, ...(l ?? [])]);
      this.closeNew();
      this.toast.show(this.i18n.t('friends.challenges.new.created'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async respond(c: Challenge, join: boolean): Promise<void> {
    this.busy.set(true);
    try {
      if (join) {
        const next = await this.api.respondChallenge(c.id, true);
        this.list.update((l) => (l ?? []).map((x) => (x.id === c.id ? next : x)));
        this.toast.show(this.i18n.t('friends.challenges.joined'));
      } else {
        await this.api.respondChallenge(c.id, false);
        this.list.update((l) => (l ?? []).filter((x) => x.id !== c.id));
        this.toast.show(this.i18n.t('friends.challenges.declined'));
      }
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  /** the challenge whose « stop » was tapped once, for a few seconds */
  protected readonly armed = signal<string | null>(null);
  private armTimer: ReturnType<typeof setTimeout> | null = null;

  protected async leave(c: Challenge): Promise<void> {
    if (this.armed() !== c.id) {
      this.armed.set(c.id);
      if (this.armTimer) clearTimeout(this.armTimer);
      this.armTimer = setTimeout(() => this.armed.set(null), 4000);
      return;
    }
    this.armed.set(null);
    this.busy.set(true);
    try {
      await this.api.leaveChallenge(c.id);
      this.list.update((l) => (l ?? []).filter((x) => x.id !== c.id));
      this.toast.show(this.i18n.t(c.owner ? 'friends.challenges.stopped' : 'friends.challenges.left'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
