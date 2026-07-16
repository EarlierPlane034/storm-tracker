/**
 * Background push client: registers this phone with the user's own
 * Cloudflare push worker so severe-weather notifications arrive even
 * when StormLens is fully closed.
 *
 * Requires: the PWA installed to the Home Screen (iOS 16.4+), Notification
 * permission, and the worker URL pasted in Settings.
 */
import { settings, setSetting } from '../storage.js';
import { showToast } from '../ui/toasts.js';
import { getLocation } from '../location.js';
import { haversineKm } from '../utils.js';

function normalizeUrl(url) {
  let u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

function b64uToUint8(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`push server HTTP ${res.status}`);
  return res.json();
}

/** Full connect flow, driven from the Settings button. */
export async function connectPush(rawUrl) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Background push is not supported here. On iPhone: install StormLens to the Home Screen (iOS 16.4+) and open it from there.', { level: 'warn', ttlMs: 12000 });
    return false;
  }
  const url = normalizeUrl(rawUrl);
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('Notification permission was not granted — background alerts stay off.', { level: 'warn' });
      return false;
    }

    const { publicKey } = await (await fetch(`${url}/vapid`)).json();
    if (!publicKey) throw new Error('worker /vapid gave no key');

    const reg = await navigator.serviceWorker.ready;
    // Re-subscribe cleanly if a stale subscription exists for another key.
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe().catch(() => {});
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64uToUint8(publicKey),
    });

    await sendRegistration(url, sub);
    setSetting('pushServerUrl', url);
    setSetting('pushEnabled', true);
    showToast('✅ Background alerts are ON. Warnings near you (and your favorites) will reach this phone even when StormLens is closed.', { ttlMs: 12000 });
    return true;
  } catch (err) {
    console.warn('[push] connect failed', err);
    showToast(`Couldn't connect to the push worker (${err.message}). Double-check the URL — it should look like stormlens-push.yourname.workers.dev`, { level: 'warn', ttlMs: 12000 });
    return false;
  }
}

async function sendRegistration(url, sub) {
  const loc = getLocation();
  await postJSON(`${url}/subscribe`, {
    subscription: sub.toJSON(),
    lat: loc?.lat ?? settings.favorites[0]?.lat ?? null,
    lon: loc?.lon ?? settings.favorites[0]?.lon ?? null,
    radiusKm: settings.monitorRadiusKm,
    prefs: settings.alertsEnabled,
    places: settings.favorites.map((f) => ({ name: f.name, lat: f.lat, lon: f.lon })),
  });
}

let lastSynced = null; // {lat, lon, at}

/**
 * Keep the worker's copy of our location/preferences fresh. Called on
 * location updates and settings changes; throttled to meaningful moves.
 */
export async function syncPush() {
  if (!settings.pushEnabled || !settings.pushServerUrl) return;
  const loc = getLocation();
  if (loc && lastSynced &&
      haversineKm(loc.lat, loc.lon, lastSynced.lat, lastSynced.lon) < 20 &&
      Date.now() - lastSynced.at < 30 * 60_000) {
    return; // hasn't moved meaningfully
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await sendRegistration(settings.pushServerUrl, sub);
    if (loc) lastSynced = { lat: loc.lat, lon: loc.lon, at: Date.now() };
  } catch (err) {
    console.warn('[push] sync failed', err);
  }
}

export async function disconnectPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      if (settings.pushServerUrl) {
        await postJSON(`${settings.pushServerUrl}/unsubscribe`, { endpoint: sub.endpoint }).catch(() => {});
      }
      await sub.unsubscribe();
    }
  } catch { /* best effort */ }
  setSetting('pushEnabled', false);
  showToast('Background alerts turned off.');
}
