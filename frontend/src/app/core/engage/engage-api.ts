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
  /** a glass of water when the day is behind (needs the glasses of water on) */
  waterEnabled: boolean;
  /** a word when a new version of the app comes out */
  updatesEnabled: boolean;
  /** the summary of the week, on Sunday evening */
  weeklyEnabled: boolean;
  /** 1.11: the photo of the day at its own time, if not taken yet */
  photoEnabled: boolean;
  photoTime: string;
}

/** a change of phase of the workout timer, notified while the app is off screen */
export interface TimerAlert {
  /** ISO instant */
  at: string;
  phase: 'WORK' | 'REST' | 'DONE';
  round: number;
  total: number;
}

export interface NotificationSettings {
  publicKey: string;
  devices: number;
  prefs: NotificationPrefs;
}

/** a timer saved under a name: effort and rest in seconds, rounds */
export interface SavedTimer {
  id: string;
  name: string;
  work: number;
  rest: number;
  rounds: number;
}

/** Notifications (devices and reminders) and the saved timers. */
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


  timers(): Promise<SavedTimer[]> {
    return firstValueFrom(this.http.get<SavedTimer[]>('/api/me/timers'));
  }

  saveTimer(t: { name: string; work: number; rest: number; rounds: number }): Promise<SavedTimer[]> {
    return firstValueFrom(this.http.post<SavedTimer[]>('/api/me/timers', t));
  }

  deleteTimer(id: string): Promise<SavedTimer[]> {
    return firstValueFrom(this.http.delete<SavedTimer[]>(`/api/me/timers/${id}`));
  }

  /** the timer's coming changes of phase; keepalive: sent while the app leaves the screen */
  timerAlerts(alerts: TimerAlert[]): Promise<void> {
    return firstValueFrom(this.http.put<void>('/api/me/timer/alerts', { alerts }, { keepalive: true }));
  }

  cancelTimerAlerts(): Promise<void> {
    return firstValueFrom(this.http.delete<void>('/api/me/timer/alerts', { keepalive: true }));
  }
}
