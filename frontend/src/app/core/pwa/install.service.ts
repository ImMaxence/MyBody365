import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Platform = 'ios' | 'android' | 'desktop';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const BROWSER_KEY = 'mb.browser';

/**
 * Knows whether the app runs installed (standalone), which platform it is on, and keeps
 * Chrome / Edge's install prompt to offer a one-tap install on the landing page.
 */
@Injectable({ providedIn: 'root' })
export class InstallService {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly platform = signal<Platform>('android');
  readonly standalone = signal(false);
  readonly canPrompt = signal(false);
  readonly installed = signal(false);
  private deferred: BeforeInstallPromptEvent | null = null;

  constructor() {
    if (!this.browser) return;
    this.platform.set(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
    this.standalone.set(isStandalone());
    // Chrome on a computer moves the current tab into the new app window when the app is installed:
    // the page does not reload, only the display mode changes
    for (const mode of DISPLAY_MODES) {
      matchMedia(`(display-mode: ${mode})`).addEventListener('change', () => this.standalone.set(isStandalone()));
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canPrompt.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.installed.set(true);
      this.canPrompt.set(false);
      this.deferred = null;
    });
  }

  async prompt(): Promise<boolean> {
    if (!this.deferred) return false;
    await this.deferred.prompt();
    const choice = await this.deferred.userChoice;
    this.deferred = null;
    this.canPrompt.set(false);
    return choice.outcome === 'accepted';
  }

  /**
   * The app itself only opens installed. On localhost, ?browser=1 lifts the gate for the current
   * tab (development, end-to-end tests).
   */
  allowedInBrowser(): boolean {
    if (!this.browser) return true;
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!local) return false;
    try {
      if (new URLSearchParams(location.search).get('browser') === '1') sessionStorage.setItem(BROWSER_KEY, '1');
      return sessionStorage.getItem(BROWSER_KEY) === '1';
    } catch {
      return false;
    }
  }

  canOpenApp(): boolean {
    return this.standalone() || this.allowedInBrowser();
  }
}

export function detectPlatform(ua: string, touchPoints = 0): Platform {
  const s = ua.toLowerCase();
  // iPadOS reports itself as a Mac: a touch screen gives it away
  if (/iphone|ipad|ipod/.test(s) || (s.includes('macintosh') && touchPoints > 1)) return 'ios';
  if (s.includes('android')) return 'android';
  return 'desktop';
}

const DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || DISPLAY_MODES.some((m) => matchMedia(`(display-mode: ${m})`).matches);
}
