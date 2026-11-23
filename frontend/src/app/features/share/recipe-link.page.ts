import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { detectPlatform } from '../../core/pwa/install.service';
import { recipeLinkId } from '../../core/meals/recipe-link';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';

/**
 * 1.19: a recipe's link opened in a browser (sent by message: an iPhone never opens the app of the home screen from a
 * link, it opens Safari). In place of the presentation of the app: how to open it there, the link to copy (pasted in
 * the search of the meals, it opens the recipe), and the app to install for whoever does not have it. Nothing of the
 * recipe is shown here: it stays for its owner's friends, in the app.
 */
@Component({
  selector: 'app-recipe-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, LogoComponent],
  template: `
    <main id="main" class="wrap">
      <header class="top"><app-logo /></header>
      <section class="card block">
        <span class="ico" aria-hidden="true"><app-icon name="book" [size]="26" /></span>
        <h1 class="title">{{ 'recipeLink.title' | t }}</h1>
        <p class="muted">{{ (ios ? 'recipeLink.ios' : 'recipeLink.other') | t }}</p>
        <ol class="steps">
          <li>{{ 'recipeLink.step1' | t }}</li>
          <li>{{ 'recipeLink.step2' | t }}</li>
          <li>{{ 'recipeLink.step3' | t }}</li>
        </ol>
        <button type="button" class="btn btn-primary btn-block" (click)="copy()">
          <app-icon [name]="copied() ? 'check' : 'copy'" /> {{ (copied() ? 'recipeLink.copied' : 'recipeLink.copy') | t }}
        </button>
        @if (manual()) {
          <!-- no clipboard in this browser: the address, to select and copy by hand -->
          <input class="input" readonly [value]="link()" [attr.aria-label]="'recipeLink.copy' | t" (focus)="$any($event.target).select()" />
        }
        <p class="small muted tip">{{ 'recipeLink.tip' | t }}</p>
        <a class="btn btn-ghost btn-block" [routerLink]="home" fragment="install">{{ 'recipeLink.install' | t }}</a>
      </section>
    </main>
  `,
  styles: `
    .wrap {
      width: min(100% - 32px, 560px);
      margin: 0 auto;
      padding: 24px 0 64px;
      display: grid;
      gap: 18px;
    }
    .block {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-6);
    }
    .ico {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: var(--accent-soft);
      color: var(--accent-text);
    }
    .title {
      margin: 0;
      font-family: var(--font-display);
      font-stretch: 115%;
      font-weight: 800;
      font-size: clamp(1.6rem, 6vw, 2.1rem);
      line-height: 1.08;
    }
    p {
      margin: 0;
    }
    .steps {
      display: grid;
      gap: 8px;
      margin: 0;
      padding-left: 22px;
      font-weight: 600;
    }
    .tip {
      text-wrap: pretty;
    }
  `,
})
export class RecipeLinkPage {
  readonly id = input('');
  private readonly doc = inject(DOCUMENT);
  private readonly i18n = inject(I18nService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly ios = this.browser && detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === 'ios';
  protected readonly home = this.i18n.preferred() === 'en' ? '/en' : '/';
  protected readonly copied = signal(false);
  protected readonly manual = signal(false);
  /** the address the app opens (only a recipe's: a made-up id gives the app's home) */
  protected readonly link = computed(() => {
    const origin = this.doc.location?.origin ?? '';
    const id = recipeLinkId(`/recette/${this.id()}`);
    return id ? `${origin}/app/meals/recipes/${id}` : `${origin}/app`;
  });

  constructor() {
    inject(Title).setTitle('MyBody365');
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.browser) this.i18n.set(this.i18n.preferred());
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.copied.set(true);
    } catch {
      this.manual.set(true);
    }
  }
}
