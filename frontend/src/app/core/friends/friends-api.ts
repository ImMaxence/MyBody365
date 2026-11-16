import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Pose, Recipe } from '../api/models';

export interface Friend {
  id: string;
  name: string;
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
