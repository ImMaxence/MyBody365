import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';
import { BackButtonComponent } from '../../shared/back-button.component';
import { SegDirective } from '../../shared/seg.directive';
import { AdminStore } from './admin.store';

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
    .tabs .count-badge {
      position: absolute;
      top: 2px;
      right: 8px;
    }
  `,
})
export class AdminPage {
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
