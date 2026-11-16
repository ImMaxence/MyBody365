import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SessionStore } from '../../core/auth/session.store';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { IconComponent } from '../../shared/icon.component';

/** where a back swipe has to start: the left edge of the screen, like iOS */
const EDGE = 28;
/** how far (px) or how fast (px/ms) the screen must travel to go back */
const DISTANCE = 0.33;
const SPEED = 0.5;

/**
 * The installed app: screens above, the tab bar below (hidden on sign-in and onboarding). Screens
 * opened from a tab are pushed on a stack (core/nav/stack-navigation.ts); a swipe from the left edge
 * pops them, the screen following the finger (an installed app on iPhone has no back gesture).
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, TranslatePipe, IconComponent],
  host: {
    '(touchstart)': 'swipeStart($event)',
    '(touchmove)': 'swipeMove($event)',
    '(touchend)': 'swipeEnd($event)',
    '(touchcancel)': 'swipeCancel()',
  },
  template: `
    <div id="main" class="screen" #screen>
      <router-outlet />
    </div>
    @if (showTabs()) {
      <nav class="tabbar" [attr.aria-label]="'nav.main' | t" [style.--i]="activeIndex()">
        <span class="indicator" [class.hidden]="activeIndex() < 0" aria-hidden="true"></span>
        @for (tab of tabs; track tab.path; let i = $index) {
          <a [routerLink]="tab.path" [replaceUrl]="true" [class.active]="activeIndex() === i" [attr.aria-current]="activeIndex() === i ? 'page' : null">
            <span class="ico"><app-icon [name]="tab.icon" [size]="23" [stroke]="activeIndex() === i ? 2.3 : 1.9" /></span>
            <span class="lbl">{{ tab.label | t }}</span>
          </a>
        }
      </nav>
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }
    .screen {
      min-height: 100dvh;
      background: var(--bg);
    }
    /* a floating capsule; the highlight slides from tab to tab */
    .tabbar {
      /* captured on its own during screen transitions: it never slides */
      view-transition-name: tabbar;
      position: fixed;
      left: 50%;
      bottom: calc(var(--safe-bottom) + 10px);
      z-index: 100;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      width: min(calc(100% - 20px), 460px);
      padding: 6px;
      border-radius: 30px;
      transform: translateX(-50%);
      background: var(--glass);
      backdrop-filter: saturate(1.8) blur(22px);
      -webkit-backdrop-filter: saturate(1.8) blur(22px);
      border: 1px solid var(--glass-line);
      box-shadow:
        0 18px 40px -18px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
    .indicator {
      position: absolute;
      top: 6px;
      bottom: 6px;
      left: 6px;
      width: calc((100% - 12px) / 5);
      border-radius: 24px;
      background: var(--accent-soft);
      transform: translateX(calc(var(--i, 0) * 100%));
      transition:
        transform 520ms cubic-bezier(0.34, 1.4, 0.5, 1),
        opacity var(--dur-2);
    }
    .indicator.hidden {
      opacity: 0;
    }
    a {
      position: relative;
      z-index: 1;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 1px;
      height: 56px;
      color: var(--fg-3);
      font-size: 10.5px;
      font-weight: 650;
      -webkit-tap-highlight-color: transparent;
      transition: color var(--dur-2);
    }
    .ico {
      display: grid;
      place-items: center;
      height: 28px;
      transition: transform var(--dur-1) var(--ease-out);
    }
    a:active .ico {
      transform: scale(0.86);
    }
    a.active {
      color: var(--accent-text);
    }
    a.active .ico {
      animation: tab-pop 480ms cubic-bezier(0.34, 1.6, 0.5, 1);
    }
    @keyframes tab-pop {
      0% {
        transform: scale(0.7) translateY(3px);
      }
      60% {
        transform: scale(1.12) translateY(-2px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .indicator {
        transition: none;
      }
    }
  `,
})
export class ShellComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly stack = inject(StackNavigation);
  protected readonly i18n = inject(I18nService);
  private readonly screen = viewChild.required<ElementRef<HTMLElement>>('screen');
  private readonly url = signal(this.router.url);

  protected readonly tabs = [
    { path: '/app', icon: 'home', label: 'nav.today', exact: true },
    { path: '/app/meals', icon: 'utensils', label: 'nav.meals', exact: false },
    { path: '/app/photos', icon: 'camera', label: 'nav.photos', exact: false },
    { path: '/app/progress', icon: 'chart', label: 'nav.progress', exact: false },
    { path: '/app/account', icon: 'user', label: 'nav.profile', exact: false },
  ];

  protected readonly showTabs = computed(() => {
    const url = this.url();
    const account = this.session.account();
    return account?.onboarded === true && account.profileComplete && !/^\/app\/(login|request|welcome)/.test(url);
  });

  /** the tab of the current screen (pushed screens belong to the tab they were opened from) */
  protected readonly activeIndex = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    if (/^\/app\/(account|admin)/.test(path)) return 4;
    if (path.startsWith('/app/progress')) return 3;
    if (path.startsWith('/app/photos')) return 2;
    if (path.startsWith('/app/meals')) return 1;
    return path === '/app' || path === '/app/' ? 0 : -1;
  });

  private swipe: { x: number; y: number; t: number; dx: number; locked: boolean } | null = null;

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  // ── back swipe ─────────────────────────────────────────────────────────────
  protected swipeStart(e: TouchEvent): void {
    const touch = e.touches[0];
    if (e.touches.length !== 1 || touch.clientX > EDGE || this.stack.depth() === 0) return;
    this.swipe = { x: touch.clientX, y: touch.clientY, t: e.timeStamp, dx: 0, locked: false };
  }

  protected swipeMove(e: TouchEvent): void {
    if (!this.swipe) return;
    const touch = e.touches[0];
    const dx = Math.max(0, touch.clientX - this.swipe.x);
    const dy = Math.abs(touch.clientY - this.swipe.y);
    if (!this.swipe.locked) {
      // a vertical scroll that happens to start at the edge is left alone
      if (dy > 10 && dy > dx) {
        this.swipe = null;
        return;
      }
      if (dx < 8) return;
      this.swipe.locked = true;
    }
    this.swipe.dx = dx;
    const el = this.screen().nativeElement;
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px)`;
    el.style.boxShadow = '-12px 0 40px rgba(0, 0, 0, 0.28)';
  }

  protected swipeEnd(e: TouchEvent): void {
    if (!this.swipe) return;
    const { dx, t, locked } = this.swipe;
    this.swipe = null;
    if (!locked) return;
    const el = this.screen().nativeElement;
    const speed = dx / Math.max(1, e.timeStamp - t);
    if (dx > window.innerWidth * DISTANCE || speed > SPEED) {
      this.stack.releaseSwipe(el, dx);
    } else {
      // not far enough: the screen springs back
      el.style.transition = 'transform 260ms cubic-bezier(0.2, 0.85, 0.25, 1)';
      el.style.transform = '';
      setTimeout(() => {
        el.style.transition = '';
        el.style.boxShadow = '';
      }, 280);
    }
  }

  protected swipeCancel(): void {
    this.swipe = null;
    const el = this.screen().nativeElement;
    el.style.transition = '';
    el.style.transform = '';
    el.style.boxShadow = '';
  }
}
