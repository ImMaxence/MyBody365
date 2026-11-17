import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, Injectable, isDevMode } from '@angular/core';
import { CURRENT_VERSION } from '../../features/changelog/changelog.version';

/** at most this many reports per visit, each different error once */
const MAX_REPORTS = 10;

/**
 * Every error the app does not handle goes to the console, as before, and to the admins' error journal
 * (POST /api/errors): its message, the first lines of its trace, the screen it happened on and the app
 * version, nothing typed by the member. API errors are not sent again (the server keeps its own).
 */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  private readonly sent = new Set<string>();

  override handleError(error: unknown): void {
    super.handleError(error);
    try {
      this.report(error);
    } catch {
      /* reporting never adds an error of its own */
    }
  }

  private report(error: unknown): void {
    if (typeof window === 'undefined' || isDevMode()) return;
    const err = (error as { rejection?: unknown })?.rejection ?? error;
    if (err instanceof HttpErrorResponse) return;
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    if (this.sent.has(message) || this.sent.size >= MAX_REPORTS) return;
    this.sent.add(message);
    const detail = err instanceof Error && err.stack ? err.stack.split('\n').slice(0, 30).join('\n') : undefined;
    const xsrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1];
    void fetch('/api/errors', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}) },
      body: JSON.stringify({ message: message.slice(0, 4000), detail: detail?.slice(0, 40000), path: location.pathname.slice(0, 300), version: CURRENT_VERSION }),
    }).catch(() => undefined);
  }
}
