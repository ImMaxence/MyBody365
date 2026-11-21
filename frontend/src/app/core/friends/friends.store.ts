import { Injectable, inject, signal } from '@angular/core';
import { SessionStore } from '../auth/session.store';
import { FRESH_MS, forget, fresh, keep, kept } from '../api/kept';
import { readPref } from '../ui/device-prefs';
import { localDay } from '../tracking/tracking.store';
import { Challenge, Friend, FriendsApi, POSTS_SEEN_KEY } from './friends-api';

const KEY = 'mb.friendsToday';

interface Seen {
  friends: Friend[] | null;
  challenges: Challenge[];
  /** when the friends' news were shared (to count those newer than the last visit of their screen) */
  posts: string[];
}

/**
 * 1.16: what Today shows of the friends (their line, the challenge going on, the news): it was fetched again at each
 * return to the tab, the line and the challenge showing up late each time. Now the last seen show at once (kept on the
 * phone for the day, for the next start too) and are asked again when older than FRESH_MS; a visit of the friends'
 * screens makes them stale (a challenge joined there shows on the way back).
 */
@Injectable({ providedIn: 'root' })
export class FriendsStore {
  private readonly api = inject(FriendsApi);
  private readonly session = inject(SessionStore);

  /** null: not known yet */
  readonly friends = signal<Friend[] | null>(null);
  readonly challenges = signal<Challenge[]>([]);
  private readonly posts = signal<string[]>([]);
  private at = 0;
  private loading: Promise<void> | null = null;

  /** the news shared since the friends' screen was last opened on this phone */
  newPosts(): number {
    const seen = Date.parse(readPref(POSTS_SEEN_KEY) ?? '') || 0;
    return this.posts().filter((p) => Date.parse(p) > seen).length;
  }

  /** the last seen at once, the server's when they are older than FRESH_MS */
  ensure(maxAge = FRESH_MS): Promise<void> {
    if (this.friends() === null) this.restore();
    if (fresh(this.at, maxAge)) return Promise.resolve();
    return (this.loading ??= this.fetch().finally(() => (this.loading = null)));
  }

  /** asked again at the next ensure (a visit of the friends' screens) */
  stale(): void {
    this.at = 0;
  }

  clear(): void {
    this.at = 0;
    this.friends.set(null);
    this.challenges.set([]);
    this.posts.set([]);
    forget(KEY);
  }

  private async fetch(): Promise<void> {
    const day = localDay();
    const [friends, challenges, posts] = await Promise.all([
      this.api
        .list()
        .then((v) => v.friends)
        .catch(() => null),
      this.api.challenges().catch(() => null),
      this.api.friendsPosts().catch(() => null),
    ]);
    if (friends) this.friends.set(friends);
    if (challenges) this.challenges.set(challenges);
    if (posts) this.posts.set(posts.map((p) => p.createdAt));
    if (friends && challenges && posts) {
      this.at = Date.now();
      keep<Seen>(KEY, this.session.account()?.id, day, { friends, challenges, posts: this.posts() });
    }
  }

  private restore(): void {
    const k = kept<Seen>(KEY, this.session.account()?.id, localDay());
    if (!k) return;
    this.friends.set(k.friends);
    this.challenges.set(k.challenges ?? []);
    this.posts.set(k.posts ?? []);
  }
}
