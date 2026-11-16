import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SITE } from '../../core/site';
import { LogoComponent } from '../../shared/logo.component';
import { CURRENT_VERSION } from '../changelog/changelog.data';

@Component({
  selector: 'app-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, LogoComponent],
  template: `
    <footer class="container">
      <div class="brand">
        <app-logo [size]="30" />
        <p class="small muted">{{ 'landing.footerMadeBy' | t }} <a [href]="site.ownerSite" rel="noopener">{{ site.owner }}</a></p>
      </div>
      <nav class="links" aria-label="Footer">
        <a [routerLink]="prefix() + '/legal/mentions'">{{ 'landing.footerLegal' | t }}</a>
        <a [routerLink]="prefix() + '/legal/confidentialite'">{{ 'landing.footerPrivacy' | t }}</a>
        <a [routerLink]="prefix() + '/legal/cgu'">{{ 'landing.footerTerms' | t }}</a>
        <a routerLink="/changelog" hreflang="fr">{{ 'landing.footerChangelog' | t }} · v{{ version }}</a>
        <a [href]="contact()" rel="noopener">{{ 'landing.footerContact' | t }}</a>
      </nav>
      <p class="tiny faint">© {{ year }} MyBody365</p>
    </footer>
  `,
  styles: `
    footer {
      display: grid;
      gap: var(--space-5);
      padding: var(--space-10) 0 calc(var(--space-10) + var(--safe-bottom));
      border-top: 1px solid var(--line);
    }
    .brand {
      display: grid;
      gap: var(--space-2);
    }
    .brand a {
      color: var(--fg);
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-5);
      font-size: var(--fs-s);
      font-weight: 550;
    }
    .links a {
      color: var(--fg-2);
      padding: 6px 0;
    }
    .links a:hover {
      color: var(--fg);
    }
    @media (min-width: 760px) {
      footer {
        grid-template-columns: 1fr auto;
        align-items: center;
      }
    }
  `,
})
export class SiteFooterComponent {
  private readonly i18n = inject(I18nService);
  protected readonly site = SITE;
  protected readonly year = new Date().getFullYear();
  protected readonly version = CURRENT_VERSION;
  protected readonly prefix = computed(() => (this.i18n.lang() === 'en' ? '/en' : ''));
  protected readonly contact = computed(() => SITE.contact[this.i18n.lang()]);
}
