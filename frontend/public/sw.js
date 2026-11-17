// The service worker of MyBody365: Angular's (offline app, notifications, taps on them), plus the red
// badge on the app icon. Each notification received while the app is not on screen adds one; opening the
// app clears it (core/pwa/app-badge.ts sends MB_BADGE_CLEAR). The count is kept in a tiny cache entry,
// as a service worker may be stopped between two notifications.
importScripts('./ngsw-worker.js');

const BADGE_CACHE = 'mb-badge';
const BADGE_KEY = '/__mb-badge';

async function readCount() {
  try {
    const hit = await (await caches.open(BADGE_CACHE)).match(BADGE_KEY);
    return hit ? Number(await hit.text()) || 0 : 0;
  } catch {
    return 0;
  }
}

async function writeCount(n) {
  try {
    await (await caches.open(BADGE_CACHE)).put(BADGE_KEY, new Response(String(n)));
  } catch {
    /* no cache: the badge shows 1 */
  }
}

self.addEventListener('push', (event) => {
  if (!('setAppBadge' in self.navigator)) return;
  event.waitUntil(
    (async () => {
      // the app is open and on screen: the notification is enough
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === 'visible')) return;
      const n = Math.min(99, (await readCount()) + 1);
      await writeCount(n);
      await self.navigator.setAppBadge(n);
    })().catch(() => undefined),
  );
});

// the app clears the badge itself (navigator.clearAppBadge in the page); here only the count starts over.
// (Clearing it from the worker too crashed the page in Chromium.)
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'MB_BADGE_CLEAR') return;
  event.waitUntil(writeCount(0));
});
