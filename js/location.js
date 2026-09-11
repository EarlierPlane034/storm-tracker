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
        speedMps: pos.coords.speed,     // null when stationary/unavailable
        headingDeg: pos.coords.heading, // direction of travel, null if unknown
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
        ? 'Location permission denied. Long-press anywhere on the map to set your location manually.'
        : 'Unable to determine location right now. Long-press the map to set it manually.');
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

/** Manual override when GPS is denied/unavailable — user long-presses the
 * map to drop a pin instead. Feeds the same subscribers as a real GPS fix. */
export function setManualLocation(lat, lon) {
  current = { lat, lon, accuracyM: null, speedMps: null, headingDeg: null, at: Date.now(), manual: true };
  listeners.forEach((fn) => fn(current));
}
