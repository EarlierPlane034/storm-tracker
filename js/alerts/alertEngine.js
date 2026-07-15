/**
 * Alert engine.
 *
 * Watches every analysis/alert pass for user-relevant events:
 *   - new NWS warnings/watches containing or near the user,
 *   - meaningful rotation detected inside the monitoring radius,
 *   - a storm's tornado chance rising a band,
 *   - rapid intensification nearby,
 *   - a storm projected to reach the user's location.
 *
 * Delivery: in-app toast always; system Notification (via the service
 * worker) when permission is granted and the page is hidden. Each event is
 * de-duplicated so the same warning doesn't re-fire every refresh.
 */
import { settings } from '../storage.js';
import { fmtDistance } from '../utils.js';
import { showToast } from '../ui/toasts.js';
import { distToAlert } from '../ui/alertsPanel.js';

const fired = new Map();           // dedupe key -> timestamp
const lastTorBand = new Map();     // cellId -> tornado band label
const DEDUPE_MS = 30 * 60_000;

function once(key, fn) {
  const prev = fired.get(key);
  if (prev && Date.now() - prev < DEDUPE_MS) return;
  fired.set(key, Date.now());
  // Opportunistic cleanup.
  if (fired.size > 300) {
    const cutoff = Date.now() - DEDUPE_MS;
    for (const [k, t] of fired) if (t < cutoff) fired.delete(k);
  }
  fn();
}

function deliver(title, body, level = 'warn') {
  showToast(`${title} — ${body}`, { level, ttlMs: 12_000 });
  if (settings.notifySensitivity === 'off') return;
  if (settings.notifySensitivity === 'high-only' && level !== 'danger') return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' &&
      document.visibilityState === 'hidden') {
    navigator.serviceWorker?.ready.then((reg) => {
      reg.active?.postMessage({ type: 'notify', title, body, tag: title });
    });
  }
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') {
    showToast('Notifications are not supported here. On iOS, install StormLens to your Home Screen first (Share → Add to Home Screen).', { level: 'warn' });
    return false;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('Notifications enabled. High-threat events will alert you when the app is in the background.');
    return true;
  }
  showToast('Notifications not enabled — in-app banners will still appear.', { level: 'warn' });
  return false;
}

/** Evaluate NWS alerts relative to the user. */
export function evaluateAlerts(alerts, user) {
  if (!user) return;
  const en = settings.alertsEnabled;
  for (const a of alerts) {
    const d = distToAlert(a, user);
    const inIt = d === 0;
    const near = d < 60;
    if (!inIt && !near) continue;

    const where = inIt ? 'at your location' : `${fmtDistance(d, settings.units)} from you`;
    if (a.kind === 'tor-warning' && en.tornadoWarning) {
      once(`alert:${a.id}`, () => deliver(
        a.isEmergency ? '🚨 TORNADO EMERGENCY' : '🌪 Tornado Warning',
        `${a.areaDesc} — ${where}. Take shelter guidance from NWS immediately.`, 'danger'));
    } else if (a.kind === 'svr-warning' && en.severeWarning) {
      once(`alert:${a.id}`, () => deliver('⛈ Severe Thunderstorm Warning', `${a.areaDesc} — ${where}.`, inIt ? 'danger' : 'warn'));
    } else if (a.kind === 'ffw-warning' && en.flashFloodWarning) {
      once(`alert:${a.id}`, () => deliver('💧 Flash Flood Warning', `${a.areaDesc} — ${where}.`, inIt ? 'danger' : 'warn'));
    } else if (a.kind === 'tor-watch' && en.tornadoWatch && inIt) {
      once(`alert:${a.id}`, () => deliver('Tornado Watch', `A tornado watch includes your location (${a.areaDesc}).`, 'warn'));
    } else if (a.kind === 'svr-watch' && en.severeWatch && inIt) {
      once(`alert:${a.id}`, () => deliver('Severe Thunderstorm Watch', `A severe watch includes your location.`, 'warn'));
    }
  }
}

/** Evaluate AI storm analyses relative to the user. */
export function evaluateStorms(analyses, user) {
  if (!user) return;
  const en = settings.alertsEnabled;
  const radius = settings.monitorRadiusKm;

  for (const a of analyses) {
    if (!a.userRel || a.userRel.distKm > radius) continue;
    const c = a.cell;
    const dist = fmtDistance(a.userRel.distKm, settings.units);

    // Significant rotation detected.
    if (en.rotationDetected && (c.tvs || c.meso >= 3)) {
      once(`rot:${c.id}:${c.tvs ? 'tvs' : 'meso'}`, () => deliver(
        c.tvs ? '🌪 Tornado Vortex Signature' : 'Significant rotation detected',
        `${a.type.label} ${dist} away is showing ${c.tvs ? 'a TVS' : `a rank-${c.meso} mesocyclone`}. AI tornado chance: ${a.tornado.label} (${a.tornado.pct}). Unofficial estimate.`,
        'danger'));
    }

    // Tornado chance band rising.
    const prevBand = lastTorBand.get(c.id);
    lastTorBand.set(c.id, a.tornado.label);
    if (en.torChanceRising && prevBand && bandRank(a.tornado.label) > bandRank(prevBand) && a.tornado.score >= 41) {
      once(`torband:${c.id}:${a.tornado.label}`, () => deliver(
        'Tornado chance increasing',
        `AI estimate for the storm ${dist} away rose to ${a.tornado.label} (${a.tornado.pct}) in the next ~${a.tornado.windowMin} min. Not an official warning.`,
        'danger'));
    }

    // Rapid intensification.
    if (en.rapidIntensification && a.factors.some((f) => f.text.includes('rapidly intensifying'))) {
      once(`ri:${c.id}`, () => deliver('Rapid intensification', `${a.type.label} ${dist} away is intensifying quickly (score ${a.severeScore}/100).`, 'warn'));
    }

    // Storm projected to arrive at the user.
    if (en.approachingStorm && a.userRel.etaMin != null && a.userRel.etaMin <= 45 && a.severeScore >= 41) {
      once(`eta:${c.id}`, () => deliver(
        'Storm approaching your location',
        `${a.type.label} (score ${a.severeScore}/100) is ~${a.userRel.etaMin} min out, ${dist} away.`,
        a.severeScore >= 61 ? 'danger' : 'warn'));
    }
  }
}

function bandRank(label) {
  return ['None', 'Very Low', 'Low', 'Moderate', 'High', 'Very High'].indexOf(label);
}
