/**
 * HTTP client: timeout, exponential-backoff retries, per-URL soft caching,
 * and a global feed-health signal the UI subscribes to.
 */
import { CONFIG } from '../config.js';

const softCache = new Map(); // url -> { at, data }
const healthListeners = new Set();
let lastSuccessAt = Date.now();
let consecutiveFailures = 0;

export function onFeedHealth(fn) {
  healthListeners.add(fn);
}

function reportHealth() {
  const state = !navigator.onLine || consecutiveFailures >= 3
    ? 'offline'
    : Date.now() - lastSuccessAt > CONFIG.refresh.staleAfterMs
      ? 'stale'
      : 'ok';
  healthListeners.forEach((fn) => fn(state));
}

setInterval(reportHealth, 15_000);
window.addEventListener('online', reportHealth);
window.addEventListener('offline', reportHealth);

/**
 * GET JSON with retries. Options:
 *  - cacheMs: serve a recent in-memory copy without hitting the network.
 *  - headers: extra request headers.
 */
export async function getJSON(url, { cacheMs = 0, headers = {} } = {}) {
  if (cacheMs > 0) {
    const hit = softCache.get(url);
    if (hit && Date.now() - hit.at < cacheMs) return hit.data;
  }

  let lastErr;
  for (let attempt = 0; attempt <= CONFIG.network.retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) =>
        setTimeout(r, CONFIG.network.retryBaseMs * 2 ** (attempt - 1)));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.network.timeoutMs);
    try {
      const resp = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/geo+json, application/json;q=0.9, */*;q=0.5', ...headers },
      });
      clearTimeout(timer);
      if (!resp.ok) {
        // 4xx are not retryable; 5xx/429 are.
        if (resp.status < 500 && resp.status !== 429) {
          throw Object.assign(new Error(`HTTP ${resp.status} for ${url}`), { fatal: true });
        }
        throw new Error(`HTTP ${resp.status} for ${url}`);
      }
      const data = await resp.json();
      softCache.set(url, { at: Date.now(), data });
      lastSuccessAt = Date.now();
      consecutiveFailures = 0;
      reportHealth();
      return data;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.fatal) break;
    }
  }
  consecutiveFailures++;
  reportHealth();
  // Fall back to any soft-cached copy rather than failing the caller.
  const stale = softCache.get(url);
  if (stale) return stale.data;
  throw lastErr;
}
