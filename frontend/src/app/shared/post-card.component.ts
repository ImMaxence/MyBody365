import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { DayData, MilestoneData, Post, ProgressData } from '../core/friends/friends-api';
import { I18nService } from '../core/i18n/i18n.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { HapticDirective } from '../core/ui/haptics';
import { AvatarImgComponent } from './avatar-img.component';
import { IconComponent } from './icon.component';
import { NutriscoreComponent } from './nutriscore.component';
import type { Grade } from '../core/api/models';

const SLOT_EMOJI: Record<string, string> = { BREAKFAST: '🥣', LUNCH: '🥗', DINNER: '🍲', SNACK: '🍎' };

/**
 * What a member showed their friends (1.9): their way to the goal, or a day of meals. The same card in the share sheet
 * (the preview) and in the friends' news, with « Bravo » for the friends.
 */
@Component({
  selector: 'app-post-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, AvatarImgComponent, NutriscoreComponent, HapticDirective],
  template: `
    @let p = post();
    <article class="post card" [class.progress]="p.kind === 'PROGRESS'">
      @if (withAuthor()) {
        <header class="who">
          <span class="avatar small"><app-avatar-img [src]="p.author.avatarUrl" [name]="p.author.name" [size]="36" /></span>
          <span class="who-copy">
            <b>{{ p.author.name }}</b>
            <span class="tiny muted">{{ 'friends.posts.by.' + p.kind | t }} · {{ when() }}</span>
          </span>
        </header>
      }

      @if (progress(); as d) {
        <div class="big">
          <span class="change num" [class.good]="good()">{{ change() }}</span>
          <span class="small muted">{{ 'friends.posts.since' | t: { n: d.days } }}</span>
        </div>
        @if (d.reached) {
          <p class="reached small"><app-icon name="trophy" [size]="16" /> {{ 'friends.posts.reached' | t }}</p>
        } @else {
          <div class="bar" role="img" [attr.aria-label]="'friends.posts.way' | t: { pct: d.progressPct }">
            <i [style.width.%]="d.progressPct"></i>
          </div>
          <p class="tiny muted way">{{ 'friends.posts.way' | t: { pct: d.progressPct } }}</p>
        }
        <div class="facts">
          @if (d.streak > 0) {
            <span class="chip chip-accent"><app-icon name="flame" [size]="14" /> {{ 'friends.posts.streak' | t: { n: d.streak } }}</span>
          }
          @if (d.weights && d.currentKg != null) {
            <span class="chip num">{{ i18n.number(d.startKg ?? 0, 1) }} → {{ i18n.number(d.currentKg, 1) }} kg</span>
            <span class="chip num"><app-icon name="target" [size]="14" /> {{ i18n.number(d.goalKg ?? 0, 1) }} kg</span>
          }
        </div>
      }

      @if (milestone(); as d) {
        <div class="medal-row">
          <span class="medal" aria-hidden="true">🏅</span>
          <div class="big">
            <span class="small"><b>{{ 'friends.posts.milestone' | t }}</b></span>
            <span class="change num" [class.good]="true">{{ d.weights && d.targetKg != null ? i18n.number(d.targetKg, d.targetKg % 1 ? 1 : 0) + ' kg' : signed(d.changeKg) }}</span>
          </div>
        </div>
        <div class="facts">
          @if (d.weights && d.targetKg != null) {
            <span class="chip num">{{ signed(d.changeKg) }}</span>
          }
          @if (d.total > 1) {
            <span class="chip">{{ 'friends.posts.milestoneOf' | t: { n: d.reached, total: d.total } }}</span>
          }
          @if (d.streak > 0) {
            <span class="chip chip-accent"><app-icon name="flame" [size]="14" /> {{ 'friends.posts.streak' | t: { n: d.streak } }}</span>
          }
        </div>
      }

      @if (day(); as d) {
        <div class="day-head">
          <b class="small">{{ i18n.date(p.day, { weekday: 'long', day: 'numeric', month: 'long' }) }}</b>
          <span class="num"><b>{{ i18n.number(d.kcal) }}</b> kcal @if (d.targetKcal) {<span class="muted">/ {{ i18n.number(d.targetKcal) }}</span>}</span>
        </div>
        <ul class="lines" role="list">
          @for (l of shownLines(); track $index) {
            <li>
              <span class="slot" aria-hidden="true">{{ slotEmoji(l.slot) }}</span>
              <span class="name">{{ l.name }}</span>
              @if (l.nutriscore) {
                <app-nutriscore [grade]="grade(l.nutriscore)" />
              }
              <span class="num muted">{{ i18n.number(l.kcal) }}</span>
            </li>
          }
        </ul>
        @if (hidden() > 0) {
          <p class="tiny muted">{{ 'friends.posts.more' | t: { n: hidden() } }}</p>
        }
        @if (d.proteinG != null) {
          <p class="tiny muted num">{{ 'meals.estimate.macros' | t: { p: d.proteinG, c: d.carbsG ?? 0, f: d.fatG ?? 0 } }}</p>
        }
      }

      @if (p.id && !p.mine) {
        <footer class="foot">
          <span class="haptic">
            <button type="button" class="cheer" [class.on]="p.cheered" [attr.aria-pressed]="p.cheered" (click)="cheer.emit(p)">
              <span aria-hidden="true">👏</span> {{ 'friends.posts.cheer' | t }}
              @if (p.cheers) {
                <b class="num">{{ p.cheers }}</b>
              }
            </button><input appHaptic="success" />
          </span>
        </footer>
      } @else if (p.id && p.mine && p.cheers) {
        <footer class="foot"><span class="small muted">👏 {{ 'friends.posts.cheers' | t: { n: p.cheers } }}</span></footer>
      }
    </article>
  `,
  styles: `
    .post {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
    }
    .post.progress {
      background:
        radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, var(--flame) 14%, transparent), transparent 60%),
        var(--surface);
    }
    .who {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .avatar.small {
      width: 36px;
      height: 36px;
      font-size: 0.95rem;
    }
    .who-copy {
      display: grid;
      min-width: 0;
    }
    .big {
      display: grid;
      gap: 2px;
    }
    .change {
      font-family: var(--font-display, inherit);
      font-size: 2.4rem;
      font-weight: 850;
      line-height: 1;
      letter-spacing: -0.02em;
    }
    .change.good {
      color: var(--success, #1f9d55);
    }
    .bar {
      height: 10px;
      border-radius: 5px;
      background: var(--surface-3);
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 5px;
      background: var(--flame);
      animation: grow 900ms var(--ease-out) both;
      transform-origin: left;
    }
    @keyframes grow {
      from {
        transform: scaleX(0);
      }
    }
    .way {
      margin: -6px 0 0;
    }
    .reached {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--success, #1f9d55);
      font-weight: 700;
    }
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .medal-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .medal {
      font-size: 2.8rem;
      line-height: 1;
      animation: medal 600ms var(--ease-out) both;
    }
    @keyframes medal {
      from {
        transform: scale(0.5) rotate(-15deg);
        opacity: 0;
      }
    }
    .day-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .day-head b.small::first-letter {
      text-transform: uppercase;
    }
    .lines {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .lines li {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--fs-s);
    }
    .lines .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lines app-nutriscore {
      width: 40px;
    }
    .foot {
      display: flex;
      justify-content: flex-start;
    }
    .cheer {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 14px;
      border-radius: var(--radius-pill);
      background: var(--surface-3);
      font-weight: 700;
      font-size: var(--fs-s);
      transition:
        background-color var(--dur-2),
        color var(--dur-2),
        transform var(--dur-1) var(--ease-out);
    }
    .cheer.on {
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .cheer.on span {
      animation: clap 480ms var(--ease-out);
    }
    @keyframes clap {
      35% {
        transform: scale(1.35) rotate(-12deg);
      }
    }
  `,
})
export class PostCardComponent {
  readonly post = input.required<Post>();
  readonly withAuthor = input(true);
  readonly cheer = output<Post>();
  protected readonly i18n = inject(I18nService);

  protected readonly progress = computed(() => (this.post().kind === 'PROGRESS' ? (this.post().data as ProgressData) : null));
  protected readonly day = computed(() => (this.post().kind === 'DAY' ? (this.post().data as DayData) : null));
  protected readonly milestone = computed(() => (this.post().kind === 'MILESTONE' ? (this.post().data as MilestoneData) : null));

  /** « −5 kg », « +2 kg » */
  protected signed(v: number): string {
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${this.i18n.number(Math.abs(v), v % 1 ? 1 : 0)} kg`;
  }
  protected readonly shownLines = computed(() => this.day()?.lines.slice(0, 8) ?? []);
  protected readonly hidden = computed(() => {
    const d = this.day();
    return d ? Math.max(0, d.lines.length - 8) + (d.more ?? 0) : 0;
  });
  /** going the way of the goal (down to lose, up to gain) */
  protected readonly good = computed(() => {
    const d = this.progress();
    return !!d && (d.losing ? d.changeKg < 0 : d.changeKg > 0);
  });
  /** « −4,2 kg », « +1,5 kg » */
  protected readonly change = computed(() => {
    const d = this.progress();
    if (!d) return '';
    const v = d.changeKg;
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${this.i18n.number(Math.abs(v), 1)} kg`;
  });
  /** « il y a 2 h »; never « dans… » when the phone's clock is a little behind the server's */
  protected readonly when = computed(() => {
    const at = Math.min(Date.parse(this.post().createdAt), Date.now());
    return this.i18n.relative(new Date(at).toISOString());
  });

  protected slotEmoji(slot: string): string {
    return SLOT_EMOJI[slot] ?? '🍽️';
  }

  protected grade(g: string): Grade {
    return g.toLowerCase() as Grade;
  }
}
