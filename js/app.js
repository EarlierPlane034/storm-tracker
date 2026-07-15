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
import { renderStormList, openStormSheet, initStormSheet } from './ui/stormPanel.js';
import { renderAlerts } from './ui/alertsPanel.js';
import { renderAiPanel } from './ui/aiPanel.js';
import { renderSettings } from './ui/settingsPanel.js';
import { renderLayers } from './ui/layersPanel.js';
import { showToast } from './ui/toasts.js';
import * as geo from './location.js';
import { evaluateAlerts, evaluateStorms, requestNotificationPermission } from './alerts/alertEngine.js';
import { fetchRadarSites } from './api/iem.js';

let mapView, radar;
let analyses = [];

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
  wireChrome();
  wireAnimBar();

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
  geo.onLocation((loc) => {
    mapView.setUserLocation(loc.lat, loc.lon, loc.accuracyM);
    sources.setFocusPoint(loc.lat, loc.lon);
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

/** Run the full analysis pass and repaint every consumer. */
const reanalyze = debounce(() => {
  const { cells, alerts, reports, environment } = sources.getState();
  const user = geo.getLocation();
  analyses = analyzeStorms(cells, environment, alerts, reports, user);

  mapView.renderCells(analyses);
  renderStormList(analyses, { onSelect: openStormSheet });
  renderAiPanel(analyses, environment, alerts, user, { onSelect: openStormSheet });
  updateTicker(user);
  updateGpsChip(user);
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
  const near = analyses.filter((a) => a.userRel).sort((x, y) => x.userRel.distKm - y.userRel.distKm)[0];
  if (!near) { chip.hidden = true; return; }
  chip.hidden = false;
  const eta = near.userRel.etaMin != null ? ` · ETA ~${near.userRel.etaMin} min` : '';
  chip.innerHTML = `Nearest storm <strong>${fmtDistance(near.userRel.distKm, settings.units)}</strong>${eta}`;
  chip.onclick = () => openStormSheet(near);
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
        showToast(`Saved ${name} to favorites.`);
        rerenderSettings();
        return;
      }
      if (path.startsWith('radar') || path === 'colorTable') radar.applyStyle();
      if (path === 'refreshIntervalSec' || path === 'animFps') radar.rebuild();
      if (path === 'units' || path === 'monitorRadiusKm' || path === 'aiSensitivity' || path === 'showTechnical') reanalyze();
    },
    onRequestNotifications: requestNotificationPermission,
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
