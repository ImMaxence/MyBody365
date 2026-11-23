import { ChangeDetectionStrategy, Component, DOCUMENT, DestroyRef, ElementRef, PLATFORM_ID, inject, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { StackNavigation } from '../../core/nav/stack-navigation';
import { IconComponent } from '../../shared/icon.component';

/**
 * 1.18: the bar of an iPhone app's screen once its large title has scrolled away: a translucent band under the status bar
 * with the title, small and centred, and on a pushed screen the chevron that goes back. It shows as the screen's heading
 * passes under it, and goes as it comes back. The screen keeps its own heading and back button for screen readers: this
 * bar is a picture of them (aria-hidden, its button out of the keyboard's way).
 */
@Component({
  selector: 'app-compact-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="bar" #bar [class.shown]="shown()" aria-hidden="true">
      @if (back()) {
        <button type="button" class="back" tabindex="-1" (click)="goBack()">
          <app-icon name="chevronLeft" [size]="24" [stroke]="2.3" />
        </button>
      }
      <!-- drawn by CSS from the attribute: a picture of the heading, never a second copy of its text in the page -->
      <span class="title" [attr.data-title]="title()"></span>
    </div>
  `,
  styles: `
    .bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 97;
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr) 56px;
      align-items: center;
      height: calc(var(--safe-top) + 46px);
      padding-top: var(--safe-top);
      background: color-mix(in srgb, var(--bg) 90%, transparent);
      backdrop-filter: saturate(1.8) blur(20px);
      -webkit-backdrop-filter: saturate(1.8) blur(20px);
      border-bottom: 1px solid var(--line);
      opacity: 0;
      pointer-events: none;
      transition: opacity 180ms ease;
    }
    .bar.shown {
      opacity: 1;
      pointer-events: auto;
    }
    .title {
      grid-column: 2;
      overflow: hidden;
      font-size: 1.0625rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
      transform: translateY(6px);
      transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .bar.shown .title {
      transform: none;
    }
    .title::before {
      content: attr(data-title);
    }
    .back {
      grid-column: 1;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      margin-left: 6px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--accent-text);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: opacity var(--dur-1);
    }
    .back:active {
      opacity: 0.45;
    }
    @media (prefers-reduced-motion: reduce) {
      .bar,
      .title {
        transition: none;
      }
    }
  `,
})
export class CompactBarComponent {
  private readonly router = inject(Router);
  private readonly stack = inject(StackNavigation);
  private readonly doc = inject(DOCUMENT);
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  protected readonly title = signal('');
  protected readonly back = signal(false);
  protected readonly shown = signal(false);
  /** the large title of the screen on view */
  private heading: HTMLElement | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const win = this.doc.defaultView;
    if (!win) return;
    // read at each scroll (one rectangle): the browsers send at most one scroll event a frame
    const onScroll = () => this.check();
    win.addEventListener('scroll', onScroll, { passive: true });
    const timers: ReturnType<typeof setTimeout>[] = [];
    // the first screen: its navigation ended before this bar was drawn (the shell draws it then)
    for (const ms of [50, 420, 900]) timers.push(setTimeout(() => this.find(), ms));
    const sub = this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.show(false);
      if (e instanceof NavigationEnd) {
        // once the screen is drawn, then once its transition and its scroll put back are over
        for (const ms of [50, 420, 900]) timers.push(setTimeout(() => this.find(), ms));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('scroll', onScroll);
      sub.unsubscribe();
      timers.forEach(clearTimeout);
    });
  }

  /** a back swipe lifts the screen: the bar goes with it */
  hide(): void {
    this.show(false);
  }

  protected goBack(): void {
    this.stack.back(this.stack.parentUrl());
  }

  private find(): void {
    const h = this.doc.querySelector<HTMLElement>('#main h1');
    const r = h?.getBoundingClientRect();
    // a heading hidden for screen readers only is no title to show
    this.heading = h && r && r.width > 2 && !h.classList.contains('sr-only') ? h : null;
    if (this.heading) {
      const text = (this.heading.dataset['title'] ?? this.heading.textContent ?? '').replace(/\s+/g, ' ').trim();
      this.title.set(text);
      this.back.set(this.stack.depth() > 0);
    }
    this.check();
  }

  private check(): void {
    const h = this.heading;
    if (!h || !h.isConnected || this.stack.busy()) {
      this.show(false);
      return;
    }
    const line = this.bar().nativeElement.getBoundingClientRect().height;
    this.show(h.getBoundingClientRect().bottom < line - 2);
  }

  private show(on: boolean): void {
    if (this.shown() !== on) this.shown.set(on);
  }
}
