import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HabitsApi, ShareLink, ShareScope } from '../../core/api/habits-api';
import { errorCode } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SessionStore } from '../../core/auth/session.store';
import { ToastService } from '../../core/ui/toast.service';
import { BackButtonComponent } from '../../shared/back-button.component';
import { IconComponent } from '../../shared/icon.component';

const SCOPES: ShareScope[] = ['WEIGHT', 'MEALS', 'BP'];

/**
 * 1.19: « Partager avec un pro de santé »: a read-only link for a coach or a dietitian, made here: who it is for, what it
 * shows (the weigh-ins, the meals, the blood pressure; never the photos nor the pill box), 7 or 30 days. The link is shown
 * once (only its fingerprint is kept), to copy or send; each link says how many times it was opened, and goes in one tap.
 */
@Component({
  selector: 'app-share-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, BackButtonComponent],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <h1 class="title small-title">{{ 'shareLinks.title' | t }}</h1>
      </header>
      <p class="muted small">{{ 'shareLinks.text' | t }}</p>

      @if (made(); as m) {
        <section class="card made stack" aria-live="polite">
          <p class="small"><b>{{ 'shareLinks.madeTitle' | t }}</b></p>
          <p class="url num">{{ m }}</p>
          <div class="row">
            <button type="button" class="btn btn-primary grow" (click)="send(m)"><app-icon name="share" [size]="18" /> {{ 'shareLinks.send' | t }}</button>
            <button type="button" class="btn btn-secondary" (click)="copy(m)"><app-icon name="copy" [size]="18" /> {{ 'common.copy' | t }}</button>
          </div>
          <p class="tiny muted">{{ 'shareLinks.once' | t }}</p>
        </section>
      }

      <section class="card stack">
        <h2 class="h3">{{ 'shareLinks.new' | t }}</h2>
        <label class="field">
          <span class="label">{{ 'shareLinks.for' | t }}</span>
          <input class="input" maxlength="60" [placeholder]="'shareLinks.forPlaceholder' | t" [value]="label()" (input)="label.set($any($event.target).value)" />
        </label>
        <span class="label" id="sl-scopes">{{ 'shareLinks.what' | t }}</span>
        <div class="checks" role="group" aria-labelledby="sl-scopes">
          @for (s of scopes; track s) {
            <label class="check">
              <input type="checkbox" [checked]="chosen().includes(s)" (change)="toggle(s)" />
              <span>{{ 'shareLinks.scopes.' + s | t }}</span>
            </label>
          }
        </div>
        <span class="label" id="sl-days">{{ 'shareLinks.howLong' | t }}</span>
        <div class="chips" role="radiogroup" aria-labelledby="sl-days">
          @for (d of [7, 30]; track d) {
            <button type="button" class="chip-opt" role="radio" [attr.aria-checked]="days() === d" (click)="days.set(d)">{{ 'shareLinks.days' | t: { n: d } }}</button>
          }
        </div>
        <p class="tiny muted">{{ 'shareLinks.never' | t }}</p>
        <button type="button" class="btn btn-primary btn-block" [disabled]="busy() || !chosen().length" (click)="create()">
          <app-icon name="link" [size]="18" /> {{ 'shareLinks.make' | t }}
        </button>
      </section>

      @if (links(); as list) {
        @if (list.length) {
          <h2 class="section-title">{{ 'shareLinks.yours' | t }}</h2>
          <div class="list">
            @for (l of list; track l.id) {
              <div class="list-item link" [class.off]="!l.active">
                <span class="list-icon"><app-icon [name]="l.active ? 'link' : 'lock'" /></span>
                <span class="list-body">
                  <span class="list-title">{{ l.label || ('shareLinks.noName' | t) }}</span>
                  <span class="list-sub wrap">{{ lineOf(l) }}</span>
                </span>
                @if (l.active) {
                  <button type="button" class="btn btn-ghost btn-s danger" [disabled]="busy()" (click)="revoke(l)">{{ 'shareLinks.revoke' | t }}</button>
                }
              </div>
            }
          </div>
        }
      }
    </main>
  `,
  styles: `
    .small-title {
      font-size: 1.6rem;
    }
    .made {
      border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
    }
    .url {
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
      font-size: var(--fs-s);
      overflow-wrap: anywhere;
      user-select: text;
      -webkit-user-select: text;
    }
    .row {
      display: flex;
      gap: 8px;
    }
    .grow {
      flex: 1;
    }
    .checks {
      display: grid;
      gap: 8px;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
    }
    .check input {
      width: 22px;
      height: 22px;
      accent-color: var(--accent);
    }
    .chips {
      display: flex;
      gap: 8px;
    }
    .list-sub.wrap {
      white-space: normal;
    }
    .link.off {
      opacity: 0.6;
    }
    .danger {
      color: var(--danger, #c2410c);
    }
  `,
})
export class ShareLinksPage {
  protected readonly i18n = inject(I18nService);
  private readonly api = inject(HabitsApi);
  private readonly toast = inject(ToastService);
  private readonly session = inject(SessionStore);
  protected readonly scopes = SCOPES;
  protected readonly links = signal<ShareLink[] | null>(null);
  protected readonly label = signal('');
  protected readonly chosen = signal<ShareScope[]>(['WEIGHT', 'MEALS']);
  protected readonly days = signal(30);
  protected readonly busy = signal(false);
  /** the link just made, shown this once */
  protected readonly made = signal<string | null>(null);
  protected readonly name = computed(() => this.session.account()?.displayName ?? '');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.links.set(await this.api.shareLinks());
    } catch {
      this.links.set([]);
    }
  }

  protected toggle(s: ShareScope): void {
    this.chosen.update((list) => (list.includes(s) ? list.filter((x) => x !== s) : SCOPES.filter((x) => x === s || list.includes(x))));
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.api.createShareLink(this.label().trim() || null, this.days(), this.chosen());
      this.made.set(r.url);
      this.label.set('');
      await this.load();
      globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(l: ShareLink): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.revokeShareLink(l.id);
      await this.load();
      this.toast.show(this.i18n.t('shareLinks.revoked'));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.toast.show(this.i18n.t('shareLinks.copied'));
    } catch {
      /* no clipboard: the link stays on screen, selectable */
    }
  }

  protected async send(url: string): Promise<void> {
    const text = this.i18n.t('shareLinks.message', { name: this.name() });
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch {
        return;
      }
    }
    await this.copy(url);
  }

  /** « Poids, repas · jusqu'au 23 décembre · ouvert 3 fois » */
  protected lineOf(l: ShareLink): string {
    const what = l.scopes.map((s) => this.i18n.t('shareLinks.short.' + s)).join(', ');
    const when = l.active
      ? this.i18n.t('shareLinks.until', { date: this.i18n.date(l.expiresAt, { day: 'numeric', month: 'long' }) })
      : this.i18n.t(l.revokedAt ? 'shareLinks.revokedOn' : 'shareLinks.expired');
    const opened = l.openedCount === 0 ? this.i18n.t('shareLinks.notOpened') : this.i18n.t(l.openedCount === 1 ? 'shareLinks.openedOne' : 'shareLinks.openedMany', { n: l.openedCount });
    return `${what} · ${when} · ${opened}`;
  }
}
