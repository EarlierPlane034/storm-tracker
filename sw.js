/* ==========================================================================
 * StormLens service worker.
 *
 * Strategy:
 *  - App shell (HTML/CSS/JS/icons + Leaflet CDN files): cache-first,
 *    pre-cached at install so the app opens offline.
 *  - Weather APIs (JSON): network-first with a short-lived fallback cache,
 *    so the last-known analysis survives brief connectivity drops.
 *  - Radar/map tiles: network-only with an opportunistic bounded cache —
 *    tiles are time-sensitive; stale reflectivity is worse than none, so
 *    cached tiles are served only when offline.
 * ========================================================================== */

const VERSION = 'stormlens-v7';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const TILE_CACHE = `${VERSION}-tiles`;
const TILE_LIMIT = 400; // max cached tiles (battery/storage friendly)

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './js/app.js',
  './js/config.js',
  './js/utils.js',
  './js/storage.js',
  './js/location.js',
  './js/api/client.js',
  './js/api/nws.js',
  './js/api/iem.js',
  './js/api/openmeteo.js',
  './js/api/sources.js',
  './js/radar/products.js',
  './js/radar/radarController.js',
  './js/analysis/stormAnalyzer.js',
  './js/analysis/tornadoIntelligence.js',
  './js/analysis/trends.js',
  './js/analysis/narrative.js',
  './js/ui/mapView.js',
  './js/ui/stormPanel.js',
  './js/ui/alertsPanel.js',
  './js/ui/aiPanel.js',
  './js/ui/settingsPanel.js',
  './js/ui/layersPanel.js',
  './js/ui/trendChart.js',
  './js/ui/toasts.js',
  './js/ui/chatAssistant.js',
  './js/ui/journal.js',
  './js/alerts/alertEngine.js',
  './js/alerts/pushClient.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isTileRequest(url) {
  return /tile\.py|tile\.openstreetmap|basemaps\.cartocdn|arcgisonline|\/tiles?\//.test(url.href);
}

function isDataRequest(url) {
  return /api\.weather\.gov|mesonet\.agron\.iastate\.edu\/(geojson|json|api)|api\.open-meteo\.com|spc\.noaa\.gov/.test(url.href);
}

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > limit) {
    // Delete oldest entries (Cache API preserves insertion order).
    await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Weather data: network-first, fall back to last cached copy.
  if (isDataRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(DATA_CACHE).then((c) => c.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Tiles: network-only, cached copy served only as an offline fallback.
  if (isTileRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(TILE_CACHE).then((c) => c.put(event.request, copy))
              .then(() => trimCache(TILE_CACHE, TILE_LIMIT));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (app shell): cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

/* Background sync (where supported) lets a queued refresh run when
 * connectivity returns. iOS Safari currently ignores this; the app also
 * refreshes on visibilitychange as a fallback. */
self.addEventListener('sync', (event) => {
  if (event.tag === 'stormlens-refresh') {
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage({ type: 'refresh' }))
      )
    );
  }
});

/* Show notifications posted from the page (used by the alert engine when
 * the page is backgrounded and Notification permission is granted). */
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg && msg.type === 'notify' && self.registration.showNotification) {
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: msg.tag || 'stormlens',
    });
  }
});

/* Background Web Push from the user's own Cloudflare worker
 * (see cloudflare/worker.js + docs/PUSH_SETUP.md). Fires even when the
 * app is fully closed, on iOS 16.4+ Home Screen installs. */
self.addEventListener('push', (event) => {
  let payload = { title: 'StormLens weather alert', body: '' };
  try { payload = event.data.json(); } catch { /* keep defaults */ }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: payload.tag || 'stormlens-push',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
