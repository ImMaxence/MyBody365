import { EnvironmentInjector, afterNextRender, effect, untracked } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { I18nService } from '../i18n/i18n.service';
import { Network } from '../offline/network';

/** the logo stays this long at least in the app (from the page's start): its ring has drawn, it never just flickers */
const MIN_MS = 750;
/** whatever happens (no network, a guard that never answers), the screen is not hidden longer than this */
const MAX_MS = 8000;
const LEAVE_MS = 340;
/** 1.16: once the first screen is drawn, what was handed to holdSplash is waited for this long at most */
const HOLD_MS = 1200;
/** 1.20.2: without network, the message stays this long at least, to be read */
const OFFLINE_READ_MS = 1600;

const held: Promise<unknown>[] = [];

/**
 * 1.16: something to load while the logo is on screen (the tabs and Today's data, core/nav/warm-up.ts): the logo leaves
 * once it is there, or HOLD_MS after the first screen is drawn, whichever comes first
 */
export function holdSplash(p: Promise<unknown>): void {
  held.push(p.catch(() => undefined));
}

/**
 * 1.15: the logo in the middle of the screen while the app starts (#boot in index.html, drawn before any script): it
 * leaves with a fade and a little zoom once the first screen is drawn. The prerendered public pages never carry it
 * (removed while they are rendered), the other pages drawn in the browser drop it at once. 1.16: it also waits for the
 * five tabs and Today's data loaded behind it (holdSplash). 1.20.2: without network (the phone says so, or a request
 * never gets through), its ring stops and it says « Pas de connexion internet · Accès en mode hors ligne » long enough
 * to be read; the app then opens on what the phone kept.
 */
export function bootSplash(doc: Document, router: Router, injector: EnvironmentInjector, server: boolean): void {
  const el = doc.getElementById('boot');
  if (server) {
    el?.remove();
    doc.getElementById('boot-style')?.remove();
    return;
  }
  if (!el) return;
  const inApp = /^\/app(\/|$)/.test(doc.location.pathname);
  let gone = false;
  let stopWatching = () => {};
  const leave = () => {
    if (gone) return;
    gone = true;
    stopWatching();
    el.classList.add('leaving');
    setTimeout(() => {
      el.remove();
      doc.getElementById('boot-style')?.remove();
    }, LEAVE_MS + 40);
  };
  if (!inApp) {
    leave();
    return;
  }
  // the earliest moment it may leave (page time): the minimum, later while the offline message is read
  let notBefore = MIN_MS;
  const leaveWhenAllowed = () => {
    const wait = notBefore - performance.now();
    if (wait > 0) setTimeout(leaveWhenAllowed, wait);
    else leave();
  };
  stopWatching = watchNetwork(doc, el, injector, () => {
    notBefore = Math.max(notBefore, performance.now() + OFFLINE_READ_MS);
  });
  const safety = setTimeout(leave, MAX_MS);
  router.events
    .pipe(
      filter((e) => e instanceof NavigationEnd || e instanceof NavigationError),
      take(1),
    )
    .subscribe(() => {
      // the first screen drawn, then the rest of the minimum
      afterNextRender(
        () => {
          clearTimeout(safety);
          // 1.16: then the tabs and Today's data, for a moment at most
          void Promise.race([Promise.all(held), new Promise((resolve) => setTimeout(resolve, HOLD_MS))]).then(leaveWhenAllowed);
        },
        { injector },
      );
    });
}

/**
 * 1.20.2: the network away while the logo is up: its ring stops and the message comes under it (in the app's language,
 * it follows the texts once they are there); back meanwhile, both go. Gives back how to stop watching.
 */
function watchNetwork(doc: Document, el: HTMLElement, injector: EnvironmentInjector, shown: () => void): () => void {
  const net = injector.get(Network);
  const i18n = injector.get(I18nService);
  let note: HTMLElement | null = null;
  const ref = effect(
    () => {
      const offline = !net.online();
      const title = i18n.t('offline.bootTitle');
      const text = i18n.t('offline.bootText');
      untracked(() => {
        if (!offline) {
          note?.remove();
          note = null;
          el.classList.remove('offline');
          return;
        }
        if (!note) {
          note = doc.createElement('p');
          note.className = 'boot-off';
          note.setAttribute('role', 'status');
          note.append(doc.createElement('strong'), doc.createElement('span'));
          el.append(note);
          el.classList.add('offline');
          // said to a screen reader too: the logo stays an image without words
          el.querySelector('svg')?.setAttribute('aria-hidden', 'true');
          el.removeAttribute('aria-hidden');
          shown();
        }
        note.children[0].textContent = title;
        note.children[1].textContent = text;
      });
    },
    { injector },
  );
  return () => ref.destroy();
}
