import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { fresh } from '../api/kept';
import { AppUpdate } from '../pwa/app-update';

export type FeedbackKind = 'IDEA' | 'BUG' | 'OTHER';

export interface Feedback {
  id: string;
  kind: FeedbackKind;
  message: string;
  userName?: string;
  userEmail?: string;
  appVersion?: string;
  device?: string;
  createdAt: string;
  archivedAt?: string;
}

export interface ErrorEntry {
  id: string;
  source: 'APP' | 'SERVER';
  message: string;
  detail?: string;
  path?: string;
  appVersion?: string;
  device?: string;
  userName?: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  archivedAt?: string;
}

/** what is waiting for the member (the red dots) */
export interface Todo {
  passkey: boolean;
  drive: boolean;
  adminRequests: number;
  adminFeedback: number;
  adminErrors: number;
  /** 1.12: what waits in the other tabs */
  friendRequests: number;
  challengeInvites: number;
  shoppingLeft: number;
  photoToday: boolean;
  /** 1.17: the notifications not seen yet in the notification centre */
  notifications?: number;
}

/** A word to the creator, the errors journal and the admins' lists of both. */
@Injectable({ providedIn: 'root' })
export class SupportApi {
  private readonly http = inject(HttpClient);

  sendFeedback(kind: FeedbackKind, message: string, version: string): Promise<void> {
    return firstValueFrom(this.http.post<void>('/api/me/feedback', { kind, message, version }));
  }

  feedback(archived = false): Promise<Feedback[]> {
    return firstValueFrom(this.http.get<Feedback[]>('/api/admin/feedback', { params: { archived } }));
  }

  archiveFeedback(id: string): Promise<Feedback[]> {
    return firstValueFrom(this.http.post<Feedback[]>(`/api/admin/feedback/${id}/archive`, null));
  }

  errors(archived = false): Promise<ErrorEntry[]> {
    return firstValueFrom(this.http.get<ErrorEntry[]>('/api/admin/errors', { params: { archived } }));
  }

  archiveError(id: string): Promise<ErrorEntry[]> {
    return firstValueFrom(this.http.post<ErrorEntry[]>(`/api/admin/errors/${id}/archive`, null));
  }

  archiveAllErrors(): Promise<ErrorEntry[]> {
    return firstValueFrom(this.http.post<ErrorEntry[]>('/api/admin/errors/archive-all', null));
  }

  todo(): Promise<Todo> {
    return firstValueFrom(this.http.get<Todo>('/api/me/todo'));
  }
}

/** The red dots of the app: the profile tab, its rows, the admin tabs. Loaded at start and when the app comes back. */
@Injectable({ providedIn: 'root' })
export class TodoStore {
  private readonly api = inject(SupportApi);
  /** 1.20.2: a new version ready while the app stays open */
  private readonly update = inject(AppUpdate);
  readonly todo = signal<Todo | null>(null);
  readonly admin = computed(() => {
    const t = this.todo();
    return t ? t.adminRequests + t.adminFeedback + t.adminErrors : 0;
  });
  /** something waits in the profile (1.20.2: a new version to reload too) */
  readonly profile = computed(() => {
    const t = this.todo();
    return this.update.ready() || (!!t && (t.passkey || t.drive || this.admin() > 0));
  });

  /** 1.12: something to answer on Today (a friend request, a challenge invitation) */
  readonly today = computed(() => {
    const t = this.todo();
    return !!t && (t.friendRequests ?? 0) + (t.challengeInvites ?? 0) > 0;
  });
  /** the photo of the day not taken yet, by someone who takes them */
  readonly photos = computed(() => !!this.todo()?.photoToday);

  async refresh(): Promise<void> {
    try {
      this.todo.set(await this.api.todo());
      this.at = Date.now();
    } catch {
      /* the dots are a bonus */
    }
  }

  private at = 0;

  /** 1.17: asked again only when older than FRESH_MS (back on the Profile tab) */
  ensure(): Promise<void> {
    return this.todo() && fresh(this.at) ? Promise.resolve() : this.refresh();
  }

  clear(): void {
    this.todo.set(null);
    this.at = 0;
  }
}
