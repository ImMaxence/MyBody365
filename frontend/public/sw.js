// The service worker of MyBody365: Angular's (offline app, notifications, taps on them), plus the red
// badge on the app icon. Each notification received while the app is not on screen adds one; opening the
// app clears it (core/pwa/app-badge.ts sends MB_BADGE_CLEAR). The count is kept in a tiny cache entry,
// as a service worker may be stopped between two notifications.

// 1.18: the pictures of the app (progress photos, recipes, products, avatars) are kept on the phone for the screens
// without network. Their address never serves another picture (a new id, or a ?v= version), so a kept copy is always
// right: it is given at once, without asking the network. This listener comes before Angular's worker, which then never
// sees these requests. The page deletes this cache at sign-out (core/user-data.service.ts).
const IMAGES = 'mb-images';
const IMAGES_MAX = 400;
const IMAGE_URL = /^\/api\/(photos\/[^/]+\/(full|thumb)|recipes\/[^/]+\/image\/(full|thumb)|foods\/[^/]+\/image|users\/[^/]+\/avatar)$/;
let puts = 0;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !IMAGE_URL.test(url.pathname)) return;
  event.stopImmediatePropagation();
  event.respondWith(picture(req, event));
});

async function picture(req, event) {
  let cache = null;
  try {
    cache = await caches.open(IMAGES);
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
  } catch {
    /* no cache storage: the network only */
  }
  let res;
  try {
    res = await fetch(req);
  } catch {
    // no network and never kept: the screen shows its placeholder
    return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
  }
  if (cache && res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').startsWith('image/')) {
    event.waitUntil(
      cache
        .put(req, res.clone())
        .then(() => (++puts % 20 === 0 ? trim(cache) : undefined))
        .catch(() => undefined),
    );
  }
  return res;
}

/** the oldest pictures go beyond IMAGES_MAX (a cache lists its entries in the order they were put) */
async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - IMAGES_MAX;
  if (extra <= 0) return;
  for (const k of keys.slice(0, extra + 40)) await cache.delete(k);
}

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
