import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';
import { BackButtonComponent } from '../../shared/back-button.component';

/** "Request access" (newcomers) and "recover my account" (lost access): both reach the admins. */
@Component({
  selector: 'app-request',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page no-tabs">
      <header class="page-head">
        <app-back-button />
      </header>

      @if (sent()) {
        <section class="done card stack">
          <span class="badge"><app-icon name="check" /></span>
          <h1 class="h3">{{ 'request.sentTitle' | t }}</h1>
          <p class="muted">{{ 'request.sentText' | t }}</p>
          <a routerLink="/app/login" class="btn btn-secondary btn-block">{{ 'request.backToLogin' | t }}</a>
        </section>
      } @else {
        <div class="stack intro">
          <h1 class="display title">{{ (lost() ? 'request.lostTitle' : 'request.newTitle') | t }}</h1>
          <p class="muted">{{ (lost() ? 'request.lostText' : 'request.newText') | t }}</p>
        </div>

        <form class="stack" (ngSubmit)="submit()" #f="ngForm">
          <div class="field">
            <label for="rq-email">{{ 'request.email' | t }}</label>
            <input id="rq-email" class="input" type="email" name="email" autocomplete="email" inputmode="email" required maxlength="254" [(ngModel)]="email" />
          </div>
          <div class="field">
            <label for="rq-name">{{ 'request.name' | t }}</label>
            <input id="rq-name" class="input" type="text" name="name" autocomplete="given-name" required maxlength="80" [(ngModel)]="name" />
          </div>
          <div class="field">
            <label for="rq-msg">{{ 'request.message' | t }}</label>
            <textarea id="rq-msg" class="textarea" name="message" maxlength="500" [placeholder]="'request.messagePlaceholder' | t" [(ngModel)]="message"></textarea>
          </div>
          <!-- honeypot: invisible to people, filled by robots -->
          <div class="hp" aria-hidden="true">
            <label for="rq-website">Website</label>
            <input id="rq-website" type="text" name="website" tabindex="-1" autocomplete="off" [(ngModel)]="website" />
          </div>
          @if (!lost()) {
            <label class="check">
              <input type="checkbox" name="adult" required [(ngModel)]="adult" />
              <span>{{ 'request.adult' | t }}</span>
            </label>
          }
          @if (error()) {
            <p class="notice notice-danger" role="alert"><app-icon name="alert" /> {{ error() }}</p>
          }
          <button type="submit" class="btn btn-primary btn-block" [disabled]="busy() || f.invalid || (!lost() && !adult)">
            <app-icon name="mail" /> {{ 'request.send' | t }}
          </button>
        </form>
      }
    </main>
  `,
  styles: `
    .title {
      font-size: 2.2rem;
    }
    .intro {
      gap: var(--space-3);
    }
    .done {
      margin-top: var(--space-8);
      padding: var(--space-8) var(--space-6);
    }
    .badge {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: var(--success-soft);
      color: var(--success);
    }
    .hp {
      position: absolute;
      left: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
  `,
})
export class RequestPage {
  /** ?kind=lost for the recovery request */
  readonly kind = input<string>();

  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);

  protected readonly lost = computed(() => this.kind() === 'lost');
  protected email = '';
  protected name = '';
  protected message = '';
  protected website = '';
  protected adult = false;
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.requestAccess({
        email: this.email.trim(),
        name: this.name.trim(),
        message: this.message.trim() || undefined,
        kind: this.lost() ? 'LOST_ACCESS' : 'NEW_ACCESS',
        website: this.website || undefined,
      });
      this.sent.set(true);
    } catch (e) {
      this.error.set(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }
}
