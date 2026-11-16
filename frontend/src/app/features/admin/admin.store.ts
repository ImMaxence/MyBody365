import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import type { AdminLink, AdminSummary } from '../../core/api/models';

/** State shared by the admin tabs: the counters, and the link to show once. */
@Injectable()
export class AdminStore {
  private readonly api = inject(ApiService);
  readonly summary = signal<AdminSummary | null>(null);
  readonly freshLink = signal<AdminLink | null>(null);

  async refreshSummary(): Promise<void> {
    try {
      this.summary.set(await this.api.adminSummary());
    } catch {
      /* counters are optional */
    }
  }
}
