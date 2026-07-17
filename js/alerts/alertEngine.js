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
import { fmtDistance, haversineKm } from '../utils.js';
import { showToast } from '../ui/toasts.js';
import { distToAlert } from '../ui/alertsPanel.js';

/** Places the engine watches: the user's GPS position + saved favorites. */
export function watchedPlaces(user) {
  const places = [];
  if (user) places.push({ name: 'you', lat: user.lat, lon: user.lon, isUser: true });
  for (const f of settings.favorites || []) {
    if (f.lat != null) places.push({ name: f.name, lat: f.lat, lon: f.lon, isUser: false });
  }
  return places;
}

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

/* ---- Alert history: every delivered event, persisted for day review ---- */
const LOG_KEY = 'stormlens.alertlog.v1';

export function getAlertLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; }
}

export function clearAlertLog() {
  try { localStorage.removeItem(LOG_KEY); } catch { /* ok */ }
}

function logEvent(title, body, level) {
  try {
    const log = getAlertLog();
    log.push({ t: Date.now(), title, body: body.slice(0, 200), level });
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-300)));
  } catch { /* storage full — history is best-effort */ }
}

/* ---- Spanish safety strings (alert titles + shelter instruction) ---- */
const ES = {
  '🌪 Tornado Warning': '🌪 Aviso de Tornado',
  '🚨 TORNADO EMERGENCY': '🚨 EMERGENCIA DE TORNADO',
  '⛈ Severe Thunderstorm Warning': '⛈ Aviso de Tormenta Severa',
  '💧 Flash Flood Warning': '💧 Aviso de Inundación Repentina',
  'Tornado Watch': 'Vigilancia de Tornado',
  'Severe Thunderstorm Watch': 'Vigilancia de Tormenta Severa',
  '🌪 Tornado Vortex Signature': '🌪 Firma de Vórtice de Tornado',
  'Significant rotation detected': 'Rotación significativa detectada',
  'Tornado chance increasing': 'Probabilidad de tornado en aumento',
  'Rapid intensification': 'Intensificación rápida',
  'Storm approaching your location': 'Tormenta acercándose a su ubicación',
  'Take shelter guidance from NWS immediately.': '¡Refúgiese inmediatamente según las indicaciones del NWS!',
};

function localize(s) {
  if (settings.language !== 'es') return s;
  let out = ES[s] ?? s;
  for (const [en, es] of Object.entries(ES)) out = out.replace(en, es);
  return out;
}

/* ---- Haptic patterns (navigator.vibrate — Android only; iOS blocks it) ---- */
function buzz(level) {
  if (!settings.hapticAlerts || !navigator.vibrate) return;
  navigator.vibrate(level === 'danger' ? [400, 120, 400, 120, 400] : [200, 100, 200]);
}

let speaking = 0;

/**
 * Speak an alert aloud (Web Speech API). With the phone on CarPlay or
 * Bluetooth this comes out of the car speakers — the closest a web app
 * can get to CarPlay integration.
 */
function speak(text) {
  if (!settings.voiceAlerts || typeof speechSynthesis === 'undefined') return;
  if (speaking >= 2) return; // don't queue-flood during outbreaks
  const u = new SpeechSynthesisUtterance(text.replace(/[🌪⛈💧🚨📍☀️🌙]/g, ''));
  u.rate = 0.95;
  u.lang = settings.language === 'es' ? 'es-US' : 'en-US';
  speaking++;
  u.onend = () => { speaking = Math.max(0, speaking - 1); };
  u.onerror = u.onend;
  speechSynthesis.speak(u);
}

function deliver(title, body, level = 'warn') {
  title = localize(title);
  body = localize(body);
  logEvent(title, body, level);
  buzz(level);
  showToast(`${title} — ${body}`, { level, ttlMs: 12_000 });
  if (level === 'danger') speak(`${title}. ${body}`);
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

/** Evaluate NWS alerts against every watched place (GPS + favorites). */
export function evaluateAlerts(alerts, user) {
  const en = settings.alertsEnabled;
  for (const place of watchedPlaces(user)) {
    for (const a of alerts) {
      const d = distToAlert(a, place);
      const inIt = d === 0;
      const near = d < 60;
      if (!inIt && !near) continue;

      const who = place.isUser ? 'you' : `“${place.name}”`;
      const where = inIt
        ? (place.isUser ? 'at your location' : `at ${who}`)
        : `${fmtDistance(d, settings.units)} from ${who}`;
      const key = `alert:${a.id}:${place.name}`;
      if (a.kind === 'tor-warning' && en.tornadoWarning) {
        once(key, () => deliver(
          a.isEmergency ? '🚨 TORNADO EMERGENCY' : '🌪 Tornado Warning',
          `${a.areaDesc} — ${where}. Take shelter guidance from NWS immediately.`, 'danger'));
      } else if (a.kind === 'svr-warning' && en.severeWarning) {
        once(key, () => deliver('⛈ Severe Thunderstorm Warning', `${a.areaDesc} — ${where}.`, inIt ? 'danger' : 'warn'));
      } else if (a.kind === 'ffw-warning' && en.flashFloodWarning) {
        once(key, () => deliver('💧 Flash Flood Warning', `${a.areaDesc} — ${where}.`, inIt ? 'danger' : 'warn'));
      } else if (a.kind === 'tor-watch' && en.tornadoWatch && inIt) {
        once(key, () => deliver('Tornado Watch', `A tornado watch includes ${place.isUser ? 'your location' : who} (${a.areaDesc}).`, 'warn'));
      } else if (a.kind === 'svr-watch' && en.severeWatch && inIt) {
        once(key, () => deliver('Severe Thunderstorm Watch', `A severe watch includes ${place.isUser ? 'your location' : who}.`, 'warn'));
      }
    }
  }
}

/** Evaluate AI storm analyses relative to the user (and favorites). */
export function evaluateStorms(analyses, user) {
  const en = settings.alertsEnabled;
  const radius = settings.monitorRadiusKm;

  // Favorites get the high-signal events only (rotation near the place).
  for (const place of watchedPlaces(user).filter((p) => !p.isUser)) {
    if (!en.rotationDetected) break;
    for (const a of analyses) {
      const c = a.cell;
      if (!c.tvs && c.meso < 3) continue;
      const d = haversineKm(place.lat, place.lon, c.lat, c.lon);
      if (d > radius) continue;
      once(`rot:${c.id}:fav:${place.name}`, () => deliver(
        c.tvs ? '🌪 Rotation near a saved place' : 'Rotation near a saved place',
        `${a.type.label} ${fmtDistance(d, settings.units)} from “${place.name}” is showing ${c.tvs ? 'a TVS' : `a rank-${c.meso} mesocyclone`}. Unofficial estimate.`,
        'danger'));
    }
  }

  if (!user) return;
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
