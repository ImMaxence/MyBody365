import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService, Lang, interpolate } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { LEGAL_DOCS, LegalDoc, SITE } from '../../core/site';
import { SiteFooterComponent } from '../landing/site-footer.component';
import { SubpageHeaderComponent } from '../landing/subpage-header.component';
import { SegDirective } from '../../shared/seg.directive';

interface Section {
  h: string;
  p: string[];
}

/** Mentions légales · confidentialité · CGU, one component for the three, in both languages. */
@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegDirective, RouterLink, TranslatePipe, SiteFooterComponent, SubpageHeaderComponent],
  template: `
    <app-subpage-header />
    <main id="main" class="container doc">
      <nav class="tabs seg" aria-label="Documents">
        @for (d of docs; track d) {
          <a [routerLink]="prefix() + '/legal/' + d" [replaceUrl]="true" [attr.aria-current]="d === key() ? 'page' : null" [class.on]="d === key()">
            {{ 'legal.docs.' + d | t }}
          </a>
        }
      </nav>
      @for (k of [key()]; track k) {
        <div class="doc-body">
          <h1 class="h2">{{ 'legal.' + k + '.title' | t }}</h1>
          <p class="small faint">{{ 'legal.updated' | t: { date: updated() } }}</p>
          @for (s of sections(); track s.h) {
            <section>
              <h2 class="h3">{{ s.h }}</h2>
              @for (p of s.p; track $index) {
                <p>{{ p }}</p>
              }
            </section>
          }
        </div>
      }
    </main>
    <app-site-footer />
  `,
  styles: `
    .doc {
      display: grid;
      gap: var(--space-4);
      max-width: 760px;
      padding-bottom: var(--space-16);
    }
    .tabs {
      margin-bottom: var(--space-6);
    }
    /* three equal tabs: a long name goes on two lines instead of being cut */
    .tabs a {
      display: grid;
      place-items: center;
      min-height: 44px;
      padding: 6px 8px;
      border-radius: var(--radius-pill);
      font-size: var(--fs-s);
      font-weight: 600;
      line-height: 1.2;
      text-align: center;
      color: var(--fg-2);
    }
    .tabs a.on {
      color: var(--accent-text);
    }
    /* one document to the next: the tabs stay, the text fades in (no page animation) */
    .doc-body {
      display: grid;
      gap: var(--space-4);
      animation: doc-in 320ms var(--ease-out) both;
    }
    @keyframes doc-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .doc-body {
        animation: none;
      }
    }
    section {
      display: grid;
      gap: var(--space-3);
      padding-top: var(--space-6);
    }
    section p {
      color: var(--fg-2);
      line-height: 1.65;
    }
  `,
})
export class LegalPage {
  readonly doc = input<string>('mentions');
  readonly lang = input<Lang>('fr');

  private readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  protected readonly docs = LEGAL_DOCS;

  protected readonly key = computed<LegalDoc>(() => (LEGAL_DOCS as readonly string[]).includes(this.doc()) ? (this.doc() as LegalDoc) : 'mentions');
  protected readonly prefix = computed(() => (this.i18n.lang() === 'en' ? '/en' : ''));
  protected readonly updated = computed(() => this.i18n.date(SITE.legalUpdated, { day: 'numeric', month: 'long', year: 'numeric' }));

  protected readonly sections = computed<Section[]>(() => {
    const lang = this.i18n.lang();
    const params = {
      owner: SITE.owner,
      email: SITE.email,
      siteUrl: SITE.host,
      contactSite: 'mbonnici.fr',
      host: SITE.hosting[lang],
    };
    return (this.i18n.get<Section[]>(`legal.${this.key()}.sections`) ?? []).map((s) => ({
      h: s.h,
      p: s.p.map((p) => interpolate(p, params)),
    }));
  });

  constructor() {
    effect(() => {
      this.i18n.set(this.lang());
      const key = this.key();
      const path = (this.lang() === 'en' ? '/en' : '') + '/legal/' + key;
      this.seo.set({
        title: `${this.i18n.t('legal.' + key + '.title')} · MyBody365`,
        description: this.i18n.t('meta.description'),
        path,
        alternates: { fr: '/legal/' + key, en: '/en/legal/' + key },
      });
    });
  }
}
