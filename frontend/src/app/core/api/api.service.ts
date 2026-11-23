import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { isOffline } from '../offline/outbox';
import type {
  MacroSplit,
  AccessRequestInput,
  Account,
  AdminLink,
  AdminRequest,
  AdminSummary,
  AdminUser,
  AuditLine,
  BodyLogEntry,
  Decision,
  LogInput,
  ProfileInput,
  Summary,
  LinkKind,
  Me,
  Photo,
  Pose,
  StorageUsage,
  Providers,
  SecurityInfo,
  Milestone,
  MilestoneInput,
} from './models';

/** The stable code of an API error ("link_used", "rate_limited"…), "offline" or "generic". */
export function errorCode(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    // 1.18: also the empty 504 the service worker answers with when the network is away
    if (e.status === 0 || isOffline(e)) return 'offline';
    if (e.status === 429) return 'rate_limited';
    const code = (e.error as { message?: unknown } | null)?.message;
    if (typeof code === 'string' && /^[a-z_]+$/.test(code)) return code;
    if (e.status === 401) return 'unauthenticated';
  }
  if (e instanceof Error && /^[a-z_]+$/.test(e.message)) return e.message;
  return 'generic';
}

/** Thin, typed wrapper over the REST API (same origin, CSRF header added by Angular). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private get<T>(url: string, params?: Record<string, string | number>): Promise<T> {
    return firstValueFrom(this.http.get<T>(url, { params }));
  }

  private post<T>(url: string, body: unknown = null): Promise<T> {
    return firstValueFrom(this.http.post<T>(url, body));
  }

  // ── auth ──────────────────────────────────────────────────────────────────
  me(): Promise<Me> {
    return this.get('/api/auth/me');
  }

  providers(): Promise<Providers> {
    return this.get('/api/auth/providers');
  }

  logout(): Promise<void> {
    return this.post('/api/auth/logout');
  }

  requestAccess(input: AccessRequestInput): Promise<void> {
    return this.post('/api/access-requests', input);
  }

  redeemLink(token: string): Promise<{ kind: LinkKind; account: Account }> {
    return this.post('/api/auth/links/redeem', { token });
  }

  // ── me ────────────────────────────────────────────────────────────────────
  setUsername(username: string): Promise<Account> {
    return firstValueFrom(this.http.put<Account>('/api/me/username', { username }));
  }

  /** a picture of one's own (the server crops it square and re-encodes it) */
  setAvatar(file: Blob): Promise<Account> {
    const form = new FormData();
    form.append('file', file, 'avatar.jpg');
    return firstValueFrom(this.http.post<Account>('/api/me/avatar', form));
  }

  removeAvatar(): Promise<Account> {
    return firstValueFrom(this.http.delete<Account>('/api/me/avatar'));
  }

  /** glasses of water of a day (and the goal) */
  water(day: string): Promise<{ day: string; glasses: number; goal?: number }> {
    return firstValueFrom(this.http.get<{ day: string; glasses: number; goal?: number }>(`/api/me/water/${day}`));
  }

  setWater(day: string, glasses: number): Promise<{ day: string; glasses: number; goal?: number }> {
    return firstValueFrom(this.http.put<{ day: string; glasses: number; goal?: number }>(`/api/me/water/${day}`, { glasses }));
  }

  // ── milestones (1.8) ───────────────────────────────────────────────────────
  milestones(): Promise<Milestone[]> {
    return this.get('/api/me/milestones');
  }

  addMilestone(input: MilestoneInput): Promise<Milestone[]> {
    return this.post('/api/me/milestones', input);
  }

  updateMilestone(id: string, input: MilestoneInput): Promise<Milestone[]> {
    return firstValueFrom(this.http.put<Milestone[]>(`/api/me/milestones/${id}`, input));
  }

  deleteMilestone(id: string): Promise<Milestone[]> {
    return firstValueFrom(this.http.delete<Milestone[]>(`/api/me/milestones/${id}`));
  }

  /** waterGoal 0 turns the water tracker off */
  updateMe(patch: { displayName?: string; locale?: 'fr' | 'en'; deviceLocale?: 'fr' | 'en'; discoverable?: boolean; waterGoal?: number; streakIcon?: string; streakColor?: string; bpEnabled?: boolean; pillsEnabled?: boolean }): Promise<Account> {
    return firstValueFrom(this.http.patch<Account>('/api/me', patch));
  }

  consent(): Promise<Account> {
    return this.post('/api/me/consent', { adult: true, health: true });
  }

  security(): Promise<SecurityInfo> {
    return this.get('/api/me/security');
  }

  deletePasskey(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/passkeys/${encodeURIComponent(id)}`));
  }

  deleteAccount(confirmEmail: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>('/api/me', { body: { confirmEmail } }));
  }

  // ── tracking ──────────────────────────────────────────────────────────────
  summary(): Promise<Summary> {
    return this.get('/api/me/summary');
  }

  saveProfile(input: ProfileInput): Promise<Summary> {
    return firstValueFrom(this.http.put<Summary>('/api/me/profile', input));
  }

  /** the target from the real needs (meals and weigh-ins of the last weeks), or from the formula */
  setAdaptive(on: boolean): Promise<Summary> {
    return firstValueFrom(this.http.put<Summary>('/api/me/profile/adaptive', { on }));
  }

  /** the split of the macros: balanced, more protein, fewer carbohydrates */
  setMacroSplit(split: MacroSplit): Promise<Summary> {
    return firstValueFrom(this.http.put<Summary>('/api/me/profile/macros', { split }));
  }

  logs(): Promise<BodyLogEntry[]> {
    return this.get('/api/me/logs');
  }

  saveLog(day: string, input: LogInput): Promise<Summary> {
    return firstValueFrom(this.http.put<Summary>(`/api/me/logs/${day}`, input));
  }

  /** the optional evening weigh-in of a day; null takes it off (1.9) */
  saveEvening(day: string, weightKg: number | null): Promise<Summary> {
    const url = `/api/me/logs/${day}/evening`;
    return firstValueFrom(weightKg == null ? this.http.delete<Summary>(url) : this.http.put<Summary>(url, { weightKg }));
  }

  deleteLog(day: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/logs/${day}`));
  }

  // ── photos ────────────────────────────────────────────────────────────────
  photos(): Promise<Photo[]> {
    return this.get('/api/me/photos');
  }

  uploadPhoto(file: Blob, day: string, pose: Pose): Promise<Photo> {
    const form = new FormData();
    form.append('file', file, file.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
    form.append('day', day);
    form.append('pose', pose);
    return this.post('/api/me/photos', form);
  }

  /** 1.16: a photo touched up on the phone, in place of the old one (a new id, the same day, pose and shares) */
  replacePhoto(id: string, file: Blob): Promise<Photo> {
    const form = new FormData();
    form.append('file', file, file.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
    return this.post(`/api/me/photos/${id}/image`, form);
  }

  deletePhoto(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/me/photos/${id}`));
  }

  storage(): Promise<StorageUsage> {
    return this.get('/api/me/storage');
  }

  // ── admin ─────────────────────────────────────────────────────────────────
  adminSummary(): Promise<AdminSummary> {
    return this.get('/api/admin/summary');
  }

  adminUsers(): Promise<AdminUser[]> {
    return this.get('/api/admin/users');
  }

  adminCreateUser(email: string, displayName: string): Promise<{ user: AdminUser; link: AdminLink }> {
    return this.post('/api/admin/users', { email, displayName });
  }

  adminUpdateUser(id: string, patch: { role?: 'USER' | 'ADMIN'; status?: 'ACTIVE' | 'SUSPENDED'; storageQuotaMb?: number }): Promise<AdminUser> {
    return firstValueFrom(this.http.patch<AdminUser>(`/api/admin/users/${id}`, patch));
  }

  adminDeleteUser(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/admin/users/${id}`));
  }

  adminEndSessions(id: string): Promise<{ ended: number }> {
    return this.post(`/api/admin/users/${id}/sessions/end`);
  }

  adminCreateLink(id: string, kind: LinkKind): Promise<AdminLink> {
    return this.post(`/api/admin/users/${id}/links`, { kind });
  }

  adminLinks(): Promise<AdminLink[]> {
    return this.get('/api/admin/links');
  }

  adminRevokeLink(id: string): Promise<AdminLink> {
    return firstValueFrom(this.http.delete<AdminLink>(`/api/admin/links/${id}`));
  }

  adminRequests(status: 'PENDING' | 'DECIDED' = 'PENDING'): Promise<AdminRequest[]> {
    return this.get('/api/admin/access-requests', { status });
  }

  adminApprove(id: string): Promise<Decision> {
    return this.post(`/api/admin/access-requests/${id}/approve`);
  }

  adminReject(id: string): Promise<AdminRequest> {
    return this.post(`/api/admin/access-requests/${id}/reject`);
  }

  adminAudit(before?: number): Promise<AuditLine[]> {
    return this.get('/api/admin/audit', before ? { before, limit: 50 } : { limit: 50 });
  }
}
