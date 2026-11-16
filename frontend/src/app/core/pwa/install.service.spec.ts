import { TestBed } from '@angular/core/testing';
import { InstallService, detectPlatform } from './install.service';

describe('detectPlatform', () => {
  it('recognises iPhone, iPad (even disguised as a Mac), Android and computers', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe('desktop');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140')).toBe('desktop');
  });
});

describe('InstallService', () => {
  /** a fake matchMedia whose "(display-mode: standalone)" answer can be flipped */
  function fakeMedia() {
    const lists = new Map<string, { matches: boolean; listeners: (() => void)[] }>();
    const matchMedia = (query: string) => {
      if (!lists.has(query)) lists.set(query, { matches: false, listeners: [] });
      const l = lists.get(query)!;
      return {
        get matches() {
          return l.matches;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => l.listeners.push(fn),
        removeEventListener: () => undefined,
      } as unknown as MediaQueryList;
    };
    const set = (query: string, matches: boolean) => {
      const l = lists.get(query) ?? { matches, listeners: [] };
      l.matches = matches;
      lists.set(query, l);
      l.listeners.forEach((fn) => fn());
    };
    return { matchMedia, set };
  }

  let original: typeof window.matchMedia;
  beforeEach(() => (original = window.matchMedia));
  afterEach(() => (window.matchMedia = original));

  it('notices when the current tab becomes the installed app (Chrome on a computer)', () => {
    const media = fakeMedia();
    window.matchMedia = media.matchMedia;
    const install = TestBed.inject(InstallService);
    expect(install.standalone()).toBe(false);
    expect(install.canOpenApp()).toBe(false);

    media.set('(display-mode: standalone)', true);
    expect(install.standalone()).toBe(true);
    expect(install.canOpenApp()).toBe(true);
  });

  it('keeps the install prompt and forgets it once installed', () => {
    window.matchMedia = fakeMedia().matchMedia;
    const install = TestBed.inject(InstallService);
    const prompt = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(prompt);
    expect(install.canPrompt()).toBe(true);
    window.dispatchEvent(new Event('appinstalled'));
    expect(install.canPrompt()).toBe(false);
    expect(install.installed()).toBe(true);
  });
});
