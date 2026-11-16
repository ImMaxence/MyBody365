import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface NotificationPrefs {
  dailyEnabled: boolean;
  dailyTime: string;
  gymEnabled: boolean;
  /** ISO days, "1,3,5" */
  gymDays: string;
  gymTime: string;
  friendsEnabled: boolean;
}

export interface NotificationSettings {
  publicKey: string;
  devices: number;
  prefs: NotificationPrefs;
}

/** Notifications: devices and reminders. */
@Injectable({ providedIn: 'root' })
export class EngageApi {
  private readonly http = inject(HttpClient);

  notifications(): Promise<NotificationSettings> {
    return firstValueFrom(this.http.get<NotificationSettings>('/api/me/notifications'));
  }

  savePrefs(prefs: NotificationPrefs): Promise<NotificationSettings> {
    return firstValueFrom(this.http.put<NotificationSettings>('/api/me/notifications', prefs));
  }

  subscribe(sub: PushSubscriptionJSON): Promise<NotificationSettings> {
    return firstValueFrom(this.http.post<NotificationSettings>('/api/me/push/subscriptions', sub));
  }

  unsubscribe(endpoint: string): Promise<NotificationSettings> {
    return firstValueFrom(this.http.delete<NotificationSettings>('/api/me/push/subscriptions', { body: { endpoint } }));
  }

  test(): Promise<{ sent: number }> {
    return firstValueFrom(this.http.post<{ sent: number }>('/api/me/push/test', null));
  }

}
