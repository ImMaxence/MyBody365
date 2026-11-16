import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { SiteFooterComponent } from '../landing/site-footer.component';
import { SubpageHeaderComponent } from '../landing/subpage-header.component';
import { CURRENT_VERSION, RELEASES } from './changelog.data';

/** Look of each kind of change (Keep a Changelog sections, in French). */
const KINDS: Record<string, { icon: string; tone: string }> = {
  Ajouté: { icon: 'plus', tone: 'accent' },
  Amélioré: { icon: 'sparkles', tone: 'cool' },
  Modifié: { icon: 'refresh', tone: 'cool' },
  Corrigé: { icon: 'check', tone: 'success' },
  Sécurité: { icon: 'shield', tone: 'warning' },
  Supprimé: { icon: 'trash', tone: 'danger' },
  Obsolète: { icon: 'clock', tone: 'warning' },
};

/** /changelog: CHANGELOG.md as a page, in French, prerendered (see scripts/changelog.mjs). */
@Component({
  selector: 'app-changelog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent, SiteFooterComponent, SubpageHeaderComponent],
  template: `
    <app-subpage-header />
    <main id="main" class="container doc">
      <p class="eyebrow">{{ 'changelog.current' | t: { v: current } }}</p>
      <h1 class="h2">{{ 'changelog.title' | t }}</h1>
      <p class="lead">{{ 'changelog.intro' | t }}</p>

      <ol class="releases" role="list">
        @for (r of releases; track r.version; let first = $first) {
          <li class="release" [class.latest]="first">
            <span class="dot" aria-hidden="true"></span>
            <header class="r-head">
              <h2 class="h3">{{ r.date ? 'v' + r.version : ('changelog.unreleased' | t) }}</h2>
              @if (r.date) {
                <time class="small muted" [attr.datetime]="r.date">{{ i18n.date(r.date, { day: 'numeric', month: 'long', year: 'numeric' }) }}</time>
              }
              @if (first && r.date) {
                <span class="chip chip-accent">{{ 'changelog.latest' | t }}</span>
              }
            </header>
            @if (r.summary.length) {
              <p class="summary">
                @for (s of r.summary; track $index) {
                  @if (s.href) {
                    <a [href]="s.href" rel="noopener">{{ s.t }}</a>
                  } @else if (s.b) {
                    <strong>{{ s.t }}</strong>
                  } @else if (s.c) {
                    <code>{{ s.t }}</code>
                  } @else {
                    {{ s.t }}
                  }
                }
              </p>
            }
            @for (sec of r.sections; track sec.title) {
              <section class="sec">
                <h3 class="chip" [class]="'chip chip-' + kind(sec.title).tone"><app-icon [name]="kind(sec.title).icon" /> {{ sec.title }}</h3>
                <ul role="list">
                  @for (item of sec.items; track $index) {
                    <li>
                      @for (s of item; track $index) {
                        @if (s.href) {
                          <a [href]="s.href" rel="noopener">{{ s.t }}</a>
                        } @else if (s.b) {
                          <strong>{{ s.t }}</strong>
                        } @else if (s.c) {
                          <code>{{ s.t }}</code>
                        } @else {
                          {{ s.t }}
                        }
                      }
                    </li>
                  }
                </ul>
              </section>
            }
          </li>
        }
      </ol>
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
    .releases {
      display: grid;
      gap: var(--space-5);
      margin-top: var(--space-6);
    }
    .release {
      position: relative;
      display: grid;
      gap: var(--space-4);
      padding: var(--space-6) var(--space-5);
      border-radius: var(--radius-xl);
      background: var(--surface);
      border: 1px solid var(--line);
    }
    .release.latest {
      border-color: color-mix(in srgb, var(--accent) 35%, transparent);
      background:
        radial-gradient(120% 80% at 0% 0%, var(--accent-soft), transparent 60%),
        var(--surface);
    }
    .dot {
      position: absolute;
      top: var(--space-6);
      right: var(--space-5);
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--line-strong);
    }
    .latest .dot {
      background: var(--flame);
      box-shadow: 0 0 0 5px var(--accent-soft);
    }
    .r-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-2) var(--space-3);
      padding-right: var(--space-6);
    }
    .summary {
      color: var(--fg-2);
    }
    .sec {
      display: grid;
      gap: var(--space-3);
    }
    .sec h3 {
      justify-self: start;
    }
    .sec ul {
      display: grid;
      gap: 10px;
    }
    .sec li {
      position: relative;
      padding-left: 18px;
      line-height: 1.5;
    }
    .sec li::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 0.62em;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--fg-3);
    }
    a {
      color: var(--accent-text);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    code {
      padding: 1px 6px;
      border-radius: 6px;
      background: var(--surface-3);
      font-size: 0.9em;
    }
  `,
})
export class ChangelogPage {
  protected readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  protected readonly releases = RELEASES;
  protected readonly current = CURRENT_VERSION;

  constructor() {
    // the changelog is written in French: the page is French whatever the visitor's language
    this.i18n.set('fr');
    this.seo.set({
      title: `${this.i18n.t('changelog.title')} · MyBody365`,
      description: this.i18n.t('changelog.intro'),
      path: '/changelog',
    });
  }

  protected kind(title: string): { icon: string; tone: string } {
    return KINDS[title] ?? { icon: 'info', tone: 'cool' };
  }
}
