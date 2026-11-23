import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
  /** 1.20: its own icon (a line removed: the bin) */
  icon?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private next = 1;

  show(text: string, kind: Toast['kind'] = 'info', ms = 3200, action?: Toast['action'], icon?: string): void {
    const id = this.next++;
    this.toasts.update((list) => [...list.slice(-2), { id, text, kind, action, icon }]);
    if (ms > 0) setTimeout(() => this.dismiss(id), ms);
  }

  error(text: string): void {
    this.show(text, 'error', 4800);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
