import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';
import { BackButtonComponent } from '../../shared/back-button.component';
import { SegDirective } from '../../shared/seg.directive';
import { AdminStore } from './admin.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { SITE } from '../../core/site';

/** Admin area inside the app: accounts, access requests, links and the journal. */
@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, IconComponent, BackButtonComponent],
  providers: [AdminStore],
  template: `
    <main class="page">
      <header class="page-head">
        <app-back-button />
        <div>
          <h1 class="title">{{ 'admin.title' | t }}</h1>
          @if (store.summary(); as s) {
            <p class="small muted">{{ 'admin.summary' | t: { users: s.users, admins: s.admins } }}</p>
          }
        </div>
      </header>
      <nav class="tabs" appSeg [attr.aria-label]="'admin.title' | t">
        @for (tab of tabs; track tab.path) {
          <a [routerLink]="tab.path" [replaceUrl]="true" routerLinkActive="on" #rla="routerLinkActive" [attr.aria-current]="rla.isActive ? 'page' : null">
            <app-icon [name]="tab.icon" [size]="18" />
            <span>{{ 'admin.tabs.' + tab.path | t }}</span>
            @if (tab.path === 'requests' && (store.summary()?.pendingRequests ?? 0) > 0) {
              <span class="count-badge">{{ store.summary()?.pendingRequests }}</span>
            }
          </a>
        }
      </nav>
      <router-outlet />

      <section class="card contact">
        <span class="contact-ico"><app-icon name="mail" /></span>
        <div class="contact-copy">
          <h2 class="h3">{{ 'admin.contact.title' | t }}</h2>
          <p class="small muted">{{ 'admin.contact.text' | t }}</p>
        </div>
        <div class="contact-actions">
          <a class="btn btn-secondary" [href]="'mailto:' + site.email"><app-icon name="mail" [size]="18" /> {{ 'admin.contact.email' | t }}</a>
          <a class="btn btn-ghost" [href]="site.contact[i18n.lang()]" target="_blank" rel="noopener"><app-icon name="link" [size]="18" /> {{ 'admin.contact.form' | t }}</a>
        </div>
      </section>
    </main>
  `,
  styles: `
    .tabs {
      position: sticky;
      top: calc(var(--safe-top) + 4px);
      z-index: 10;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding: 4px;
      border-radius: var(--radius-m);
      background: var(--glass);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--glass-line);
      --seg-radius: 12px;
    }
    .tabs a {
      position: relative;
      display: grid;
      justify-items: center;
      gap: 2px;
      padding: 8px 2px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 650;
      color: var(--fg-2);
    }
    .tabs a.on {
      color: var(--accent-text);
    }
    @media (min-width: 440px) {
      .tabs {
        grid-template-columns: repeat(6, 1fr);
      }
    }
    .contact {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-3) var(--space-4);
      align-items: center;
      margin-top: var(--space-6);
      padding: var(--space-4);
    }
    .contact-ico {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .contact-copy {
      display: grid;
      gap: 2px;
    }
    .contact-actions {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .tabs .count-badge {
      position: absolute;
      top: 2px;
      right: 8px;
    }
  `,
})
export class AdminPage {
  protected readonly site = SITE;
  protected readonly i18n = inject(I18nService);
  protected readonly store = inject(AdminStore);
  protected readonly tabs = [
    { path: 'users', icon: 'users' },
    { path: 'requests', icon: 'inbox' },
    { path: 'links', icon: 'link' },
    { path: 'foods', icon: 'leaf' },
    { path: 'moderation', icon: 'flag' },
    { path: 'journal', icon: 'list' },
  ];

  constructor() {
    void this.store.refreshSummary();
  }
}
