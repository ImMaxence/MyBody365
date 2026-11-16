import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SITE } from './site';

/**
 * Title, description, canonical and language alternates of the public pages, and their structured data
 * (JSON-LD, read by search engines and AI assistants; not a script that runs, so the CSP is not involved).
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  set(opts: { title: string; description: string; path: string; alternates?: { fr: string; en: string }; index?: boolean; ld?: object }): void {
    this.title.setTitle(opts.title);
    this.meta.updateTag({ name: 'description', content: opts.description });
    this.meta.updateTag({ property: 'og:title', content: opts.title });
    this.meta.updateTag({ property: 'og:description', content: opts.description });
    this.meta.updateTag({ property: 'og:url', content: SITE.url + opts.path });
    this.meta.updateTag({ name: 'robots', content: opts.index === false ? 'noindex' : 'index, follow' });
    this.link('canonical', SITE.url + opts.path);
    this.document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => l.remove());
    if (opts.alternates) {
      this.alternate('fr', SITE.url + opts.alternates.fr);
      this.alternate('en', SITE.url + opts.alternates.en);
      this.alternate('x-default', SITE.url + opts.alternates.fr);
    }
    this.document.head.querySelector('script#ld')?.remove();
    if (opts.ld) {
      const el = this.document.createElement('script');
      el.type = 'application/ld+json';
      el.id = 'ld';
      // "<" written as \u003c: the JSON cannot close the script element
      el.textContent = JSON.stringify(opts.ld).replace(/</g, '\\u003c');
      this.document.head.appendChild(el);
    }
  }

  private link(rel: string, href: string): void {
    let el = this.document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!el) {
      el = this.document.createElement('link');
      el.rel = rel;
      this.document.head.appendChild(el);
    }
    el.href = href;
  }

  private alternate(lang: string, href: string): void {
    const el = this.document.createElement('link');
    el.rel = 'alternate';
    el.hreflang = lang;
    el.href = href;
    this.document.head.appendChild(el);
  }
}
