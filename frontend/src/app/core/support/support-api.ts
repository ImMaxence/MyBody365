import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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
  readonly todo = signal<Todo | null>(null);
  readonly admin = computed(() => {
    const t = this.todo();
    return t ? t.adminRequests + t.adminFeedback + t.adminErrors : 0;
  });
  /** something waits in the profile */
  readonly profile = computed(() => {
    const t = this.todo();
    return !!t && (t.passkey || t.drive || this.admin() > 0);
  });

  async refresh(): Promise<void> {
    try {
      this.todo.set(await this.api.todo());
    } catch {
      /* the dots are a bonus */
    }
  }

  clear(): void {
    this.todo.set(null);
  }
}
