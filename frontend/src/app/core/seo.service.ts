import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SITE } from './site';

/** Title, description, canonical and language alternates of the public pages. */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  set(opts: { title: string; description: string; path: string; alternates?: { fr: string; en: string }; index?: boolean }): void {
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
