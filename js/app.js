/**
 * StormLens entry point — wires data sources, the radar controller, the
 * analysis engine and every UI surface together.
 */
import { CONFIG } from './config.js';
import { settings, setSetting } from './storage.js';
import { el, fmtTimeUTC, fmtDistance, debounce } from './utils.js';
import { onFeedHealth } from './api/client.js';
import * as sources from './api/sources.js';
import { RadarController } from './radar/radarController.js';
import { MapView } from './ui/mapView.js';
import { analyzeStorms } from './analysis/stormAnalyzer.js';
import { rememberAnalysis, tickerHeadline } from './analysis/narrative.js';
import { renderStormList, openStormSheet, initStormSheet, configureStormSheet } from './ui/stormPanel.js';
import { renderAlerts } from './ui/alertsPanel.js';
import { renderAiPanel } from './ui/aiPanel.js';
import { renderSettings } from './ui/settingsPanel.js';
import { renderLayers } from './ui/layersPanel.js';
import { showToast } from './ui/toasts.js';
import * as geo from './location.js';
import { evaluateAlerts, evaluateStorms, requestNotificationPermission } from './alerts/alertEngine.js';
import { connectPush, disconnectPush, syncPush } from './alerts/pushClient.js';
import { initChat, openChat } from './ui/chatAssistant.js';
import { bearingDeg, compassDir, fmtSpeed, sunTimes } from './utils.js';
import { addNote } from './ui/journal.js';
import { fetchRadarSites } from './api/iem.js';
import { getJSON } from './api/client.js';
import { haversineKm, destinationPoint } from './utils.js';

let mapView, radar;
let analyses = [];
let route = null; // { name, coords: [[lat,lon],...] }

/** Leaflet loads via a deferred CDN script; wait for it before map init. */
function whenLeafletReady() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve();
    let tries = 0;
    const t = setInterval(() => {
      if (window.L) { clearInterval(t); resolve(); }
      else if (++tries > 100) { clearInterval(t); reject(new Error('Leaflet failed to load')); }
    }, 100);
  });
}

async function main() {
  registerServiceWorker();
  await whenLeafletReady();

  // ---- Map + radar ---------------------------------------------------------
  mapView = new MapView('map', { onCellTap: (a) => openStormSheet(a) });
  radar = new RadarController(mapView.map, {
    onFrameChange: updateAnimBar,
    onProductChange: (prod) => { renderProductRail(); renderLegend(prod); },
    onNotice: (msg) => showToast(msg, { level: 'warn', ttlMs: 9000 }),
  });
  radar.rebuild();
  renderProductRail();
  renderLegend(radar.currentProduct);
  initStormSheet();
  configureStormSheet({
    ghost: (latlon) => (latlon ? mapView.setGhost(latlon[0], latlon[1]) : mapView.clearGhost()),
  });
  wireChrome();
  wireAnimBar();
  applyTheme();
  initChat({ analysesProvider: () => analyses, onSelect: selectStorm });
  document.getElementById('btn-chat').addEventListener('click', openChat);
  applyChaseMode();

  // Recompute nearest radar site + environment focus when the map settles.
  mapView.map.on('moveend', debounce(async () => {
    const c = mapView.map.getCenter();
    sources.setFocusPoint(c.lat, c.lng);
    const site = await radar.pickSite(c.lat, c.lng);
    if (settings.layers.radarSites && site) {
      mapView.renderRadarSites(await fetchRadarSites(), site.id);
    }
  }, 600));

  // ---- Data subscriptions ----------------------------------------------------
  sources.subscribe('cells', reanalyze);
  sources.subscribe('alerts', (alerts) => {
    mapView.renderAlerts(alerts);
    renderAlerts(alerts, geo.getLocation());
    evaluateAlerts(alerts, geo.getLocation());
    reanalyze();
  });
  sources.subscribe('reports', (reports) => mapView.renderReports(reports));
  sources.subscribe('outlook', (features) => mapView.renderOutlook(features));
  sources.subscribe('obs', (obs) => mapView.renderObservations(obs));
  sources.subscribe('environment', reanalyze);
  sources.start();

  // ---- GPS ---------------------------------------------------------------------
  let hadFix = false;
  geo.onLocation((loc) => {
    if (!hadFix) {
      hadFix = true;
      document.getElementById('btn-locate').style.color = 'var(--accent)';
      showToast(`📍 Location active (±${Math.round(loc.accuracyM)} m). Distances, arrival times and proximity alerts are now personalized.`);
    }
    mapView.setUserLocation(loc.lat, loc.lon, loc.accuracyM);
    sources.setFocusPoint(loc.lat, loc.lon);
    syncPush(); // keep the push worker's copy of our location fresh
    reanalyze();
  });
  document.getElementById('btn-locate').addEventListener('click', () => {
    geo.startWatching({ onError: (msg) => showToast(msg, { level: 'warn' }) });
    const loc = geo.getLocation();
    if (loc) {
      mapView.flyToUser(loc.lat, loc.lon);
    } else {
      showToast('Locating…');
      const off = geo.onLocation((l) => { mapView.flyToUser(l.lat, l.lon); off(); });
    }
  });
  // Ask for location lazily on first launch (user gesture not required for prompt on most browsers).
  geo.startWatching({ onError: () => { /* silent on startup; button re-tries with message */ } });

  // ---- Status chrome --------------------------------------------------------------
  onFeedHealth((state) => {
    const dot = document.getElementById('net-dot');
    dot.className = `net-dot ${state === 'ok' ? '' : state}`.trim();
  });
  setInterval(() => {
    document.getElementById('data-clock').textContent = fmtTimeUTC(new Date());
  }, 1000);

  if (!settings.firstRunDone) {
    document.getElementById('app').classList.add('show-disclaimer');
    showToast('Welcome to StormLens. Tip: on iPhone, open the Share menu and “Add to Home Screen” to install. AI analysis here is unofficial — always follow NWS warnings.', { ttlMs: 14_000 });
    setSetting('firstRunDone', true);
  }
}

/** Zoom the map to a storm and open its detail sheet (from any list). */
function selectStorm(a) {
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.panel === 'map'));
  mapView.focusCell(a.cell);
  openStormSheet(a);
}

/** Apply the user's display filters (Settings → AI analyst). */
function visibleAnalyses(user) {
  return analyses.filter((a) =>
    a.severeScore >= (settings.minCellScore || 0) &&
    (!settings.onlyNearby || !user ||
      (a.userRel && a.userRel.distKm <= settings.monitorRadiusKm)));
}

/** Run the full analysis pass and repaint every consumer. */
const reanalyze = debounce(() => {
  const { cells, alerts, reports, environment } = sources.getState();
  const user = geo.getLocation();
  analyses = analyzeStorms(cells, environment, alerts, reports, user);

  const visible = visibleAnalyses(user);
  const hiddenCount = analyses.length - visible.length;
  mapView.renderCells(visible);
  renderStormList(visible, { onSelect: selectStorm, hiddenCount });
  const st = sources.getState();
  renderAiPanel(visible, environment, alerts, user, {
    onSelect: selectStorm, hiddenCount,
    outlook: st.outlook, week: st.week,
    outlookDay2: st.outlookDay2, outlookDay3: st.outlookDay3,
    forecast: st.forecast,
    onOpenChat: openChat,
  });
  updateChaseHud(user);
  updateTicker(user);
  updateGpsChip(user);
  // Alerts always consider every storm — display filters never mute safety.
  evaluateStorms(analyses, user);

  // Remember AFTER alerting so change explanations compare to the last pass.
  analyses.forEach(rememberAnalysis);
}, 400);

function updateTicker(user) {
  const ticker = document.getElementById('ai-ticker');
  const text = document.getElementById('ai-ticker-text');
  ticker.hidden = false;
  text.textContent = tickerHeadline(analyses, user);
}

function updateGpsChip(user) {
  const chip = document.getElementById('gps-chip');
  if (!user) { chip.hidden = true; return; }
  chip.hidden = false;
  const near = analyses.filter((a) => a.userRel).sort((x, y) => x.userRel.distKm - y.userRel.distKm)[0];
  if (!near) {
    // Always confirm GPS is working, even on quiet days.
    chip.innerHTML = '📍 GPS active — no storms being tracked near you';
    chip.onclick = null;
    return;
  }
  const eta = near.userRel.etaMin != null ? ` · ETA ~${near.userRel.etaMin} min` : '';
  chip.innerHTML = `📍 Nearest storm <strong>${fmtDistance(near.userRel.distKm, settings.units)}</strong>${eta}`;
  chip.onclick = () => selectStorm(near);
}

/* ---------------- Radar product rail + animation bar ---------------- */

function renderProductRail() {
  const rail = document.getElementById('product-rail');
  rail.textContent = '';
  for (const prod of radar.productList) {
    const active = prod.id === radar.productId;
    const tiltSuffix = active && prod.tilts && radar.tiltIndex > 0 ? ` T${radar.tiltIndex + 1}` : '';
    const btn = el('button', {
      class: `product-btn ${active ? 'active' : ''} ${prod.available ? '' : 'unavailable'}`,
      text: `${prod.label}${tiltSuffix}`,
      title: prod.name,
      onclick: () => {
        if (active && prod.tilts) {
          const tilt = radar.cycleTilt();
          if (tilt != null) showToast(`${prod.name} — tilt ${tilt + 1}`, { ttlMs: 2000 });
          renderProductRail();
        } else {
          radar.setProduct(prod.id);
        }
      },
    });
    rail.appendChild(btn);
  }
}

function renderLegend(prod) {
  const legend = document.getElementById('legend');
  if (!prod?.legend) { legend.hidden = true; return; }
  legend.hidden = false;
  legend.textContent = '';
  legend.appendChild(el('div', { text: `${prod.name} (${prod.unit})` }));
  const bar = el('div', { class: 'legend-bar' });
  for (const color of prod.legend.stops) bar.appendChild(el('span', { style: `background:${color}` }));
  legend.appendChild(bar);
  legend.appendChild(el('div', { class: 'legend-labels' }, [
    el('span', { text: String(prod.legend.min) }),
    el('span', { text: prod.legend.note || '' }),
    el('span', { text: String(prod.legend.max) }),
  ]));
}

function wireAnimBar() {
  const play = document.getElementById('btn-play');
  const scrub = document.getElementById('anim-scrub');
  play.addEventListener('click', () => {
    const playing = radar.toggle();
    play.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
  });
  scrub.addEventListener('input', () => {
    radar.stop();
    play.innerHTML = '&#9654;';
    radar.showFrame(Number(scrub.value));
  });
}

function updateAnimBar({ index, total, offsetMin, isLive }) {
  const scrub = document.getElementById('anim-scrub');
  const time = document.getElementById('anim-time');
  scrub.max = String(total - 1);
  scrub.value = String(index);
  time.textContent = isLive ? 'LIVE' : `-${offsetMin} min`;
  time.className = `anim-time ${isLive ? 'live' : ''}`;
  // Time-matched playback: storm markers slide back to where they were.
  mapView?.offsetCells(isLive ? 0 : offsetMin);
}

/** Dim red night theme (Settings → Radar → Night mode). */
function applyTheme() {
  document.body.classList.toggle('night', !!settings.nightMode);
}

/* ---------------- Chase mode: HUD + screen wake lock ---------------- */

let wakeLock = null;

async function applyChaseMode() {
  const hud = document.getElementById('chase-hud');
  if (settings.chaseMode) {
    updateChaseHud(geo.getLocation());
    // Keep the screen on during a chase (released automatically when off).
    try {
      wakeLock = await navigator.wakeLock?.request?.('screen');
      // Re-acquire when returning to the foreground (iOS releases it).
      document.addEventListener('visibilitychange', reacquireWakeLock);
    } catch { /* unsupported — HUD still works */ }
  } else {
    hud.hidden = true;
    document.removeEventListener('visibilitychange', reacquireWakeLock);
    try { await wakeLock?.release?.(); } catch { /* already gone */ }
    wakeLock = null;
  }
}

async function reacquireWakeLock() {
  if (settings.chaseMode && document.visibilityState === 'visible') {
    try { wakeLock = await navigator.wakeLock?.request?.('screen'); } catch { /* ok */ }
  }
}

/** Target = most dangerous storm within radius; shows chase geometry. */
function updateChaseHud(user) {
  const hud = document.getElementById('chase-hud');
  if (!settings.chaseMode) { hud.hidden = true; return; }
  hud.hidden = false;

  if (!user) {
    hud.innerHTML = '<div class="hud-title">CHASE MODE</div><div class="muted">Waiting for GPS… tap ⌖ and allow location.</div>';
    return;
  }
  const target = analyses.find((a) => a.userRel && a.userRel.distKm <= settings.monitorRadiusKm);
  const mySpeed = user.speedMps != null && user.speedMps >= 0
    ? fmtSpeed(user.speedMps * 1.94384, settings.units) : '—';
  const daylight = daylightText(user);

  const noteBtn = '<button class="product-btn hud-note-btn" id="hud-note-btn">📝</button>';
  if (!target) {
    hud.innerHTML = `<div class="hud-title">CHASE MODE ${noteBtn}</div><div class="muted">No target storms in radius · your speed ${escapeHud(mySpeed)} · ${daylight}</div>`;
  } else {
    const brg = bearingDeg(user.lat, user.lon, target.cell.lat, target.cell.lon);
    const eta = target.userRel.etaMin != null ? `~${target.userRel.etaMin} min to you` : 'not tracking to you';
    hud.innerHTML = `
      <div class="hud-title">TARGET · ${escapeHud(target.cell.id)} · ${target.severeScore}/100 ${noteBtn}</div>
      <div class="hud-grid">
        <span>Look <strong>${compassDir(brg)}</strong> <span class="hud-arrow" style="transform:rotate(${Math.round(brg)}deg)">➤</span></span>
        <span>${escapeHud(fmtDistance(target.userRel.distKm, settings.units))}</span>
        <span>${escapeHud(eta)}</span>
        <span>You: ${escapeHud(mySpeed)}</span>
        <span>${daylight}</span>
      </div>
      <div class="hud-note">${target.type.id.includes('supercell') || target.type.id === 'supercell'
        ? 'Right-movers are typically safest viewed from the SE, storm at your NW — never enter the rain core, and keep a paved escape route south or east.'
        : 'Stay out of the storm\'s path and ahead of the gust front.'} Unofficial guidance — your safety decisions are your own.</div>`;
    hud.onclick = () => openStormSheet(target);
  }
  // Quick chase-journal note (stopPropagation so it doesn't open the sheet).
  const btn = document.getElementById('hud-note-btn');
  if (btn) {
    btn.onclick = (e) => {
      e.stopPropagation();
      const text = window.prompt('Chase note (saved with time + GPS):');
      if (text?.trim()) addNote(text.trim(), user);
    };
  }
}

/** "Sunset 8:42 PM · 2h 10m of light" or an after-dark caution. */
function daylightText(user) {
  const { sunset } = sunTimes(user.lat, user.lon);
  if (!sunset) return '';
  const mins = Math.round((sunset.getTime() - Date.now()) / 60000);
  if (mins <= 0 || mins > 24 * 60) return '🌙 after dark — extra caution';
  const hm = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  return `☀️ ${hm} of light left`;
}

// The HUD builds its HTML from analysed data; escape anything stringy.
function escapeHud(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

/**
 * Route check: geocode the destination (Nominatim), fetch a driving route
 * (OSRM public server), draw it, and report which tracked storms are near
 * the path now or within their projected hour of movement.
 */
async function checkRoute(dest) {
  if (dest === null) {
    route = null;
    mapView.clearRoute();
    showToast('Route cleared.');
    return;
  }
  showToast(`Looking up “${dest}”…`, { ttlMs: 4000 });
  try {
    const found = await getJSON(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(dest)}`);
    if (!found?.length) {
      showToast(`Couldn't find “${dest}” — try a city + state.`, { level: 'warn' });
      return;
    }
    const to = { lat: Number(found[0].lat), lon: Number(found[0].lon), name: found[0].display_name.split(',')[0] };
    const from = geo.getLocation()
      || { lat: mapView.map.getCenter().lat, lon: mapView.map.getCenter().lng };

    const osrm = await getJSON(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`);
    const line = osrm?.routes?.[0]?.geometry?.coordinates;
    if (!line?.length) {
      showToast('No drivable route found between those points.', { level: 'warn' });
      return;
    }
    const coords = line.map(([lon, lat]) => [lat, lon]);
    route = { name: to.name, coords };
    mapView.setRoute(coords);

    // Which storms come within 25 km of the path (now or projected)?
    const sampled = coords.filter((_, i) => i % Math.max(1, Math.floor(coords.length / 80)) === 0);
    const hits = [];
    for (const a of analyses) {
      const positions = [[a.cell.lat, a.cell.lon]];
      if (a.cell.moveDirDeg != null && a.cell.moveSpeedKts > 3) {
        for (const min of [30, 60]) {
          const distKm = (a.cell.moveSpeedKts * 1.852 * min) / 60;
          positions.push(destinationPoint(a.cell.lat, a.cell.lon, a.cell.moveDirDeg, distKm));
        }
      }
      const minD = Math.min(...positions.flatMap(([plat, plon]) =>
        sampled.map(([rlat, rlon]) => haversineKm(plat, plon, rlat, rlon))));
      if (minD < 25) hits.push({ a, minD });
    }
    hits.sort((x, y) => y.a.severeScore - x.a.severeScore);
    if (!hits.length) {
      showToast(`Route to ${to.name} drawn — no tracked storms within 25 km of your path right now. Conditions change; recheck as you go.`, { ttlMs: 12000 });
    } else {
      const worst = hits[0];
      showToast(
        `⚠️ Route to ${to.name}: ${hits.length} storm${hits.length === 1 ? '' : 's'} near your path` +
        ` — worst is a ${worst.a.type.label} (score ${worst.a.severeScore}/100). Tap its circle on the map for details.`,
        { level: worst.a.severeScore >= 61 ? 'danger' : 'warn', ttlMs: 14000 });
    }
  } catch (err) {
    console.warn('[route] check failed', err);
    showToast('Route check failed — the free routing service may be busy. Try again shortly.', { level: 'warn' });
  }
}
/* ---------------- Panels / tabs / settings ---------------- */

function wireChrome() {
  const panels = ['storms', 'alerts', 'ai', 'settings'];
  const tabs = document.querySelectorAll('.tab');

  const showPanel = (name) => {
    for (const p of [...panels, 'layers']) {
      document.getElementById(`panel-${p}`).hidden = p !== name;
    }
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.panel === (name || 'map')));
    if (name === 'settings') rerenderSettings();
  };

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const name = tab.dataset.panel;
    showPanel(name === 'map' ? null : name);
  }));
  document.querySelectorAll('.panel-close').forEach((btn) =>
    btn.addEventListener('click', () => showPanel(null)));
  document.getElementById('btn-menu').addEventListener('click', () => {
    const layersPanel = document.getElementById('panel-layers');
    if (layersPanel.hidden) {
      renderLayers({ onChanged: () => mapView.syncLayerVisibility() });
      showPanel('layers');
    } else {
      showPanel(null);
    }
  });

  const rerenderSettings = () => renderSettings({
    onChanged: (path) => {
      if (path === 'favorites.add') {
        const c = mapView.map.getCenter();
        const name = `Spot ${settings.favorites.length + 1} (${c.lat.toFixed(1)}, ${c.lng.toFixed(1)})`;
        settings.favorites.push({ name, lat: c.lat, lon: c.lng });
        setSetting('favorites', settings.favorites);
        showToast(`Saved ${name} to favorites. The alert engine now watches it too.`);
        rerenderSettings();
        return;
      }
      if (path.startsWith('favorites.goto.')) {
        const fav = settings.favorites[Number(path.split('.')[2])];
        if (fav) {
          showPanel(null);
          mapView.map.flyTo([fav.lat, fav.lon], Math.max(mapView.map.getZoom(), 8), { duration: 0.8 });
        }
        return;
      }
      if (path === 'journal.refresh') { rerenderSettings(); return; }
      if (path === 'nightMode') applyTheme();
      if (path === 'chaseMode') applyChaseMode();
      if (path.startsWith('radar') || path === 'colorTable') radar.applyStyle();
      if (path === 'refreshIntervalSec' || path === 'animFps') radar.rebuild();
      if (['units', 'monitorRadiusKm', 'aiSensitivity', 'showTechnical',
        'minCellScore', 'onlyNearby'].includes(path)) reanalyze();
      // Alert prefs / radius / favorites also live on the push worker.
      if (path.startsWith('alertsEnabled') || path === 'monitorRadiusKm' || path === 'favorites') syncPush();
    },
    onRequestNotifications: requestNotificationPermission,
    onRouteCheck: (dest) => { showPanel(null); checkRoute(dest); },
    onConnectPush: async (url) => { if (await connectPush(url)) rerenderSettings(); },
    onDisconnectPush: async () => { await disconnectPush(); rerenderSettings(); },
  });
}

/* ---------------- Service worker ---------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      // Queue a background-sync refresh where the platform supports it.
      if ('sync' in reg) {
        try { await reg.sync.register('stormlens-refresh'); } catch { /* unsupported */ }
      }
    } catch (err) {
      console.warn('[sw] registration failed', err);
    }
  });
}

main().catch((err) => {
  console.error('[app] fatal init error', err);
  showToast('StormLens failed to start — check your connection and reload.', { level: 'danger', ttlMs: 60_000 });
});
