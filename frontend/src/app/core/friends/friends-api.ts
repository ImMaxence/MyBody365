import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Pose, Recipe } from '../api/models';

export interface Friend {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  streak: number;
  todayDone: boolean;
  since: string;
  sharedWithMe: number;
  nudgedToday: boolean;
}

export interface SharedPhoto {
  id: string;
  day: string;
  pose: Pose;
  ownerId: string;
  ownerName: string;
  url: string;
  thumbUrl: string;
}

/** where I stand with a member found by username */
export type Relation = 'SELF' | 'FRIEND' | 'SENT' | 'RECEIVED' | 'NONE';

export interface Member {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  relation: Relation;
}

export interface FriendRequest {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  sentAt: string;
}

export interface FriendRequests {
  received: FriendRequest[];
  sent: FriendRequest[];
}

/** what a username can be: "@Lea.Fit" → "lea.fit", null when it cannot be one */
export function normalizeUsername(text: string): string | null {
  const u = text.trim().toLowerCase().replace(/^@/, '');
  return /^[a-z0-9._]{3,20}$/.test(u) ? u : null;
}

/** when the friends' news were last looked at, on this phone (the Today screen counts the newer ones) */
export const POSTS_SEEN_KEY = 'mb.postsSeen';

/** what a member shows their friends (1.9), a snapshot made by the server when shared */
export type PostKind = 'PROGRESS' | 'DAY' | 'MILESTONE';

export interface ProgressData {
  weights: boolean;
  startKg?: number | null;
  currentKg?: number | null;
  goalKg?: number | null;
  changeKg: number;
  losing: boolean;
  progressPct: number;
  reached: boolean;
  streak: number;
  days: number;
}

export interface DayData {
  kcal: number;
  targetKcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  lines: { slot: string; name: string; kcal: number; nutriscore?: string | null }[];
  more: number;
}

/** a milestone reached (its reward stays private) */
export interface MilestoneData {
  weights: boolean;
  targetKg?: number | null;
  changeKg: number;
  losing: boolean;
  reachedOn: string;
  reached: number;
  total: number;
  streak: number;
}

export interface Post {
  /** null: a preview, nothing saved */
  id: string | null;
  kind: PostKind;
  day: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl?: string };
  mine: boolean;
  data: ProgressData | DayData | MilestoneData;
  cheers: number;
  cheered: boolean;
}

/** a challenge between friends (1.9): something to do every day, read from what the app keeps */
export type ChallengeKind = 'WEIGH' | 'WATER' | 'MEALS' | 'PHOTO';
export const CHALLENGE_EMOJI: Record<ChallengeKind, string> = { WEIGH: '⚖️', WATER: '💧', MEALS: '🍽️', PHOTO: '📸' };

export interface ChallengeMember {
  id: string;
  name: string;
  avatarUrl?: string;
  status: 'INVITED' | 'JOINED' | 'DECLINED';
  me: boolean;
  /** days done so far, one flag a day from the start */
  done: number;
  days: boolean[];
  /** among the joined ones (ties share it); 0 for the invited */
  rank: number;
}

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  startDay: string;
  endDay: string;
  length: number;
  elapsed: number;
  ended: boolean;
  owner: boolean;
  ownerName: string;
  myStatus: 'INVITED' | 'JOINED' | 'DECLINED' | null;
  members: ChallengeMember[];
}

export interface FriendsView {
  friends: Friend[];
  sharedWithMe: SharedPhoto[];
}

export type ReportReason = 'INAPPROPRIATE' | 'ILLEGAL' | 'SPAM' | 'OTHER';

export interface Report {
  id: string;
  type: 'RECIPE' | 'PHOTO';
  targetId: string;
  reason: ReportReason;
  comment?: string;
  status: string;
  reporterName?: string;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  createdAt: string;
  title?: string;
  thumbUrl?: string;
  photoDay?: string;
}

export interface ModerationView {
  reports: Report[];
  recipes: Recipe[];
}

/** the token of a friend link (after the #), from the link itself or the bare token */
export function inviteToken(text: string): string | null {
  const t = text.trim();
  const fromUrl = /#([A-Za-z0-9_-]{20,64})\s*$/.exec(t);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{20,64}$/.test(t) ? t : null;
}

/** Friends, nudges, photo sharing and reports. */
@Injectable({ providedIn: 'root' })
export class FriendsApi {
  private readonly http = inject(HttpClient);

  list(): Promise<FriendsView> {
    return firstValueFrom(this.http.get<FriendsView>('/api/me/friends'));
  }

  invite(): Promise<{ url: string; expiresAt: string }> {
    return firstValueFrom(this.http.post<{ url: string; expiresAt: string }>('/api/me/friends/invite', null));
  }

  accept(token: string): Promise<Friend> {
    return firstValueFrom(this.http.post<Friend>('/api/me/friends/accept', { token }));
  }

  /** an exact username only (404 otherwise) */
  search(username: string): Promise<Member> {
    return firstValueFrom(this.http.get<Member>('/api/me/friends/search', { params: { username } }));
  }

  /** usernames starting with what was typed (3 characters at least) */
  suggest(q: string): Promise<Member[]> {
    return firstValueFrom(this.http.get<Member[]>('/api/me/friends/suggest', { params: { q } }));
  }

  requests(): Promise<FriendRequests> {
    return firstValueFrom(this.http.get<FriendRequests>('/api/me/friends/requests'));
  }

  /** SENT, or FRIEND when they had asked me already */
  request(username: string): Promise<{ relation: Relation }> {
    return firstValueFrom(this.http.post<{ relation: Relation }>('/api/me/friends/requests', { username }));
  }

  acceptRequest(id: string): Promise<Friend> {
    return firstValueFrom(this.http.post<Friend>(`/api/me/friends/requests/${id}/accept`, null));
  }

  /** declines a request received, or withdraws one sent */
  dropRequest(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/friends/requests/${id}`));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/friends/${id}`));
  }

  nudge(id: string): Promise<{ sent: number }> {
    return firstValueFrom(this.http.post<{ sent: number }>(`/api/me/friends/${id}/nudge`, null));
  }

  shares(photoId: string): Promise<string[]> {
    return firstValueFrom(this.http.get<string[]>(`/api/me/photos/${photoId}/shares`));
  }

  share(photoId: string, friendId: string): Promise<void> {
    return firstValueFrom(this.http.put<void>(`/api/me/photos/${photoId}/shares/${friendId}`, null));
  }

  unshare(photoId: string, friendId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/photos/${photoId}/shares/${friendId}`));
  }

  // ── shared with friends (1.9) ──────────────────────────────────────────────
  /** what my friends would see (preview), or shown to them for real */
  sharePost(kind: PostKind, opts: { weights?: boolean; day?: string; preview?: boolean; milestoneId?: string }): Promise<Post> {
    return firstValueFrom(this.http.post<Post>('/api/me/posts', { kind, ...opts }));
  }

  myPosts(): Promise<Post[]> {
    return firstValueFrom(this.http.get<Post[]>('/api/me/posts'));
  }

  unsharePost(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/posts/${id}`));
  }

  friendsPosts(): Promise<Post[]> {
    return firstValueFrom(this.http.get<Post[]>('/api/friends/posts'));
  }

  cheer(id: string, on: boolean): Promise<Post> {
    const url = `/api/friends/posts/${id}/cheer`;
    return firstValueFrom(on ? this.http.put<Post>(url, null) : this.http.delete<Post>(url));
  }

  // ── challenges (1.9) ─────────────────────────────────────────────────────
  challenges(): Promise<Challenge[]> {
    return firstValueFrom(this.http.get<Challenge[]>('/api/me/challenges'));
  }

  createChallenge(kind: ChallengeKind, days: number, friends: string[]): Promise<Challenge> {
    return firstValueFrom(this.http.post<Challenge>('/api/me/challenges', { kind, days, friends }));
  }

  respondChallenge(id: string, join: boolean): Promise<Challenge> {
    return firstValueFrom(this.http.post<Challenge>(`/api/me/challenges/${id}/${join ? 'join' : 'decline'}`, null));
  }

  /** the owner stops it for everyone, a member leaves it */
  leaveChallenge(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/challenges/${id}`));
  }

  report(type: 'RECIPE' | 'PHOTO', targetId: string, reason: ReportReason, comment: string): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/reports', { type, targetId, reason, comment: comment || null }));
  }

  // ── admin ─────────────────────────────────────────────────────────────────
  moderation(): Promise<ModerationView> {
    return firstValueFrom(this.http.get<ModerationView>('/api/admin/moderation'));
  }

  dismiss(id: string): Promise<ModerationView> {
    return firstValueFrom(this.http.post<ModerationView>(`/api/admin/reports/${id}/dismiss`, null));
  }

  act(id: string): Promise<ModerationView> {
    return firstValueFrom(this.http.post<ModerationView>(`/api/admin/reports/${id}/act`, null));
  }

  setRecipeHidden(id: string, hidden: boolean): Promise<ModerationView> {
    return firstValueFrom(
      this.http.post<ModerationView>(`/api/admin/recipes/${id}/${hidden ? 'hide' : 'restore'}`, null),
    );
  }
}
