/**
 * GPS wrapper: continuous watch with graceful degradation (permission
 * denied / unavailable), throttled updates to subscribers.
 */
let current = null;   // {lat, lon, accuracyM, at}
let watchId = null;
const listeners = new Set();

export function getLocation() {
  return current;
}

export function onLocation(fn) {
  listeners.add(fn);
  if (current) fn(current);
  return () => listeners.delete(fn);
}

export function startWatching({ onError } = {}) {
  if (!('geolocation' in navigator)) {
    onError?.('Geolocation is not supported on this device/browser.');
    return;
  }
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const next = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        at: Date.now(),
      };
      // Throttle: ignore jitter under ~100 m within 15 s.
      if (current && Date.now() - current.at < 15_000 &&
          Math.abs(next.lat - current.lat) < 0.001 &&
          Math.abs(next.lon - current.lon) < 0.001) return;
      current = next;
      listeners.forEach((fn) => fn(current));
    },
    (err) => {
      onError?.(err.code === err.PERMISSION_DENIED
        ? 'Location permission denied. Distance and arrival features are disabled — you can still browse radar anywhere.'
        : 'Unable to determine location right now.');
    },
    { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
  );
}

export function stopWatching() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}
