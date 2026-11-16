import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18nService, Lang } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { InstallService } from '../../core/pwa/install.service';
import { SeoService } from '../../core/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { FlagComponent } from '../../shared/flag.component';
import { LogoComponent } from '../../shared/logo.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';
import { InstallGuideComponent } from './install-guide.component';
import { JourneyVignetteComponent } from './journey-vignette.component';
import { SiteFooterComponent } from './site-footer.component';

interface Stop {
  day: string;
  title: string;
  text: string;
}

type Cell = 'done' | 'freeze' | 'today' | 'future';

/** four weeks of an example streak: validated days, two frozen ones, today, what is left */
const CALENDAR: Cell[] = Array.from({ length: 28 }, (_, i) => {
  const day = i + 1;
  if (day === 6 || day === 13) return 'freeze';
  if (day < 18) return 'done';
  return day === 18 ? 'today' : 'future';
});

/**
 * The public site: 365 days as the promise, an example streak to show how a day counts, then the
 * journey from day 0 (install) to day 365. Prerendered at / (French) and /en (English).
 */
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslatePipe,
    IconComponent,
    FlagComponent,
    LogoComponent,
    InstallGuideComponent,
    JourneyVignetteComponent,
    SiteFooterComponent,
    ThemeToggleComponent,
  ],
  template: `
    <a class="skip-link" href="#main">{{ 'common.skipToContent' | t }}</a>
    <header class="bar">
      <div class="container bar-in">
        <a [routerLink]="home()" class="brand" aria-label="MyBody365"><app-logo [size]="32" /></a>
        <nav class="nav" aria-label="Sections">
          <a href="#apercu">{{ 'landing.nav.preview' | t }}</a>
          <a href="#parcours">{{ 'landing.nav.journey' | t }}</a>
          <a href="#privacy">{{ 'landing.nav.privacy' | t }}</a>
          <a href="#faq">{{ 'landing.nav.faq' | t }}</a>
        </nav>
        <a class="lang" [routerLink]="otherHome()" [attr.hreflang]="i18n.other()" [attr.aria-label]="'common.switchToLabel' | t">
          <app-flag [lang]="i18n.other()" /> <span class="lang-code">{{ i18n.other().toUpperCase() }}</span>
        </a>
        <app-theme-toggle />
        <a href="#install" class="btn btn-dark btn-s">{{ 'landing.nav.install' | t }}</a>
      </div>
    </header>

    <main id="main">
      <section class="hero container">
        <p class="eyebrow reveal-1"><span class="dot"></span>{{ 'landing.heroEyebrow' | t }}</p>
        <div class="hero-top">
          <p class="counter" aria-hidden="true">
            <span class="day-label">{{ 'landing.days' | t }}</span>
            <span class="day-num">365</span>
          </p>
          <div class="calendar" role="img" [attr.aria-label]="'landing.yearLabel' | t">
            <div class="cal-head">
              <span class="cal-flame"><app-icon name="flame" [size]="18" [stroke]="2.2" /></span>
              <span class="cal-title">{{ 'landing.calTitle' | t }}</span>
              <span class="cal-count num">{{ 'landing.calCount' | t: { n: 18 } }}</span>
            </div>
            <div class="cal-grid">
              @for (c of calendar; track $index) {
                <span class="cell" [class]="'cell ' + c" [style.--i]="$index">
                  @switch (c) {
                    @case ('done') {
                      <app-icon name="check" [size]="14" [stroke]="3" />
                    }
                    @case ('freeze') {
                      <app-icon name="snowflake" [size]="15" [stroke]="2.2" />
                    }
                    @case ('today') {
                      <app-icon name="flame" [size]="16" [stroke]="2.3" />
                    }
                  }
                </span>
              }
            </div>
            <div class="cal-legend tiny">
              <span><i class="k done"></i>{{ 'landing.calDone' | t }}</span>
              <span><i class="k freeze"></i>{{ 'landing.calFreeze' | t }}</span>
              <span><i class="k today"></i>{{ 'landing.calToday' | t }}</span>
            </div>
          </div>
        </div>
        <div class="hero-text">
          <h1 class="h1">
            {{ 'landing.heroTitleA' | t }}
            <span class="flame-text">{{ 'landing.heroTitleB' | t }}</span>
          </h1>
          <div class="hero-side">
            <p class="lead">{{ 'landing.heroLead' | t }}</p>
            <div class="cta">
              <a href="#install" class="btn btn-primary"><app-icon name="download" /> {{ 'landing.installCta' | t }}</a>
              <a href="#apercu" class="btn btn-secondary"><app-icon name="smartphone" /> {{ 'landing.previewCta' | t }}</a>
            </div>
            <p class="tiny muted">{{ 'landing.heroNote' | t }}</p>
          </div>
        </div>
      </section>

      <section id="apercu" class="preview">
        <div class="container preview-head">
          <div>
            <p class="eyebrow reveal">{{ 'landing.previewEyebrow' | t }}</p>
            <h2 class="h2 reveal">{{ 'landing.previewTitle' | t }}</h2>
            <p class="lead reveal">{{ 'landing.previewText' | t }}</p>
          </div>
          <div class="arrows">
            <button type="button" class="icon-btn" [attr.aria-label]="'landing.previewPrev' | t" (click)="slide(shotsRow, -1)"><app-icon name="chevronLeft" /></button>
            <button type="button" class="icon-btn" [attr.aria-label]="'landing.previewNext' | t" (click)="slide(shotsRow, 1)"><app-icon name="chevronRight" /></button>
          </div>
        </div>
        <ul class="shots" role="list" #shotsRow tabindex="0" [attr.aria-label]="'landing.previewTitle' | t">
          @for (s of shots(); track s.key; let i = $index) {
            <li class="shot" [style.--i]="i">
              <div class="device">
                <img class="theme-light-only" [src]="'/shots/' + s.key + '-light.webp'" width="600" height="1301" loading="lazy" decoding="async" [alt]="s.alt" />
                <img class="theme-dark-only" [src]="'/shots/' + s.key + '-dark.webp'" width="600" height="1301" loading="lazy" decoding="async" [alt]="s.alt" />
              </div>
              <h3 class="shot-title">{{ s.title }}</h3>
              <p class="small muted">{{ s.text }}</p>
            </li>
          }
        </ul>
        <div class="container preview-foot">
          <a href="#install" class="btn btn-primary"><app-icon name="download" /> {{ 'landing.installCta' | t }}</a>
          <p class="small muted">{{ 'landing.previewNote' | t }}</p>
        </div>
      </section>

      <section id="parcours" class="journey container">
        <p class="eyebrow reveal">{{ 'landing.journeyEyebrow' | t }}</p>
        <h2 class="h2 reveal">{{ 'landing.journeyTitle' | t }}</h2>
        <ol class="stops" role="list">
          @for (stop of stops(); track stop.day) {
            <li class="stop" [attr.id]="stop.day === '0' ? 'install' : null">
              <div class="marker" aria-hidden="true">
                <span class="m-label">{{ 'landing.day' | t }}</span>
                <span class="m-num num">{{ stop.day }}</span>
              </div>
              <div class="body">
                <h3 class="h3 reveal"><span class="sr-only">{{ 'landing.day' | t }} {{ stop.day }} · </span>{{ stop.title }}</h3>
                <p class="muted reveal">{{ stop.text }}</p>
                @if (stop.day === '0') {
                  <app-install-guide class="reveal" />
                } @else {
                  <app-journey-vignette class="reveal" [day]="stop.day" />
                }
              </div>
            </li>
          }
        </ol>
      </section>

      <section id="privacy" class="privacy-band">
        <div class="container privacy">
          <div class="privacy-copy">
            <p class="eyebrow">{{ 'landing.privacyEyebrow' | t }}</p>
            <h2 class="h2 reveal">{{ 'landing.privacyTitle' | t }}</h2>
            <p class="lead reveal">{{ 'landing.privacyText' | t }}</p>
            <ul class="points" role="list">
              @for (p of privacyPoints(); track p) {
                <li class="reveal"><span class="tick"><app-icon name="check" [size]="14" [stroke]="2.8" /></span>{{ p }}</li>
              }
            </ul>
          </div>
          <div class="vault" aria-hidden="true">
            <span class="ring r1"></span>
            <span class="ring r2"></span>
            <span class="ring r3"></span>
            <svg class="lock" viewBox="0 0 120 140">
              <defs>
                <linearGradient id="lock-g" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stop-color="#ff3d1f" />
                  <stop offset=".5" stop-color="#ff7a1a" />
                  <stop offset="1" stop-color="#ffc23d" />
                </linearGradient>
              </defs>
              <path class="shackle" d="M32 64V44a28 28 0 0 1 56 0v20" />
              <rect x="14" y="60" width="92" height="72" rx="20" fill="url(#lock-g)" />
              <circle cx="60" cy="90" r="9" fill="#1c0b03" />
              <rect x="56" y="94" width="8" height="18" rx="4" fill="#1c0b03" />
            </svg>
            <span class="lock-label"><app-icon name="eyeOff" [size]="16" /> {{ 'landing.privacyLock' | t }}</span>
          </div>
        </div>
      </section>

      <section id="faq" class="faq container">
        <h2 class="h2 reveal">{{ 'landing.faqTitle' | t }}</h2>
        <div class="qa">
          @for (item of faq(); track item.q) {
            <details class="reveal">
              <summary>
                {{ item.q }}
                <app-icon name="plus" [size]="20" />
              </summary>
              <p class="muted">{{ item.a }}</p>
            </details>
          }
        </div>
      </section>

      <section class="container final-wrap">
        <div class="final reveal">
          <span class="final-day" aria-hidden="true">365</span>
          <p class="eyebrow">{{ 'landing.ctaEyebrow' | t }}</p>
          <h2 class="h2">{{ 'landing.ctaTitle' | t }}</h2>
          <p>{{ 'landing.ctaText' | t }}</p>
          <a href="#install" class="btn btn-dark">{{ 'landing.installCta' | t }} <app-icon name="arrowRight" /></a>
        </div>
      </section>
    </main>

    <app-site-footer />
  `,
  styles: `
    :host {
      display: block;
      /* an anchor (#parcours, #privacy…) stops just under the sticky header */
      --anchor-offset: calc(64px + var(--safe-top) + 16px);
    }
    section[id] {
      scroll-margin-top: var(--anchor-offset);
    }

    /* ── header ─────────────────────────────────────────────────────────────── */
    .bar {
      position: sticky;
      top: 0;
      z-index: 50;
      padding-top: var(--safe-top);
      background: var(--glass);
      backdrop-filter: saturate(1.6) blur(16px);
      -webkit-backdrop-filter: saturate(1.6) blur(16px);
      border-bottom: 1px solid var(--glass-line);
    }
    .bar-in {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      height: 64px;
    }
    .brand {
      margin-right: auto;
    }
    .nav {
      display: none;
      gap: var(--space-6);
      margin-right: var(--space-4);
      font-size: var(--fs-s);
      font-weight: 550;
      color: var(--fg-2);
    }
    .nav a {
      position: relative;
      transition: color var(--dur-2);
    }
    .nav a::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -6px;
      height: 2px;
      border-radius: 1px;
      background: var(--flame);
      transform: scaleX(0);
      transition: transform var(--dur-3) var(--ease-out);
    }
    .nav a:hover {
      color: var(--fg);
    }
    .nav a:hover::after {
      transform: none;
    }
    .lang {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 40px;
      padding: 0 10px;
      border-radius: var(--radius-pill);
      font-size: var(--fs-s);
      font-weight: 650;
      color: var(--fg-2);
    }
    .lang:hover {
      background: var(--surface-3);
      color: var(--fg);
    }
    @media (max-width: 480px) {
      .bar-in ::ng-deep app-theme-toggle .icon-btn {
        width: 40px;
        height: 40px;
      }
      /* the flag alone on a phone (the link keeps its label for screen readers) */
      .lang .lang-code {
        display: none;
      }
      .lang {
        padding: 0 8px;
      }
    }
    @media (max-width: 360px) {
      .brand ::ng-deep .word {
        display: none;
      }
    }

    /* ── hero: 365, and how a day counts ────────────────────────────────────── */
    .hero {
      display: grid;
      gap: var(--space-6);
      padding: var(--space-8) 0 var(--space-16);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--flame);
      box-shadow: 0 0 0 4px var(--accent-soft);
      animation: beat 2s ease-in-out infinite;
    }
    @keyframes beat {
      50% {
        box-shadow: 0 0 0 7px transparent;
      }
    }
    .hero-top {
      display: grid;
      gap: var(--space-6);
      align-items: center;
    }
    .counter {
      container-type: inline-size;
      display: flex;
      align-items: flex-start;
      gap: 0.4rem;
      line-height: 0.8;
      animation: rise 900ms var(--ease-out) both;
    }
    .day-label {
      padding-top: 0.5em;
      font-family: var(--font-display);
      font-stretch: 110%;
      font-weight: 800;
      font-size: clamp(0.9rem, 0.6rem + 1.4vw, 1.6rem);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--fg-2);
      writing-mode: vertical-rl;
      transform: rotate(180deg);
    }
    .day-num {
      font-family: var(--font-display);
      font-stretch: 125%;
      font-weight: 900;
      /* 365 is 2.26em wide: it always fits the column, next to the vertical label */
      font-size: min(17rem, calc((100cqi - 2.6rem) / 2.4));
      letter-spacing: -0.06em;
      padding-right: 0.12em;
      background: linear-gradient(110deg, var(--flame-1) 0%, var(--flame-2) 35%, var(--flame-3) 55%, var(--flame-2) 75%, var(--flame-1) 100%);
      background-size: 220% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: sheen 7s ease-in-out infinite;
    }
    @keyframes sheen {
      50% {
        background-position: 100% 0;
      }
    }
    /* the big texts of the hero rise without fading: visible from the first paint (it is the LCP) */
    @keyframes rise {
      from {
        transform: translateY(24px);
      }
    }
    @keyframes rise-in {
      from {
        opacity: 0;
        transform: translateY(24px);
      }
    }
    .calendar {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
      width: 100%;
      max-width: 440px;
      padding: var(--space-5);
      border-radius: var(--radius-xl);
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: var(--shadow-2);
      animation: rise-in 900ms 120ms var(--ease-out) both;
    }
    .cal-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .cal-flame {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 12px;
      background: var(--cal-today);
      color: var(--cal-today-ink);
    }
    .cal-title {
      flex: 1;
      font-weight: 700;
    }
    .cal-count {
      padding: 5px 12px;
      border-radius: var(--radius-pill, 999px);
      background: var(--accent-soft);
      color: var(--accent-text);
      font-weight: 700;
      font-size: var(--fs-s);
    }
    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 6px;
    }
    .cell {
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      min-width: 0;
      border-radius: 10px;
      background: var(--surface-3);
      animation: cell-pop 460ms var(--ease-out) both;
      animation-delay: calc(300ms + var(--i) * 28ms);
    }
    .cell.done {
      background: var(--cal-done);
      color: var(--cal-done-ink);
    }
    .cell.freeze {
      background: var(--cal-freeze);
      color: var(--cal-freeze-ink);
    }
    .cell.today {
      background: var(--cal-today);
      color: var(--cal-today-ink);
      box-shadow: inset 0 0 0 2px var(--cal-today-ink), 0 0 0 3px var(--accent-soft);
      animation:
        cell-pop 460ms var(--ease-out) both,
        today 1.8s ease-in-out 1.4s infinite;
      animation-delay: calc(300ms + var(--i) * 28ms), 1.4s;
    }
    .cell.future {
      background: transparent;
      border: 1.5px dashed var(--line-strong);
    }
    @keyframes cell-pop {
      from {
        transform: scale(0.3);
        opacity: 0;
      }
    }
    @keyframes today {
      50% {
        box-shadow: inset 0 0 0 2px var(--cal-today-ink), 0 0 0 7px transparent;
        transform: scale(1.06);
      }
    }
    .cal-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      color: var(--fg-2);
      font-weight: 600;
    }
    .cal-legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .k {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }
    .k.done {
      background: var(--cal-done-ink);
    }
    .k.freeze {
      background: var(--cal-freeze-ink);
    }
    .k.today {
      background: var(--cal-today-ink);
    }
    .hero-text {
      display: grid;
      gap: var(--space-5);
    }
    .h1 {
      font-size: clamp(2.5rem, 1.6rem + 4.4vw, 4.6rem);
      animation: rise 900ms 200ms var(--ease-out) both;
    }
    .hero-side {
      display: grid;
      gap: var(--space-4);
      align-content: start;
      animation: rise-in 900ms 300ms var(--ease-out) both;
    }
    .cta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    /* ── reveal on scroll (CSS only) ────────────────────────────────────────── */
    @supports (animation-timeline: view()) {
      @media (prefers-reduced-motion: no-preference) {
        .reveal {
          animation: reveal linear both;
          animation-timeline: view();
          animation-range: entry 0% cover 28%;
        }
        .marker {
          animation: marker-lit linear both;
          animation-timeline: view();
          animation-range: entry 20% cover 45%;
        }
        .lock .shackle {
          animation: lock-close linear both;
          animation-timeline: view();
          animation-range: entry 30% cover 50%;
        }
      }
    }
    @keyframes reveal {
      from {
        opacity: 0;
        transform: translateY(28px);
      }
    }
    @keyframes marker-lit {
      from {
        transform: scale(0.7) rotate(-12deg);
        border-color: var(--line);
      }
    }
    @keyframes lock-close {
      from {
        transform: translateY(-16px);
      }
    }

    /* ── the preview: real screens, swiped on a phone, with arrows on a computer ── */
    .preview {
      padding: var(--space-12) 0 var(--space-8);
      overflow: hidden;
    }
    .preview-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-6);
    }
    .preview-head .h2 {
      margin: var(--space-3) 0 var(--space-4);
      max-width: 18ch;
    }
    .preview-head .lead {
      max-width: 56ch;
    }
    .arrows {
      display: none;
      gap: var(--space-2);
      flex: none;
    }
    .shots {
      --side: max(var(--space-4), calc((100vw - 1120px) / 2));
      display: flex;
      gap: clamp(18px, 3vw, 32px);
      margin: var(--space-8) 0 0;
      padding: 12px var(--side) 28px;
      list-style: none;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-padding-inline: var(--side);
      scrollbar-width: none;
      overscroll-behavior-x: contain;
    }
    .shots::-webkit-scrollbar {
      display: none;
    }
    .shots:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
    .shot {
      flex: none;
      width: min(70vw, 260px);
      scroll-snap-align: start;
    }
    .device {
      position: relative;
      padding: 7px;
      border-radius: 40px;
      background: #050506;
      box-shadow:
        0 0 0 1px var(--line-strong),
        0 30px 60px -28px rgba(0, 0, 0, 0.55),
        0 24px 60px -36px var(--accent-glow);
      transition: transform 420ms var(--ease-out);
    }
    .device img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 600 / 1301;
      border-radius: 33px;
      background: var(--surface-3);
    }
    @media (hover: hover) {
      .shot:hover .device {
        transform: translateY(-8px) rotate(-1deg);
      }
    }
    .shot-title {
      margin: var(--space-4) 0 2px;
      font-size: 1.05rem;
      font-weight: 750;
    }
    .preview-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3) var(--space-5);
      margin-top: var(--space-4);
    }
    .preview-foot p {
      max-width: 48ch;
    }
    @media (min-width: 900px) {
      .arrows {
        display: flex;
      }
      .shot {
        width: 270px;
      }
    }
    @supports (animation-timeline: view()) {
      @media (prefers-reduced-motion: no-preference) {
        .device {
          animation: device-in linear both;
          animation-timeline: view(inline);
          animation-range: entry 0% entry 60%;
        }
      }
    }
    @keyframes device-in {
      from {
        opacity: 0.35;
        transform: scale(0.92) translateY(14px);
      }
    }

    /* ── the journey ────────────────────────────────────────────────────────── */
    .journey {
      padding: var(--space-12) 0 var(--space-16);
    }
    .journey > .h2 {
      margin: var(--space-3) 0 var(--space-10);
      max-width: 16ch;
    }
    .stops {
      position: relative;
      display: grid;
      gap: var(--space-12);
    }
    /* the timeline line: on wide screens only (on a phone it would eat the width of the content) */
    .stops::before {
      content: '';
      display: none;
      position: absolute;
      left: 27px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background: linear-gradient(var(--flame-1), var(--flame-3) 60%, var(--line));
      opacity: 0.6;
    }
    .stop {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
      align-items: start;
      scroll-margin-top: var(--anchor-offset);
    }
    /* on a phone, the day is a pill above the title */
    .marker {
      position: relative;
      display: inline-flex;
      align-items: baseline;
      gap: 7px;
      justify-self: start;
      padding: 7px 14px 6px;
      border-radius: var(--radius-pill);
      background: var(--accent-soft);
      color: var(--accent-text);
      line-height: 1;
    }
    .m-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .m-num {
      font-family: var(--font-display);
      font-stretch: 112%;
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: -0.03em;
    }
    .body {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
      padding-top: 4px;
      min-width: 0;
    }
    .body > .h3 {
      font-size: 1.45rem;
    }
    .body > p {
      max-width: 36rem;
    }
    .body > app-journey-vignette,
    .body > app-install-guide {
      margin-top: var(--space-2);
      max-width: 34rem;
    }

    /* ── privacy ────────────────────────────────────────────────────────────── */
    .privacy-band {
      padding: var(--space-16) 0;
      background: var(--device);
      color: #f6f3ee;
      overflow: hidden;
    }
    .privacy-band .lead {
      color: #b3afa7;
    }
    .privacy-band .eyebrow {
      color: #8f8a82;
    }
    .privacy {
      display: grid;
      gap: var(--space-10);
      align-items: center;
    }
    .privacy-copy {
      display: grid;
      gap: var(--space-4);
    }
    .points {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .points li {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px 8px 8px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: var(--fs-s);
      font-weight: 600;
    }
    .tick {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--flame);
      color: #1c0b03;
    }
    .vault {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 320px;
    }
    .ring {
      position: absolute;
      border-radius: 50%;
      border: 1px solid rgba(255, 122, 26, 0.25);
      animation: ripple 4.5s ease-out infinite;
    }
    .r1 {
      width: 200px;
      height: 200px;
    }
    .r2 {
      width: 280px;
      height: 280px;
      animation-delay: 1.5s;
    }
    .r3 {
      width: 360px;
      height: 360px;
      animation-delay: 3s;
    }
    @keyframes ripple {
      0% {
        transform: scale(0.7);
        opacity: 0;
      }
      30% {
        opacity: 1;
      }
      100% {
        transform: scale(1.15);
        opacity: 0;
      }
    }
    .lock {
      position: relative;
      width: 140px;
      filter: drop-shadow(0 24px 50px rgba(255, 106, 31, 0.45));
    }
    .shackle {
      fill: none;
      stroke: #f6f3ee;
      stroke-width: 12;
      stroke-linecap: round;
    }
    .lock-label {
      position: absolute;
      bottom: 6px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      font-weight: 700;
      white-space: nowrap;
    }

    /* ── FAQ ────────────────────────────────────────────────────────────────── */
    .faq {
      padding: var(--space-16) 0;
    }
    .qa {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-6);
    }
    details {
      border-radius: var(--radius-m);
      background: var(--surface);
      border: 1px solid var(--line);
      transition: border-color var(--dur-2);
    }
    details[open] {
      border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
    }
    summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: 18px 20px;
      font-weight: 650;
      cursor: pointer;
      list-style: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary ::ng-deep svg {
      transition: transform var(--dur-3) var(--ease-out);
      flex: none;
    }
    details[open] summary ::ng-deep svg {
      transform: rotate(135deg);
    }
    details p {
      padding: 0 20px 20px;
      animation: open 320ms var(--ease-out);
    }
    @keyframes open {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
    }

    /* ── last call ──────────────────────────────────────────────────────────── */
    .final-wrap {
      padding-bottom: var(--space-16);
    }
    .final {
      container-type: inline-size;
      position: relative;
      overflow: hidden;
      display: grid;
      justify-items: start;
      gap: var(--space-4);
      padding: var(--space-10) var(--space-6);
      border-radius: var(--radius-xl);
      background: var(--flame);
      color: var(--accent-ink);
      box-shadow: 0 30px 80px -30px var(--accent-glow);
    }
    .final .eyebrow {
      color: color-mix(in srgb, var(--accent-ink) 70%, transparent);
    }
    .final .h2 {
      margin: 0;
      max-width: 14ch;
    }
    .final p {
      max-width: 28rem;
      font-weight: 500;
    }
    /* the 365 under the button, as wide as the card and always whole */
    .final-day {
      order: 1;
      margin-top: var(--space-2);
      padding-right: 0.12em;
      font-family: var(--font-display);
      font-stretch: 125%;
      font-weight: 900;
      font-size: calc(100cqi / 2.45);
      line-height: 0.8;
      letter-spacing: -0.06em;
      color: rgba(28, 11, 3, 0.13);
      pointer-events: none;
      user-select: none;
    }
    /* a wide card: on the right of the text */
    @container (min-width: 1000px) {
      .final-day {
        position: absolute;
        top: 50%;
        right: var(--space-10);
        margin: 0;
        transform: translateY(-50%);
        font-size: min(16rem, calc((100cqi - 30rem) / 2.3));
      }
    }

    @media (min-width: 760px) {
      .nav {
        display: flex;
      }
      /* the 365 takes what the calendar leaves (it sizes itself on its column) */
      .hero-top {
        grid-template-columns: minmax(0, 1.25fr) minmax(300px, 1fr);
      }
      .calendar {
        justify-self: end;
      }
      .hero-text {
        grid-template-columns: 1.1fr 1fr;
        align-items: end;
      }
      .stops::before {
        display: block;
        left: 59px;
      }
      .stop {
        grid-template-columns: 120px minmax(0, 1fr);
        gap: var(--space-8);
      }
      /* on a wide screen, a round marker on the timeline */
      .marker {
        display: grid;
        place-content: center;
        justify-items: center;
        gap: 2px;
        width: 120px;
        height: 120px;
        padding: 0;
        border-radius: 50%;
        background: var(--surface);
        border: 2px solid color-mix(in srgb, var(--accent) 45%, var(--line));
        box-shadow: 0 0 0 10px var(--bg);
        color: var(--fg);
      }
      .m-label {
        color: var(--fg-3);
      }
      .m-num {
        font-size: 2.6rem;
      }
      .privacy {
        grid-template-columns: 1.1fr 1fr;
      }
      .final {
        padding: var(--space-16) var(--space-12);
      }
    }
  `,
})
export class LandingPage {
  /** from the route data: '' is French, /en is English */
  readonly lang = input<Lang>('fr');

  protected readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);
  private readonly install = inject(InstallService);
  private readonly router = inject(Router);

  protected readonly calendar = CALENDAR;
  protected readonly home = computed(() => (this.i18n.lang() === 'en' ? '/en' : '/'));
  protected readonly otherHome = computed(() => (this.i18n.lang() === 'en' ? '/' : '/en'));
  protected readonly stops = computed(() => this.i18n.get<Stop[]>('landing.stops') ?? []);
  protected readonly privacyPoints = computed(() => this.i18n.get<string[]>('landing.privacyPoints') ?? []);
  protected readonly faq = computed(() => this.i18n.get<{ q: string; a: string }[]>('landing.faq') ?? []);
  /** the screens of the preview (pictures: scripts/screenshots.mjs → public/shots) */
  protected readonly shots = computed(() => this.i18n.get<{ key: string; title: string; text: string; alt: string }[]>('landing.previewShots') ?? []);

  /** one screen further or back (the row snaps on each screen) */
  protected slide(row: HTMLElement, dir: number): void {
    const first = row.querySelector<HTMLElement>('.shot');
    const step = first ? first.offsetWidth + parseFloat(getComputedStyle(row).columnGap || '24') : 300;
    row.scrollBy({ left: dir * step, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  constructor() {
    // the router scrolls to the anchors itself, and ignores scroll-margin: leave room for the sticky header
    const doc = inject(DOCUMENT);
    inject(ViewportScroller).setOffset(() => [0, (doc.querySelector('header.bar')?.getBoundingClientRect().height ?? 64) + 16]);
    // running as the installed app (opened from its icon, or this very tab just moved into the app
    // window after installing it on a computer): straight into the app
    effect(() => {
      if (this.install.standalone()) void this.router.navigateByUrl('/app');
    });
  }

  ngOnInit(): void {
    this.i18n.set(this.lang());
    this.seo.set({
      title: this.i18n.t('meta.title'),
      description: this.i18n.t('meta.description'),
      path: this.lang() === 'en' ? '/en' : '/',
      alternates: { fr: '/', en: '/en' },
    });
  }
}
