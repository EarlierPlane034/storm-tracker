/**
 * StormLens entry point — wires data sources, the radar controller, the
 * analysis engine and every UI surface together.
 */
import { CONFIG } from './config.js';
import { settings, setSetting } from './storage.js';
import { el, fmtTimeUTC, fmtDistance, debounce, fmtRelTime } from './utils.js';
import { onFeedHealth, getLastSuccessAt } from './api/client.js';
import * as sources from './api/sources.js';
import { RadarController } from './radar/radarController.js';
import { MapView } from './ui/mapView.js';
import { analyzeStorms } from './analysis/stormAnalyzer.js';
import { rememberAnalysis, pruneNarrative, tickerHeadline } from './analysis/narrative.js';
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
import { bearingDeg, compassDir, fmtSpeed, sunTimes, angleDiffDeg } from './utils.js';
import { addNote, getNotes, getTrack, recordTrackPoint } from './ui/journal.js';
import { captureMap } from './ui/snapshot.js';
import { renderReports, submitReport, fetchCommunityReports } from './ui/reportsPanel.js';
import { renderAbout } from './ui/aboutPanel.js';
import { fetchRadarSites } from './api/iem.js';
import { getJSON } from './api/client.js';
import { haversineKm, destinationPoint } from './utils.js';
import { AdvancedAnalysisPanel } from './ui/advancedAnalysisPanel.js';
import { Week3FeaturesPanel } from './ui/week3FeaturesPanel.js';
import { FeatureDashboard } from './ui/featureDashboard.js';
import { showQuickStartGuide } from './ui/quickStartGuide.js';
import { recordStormMetrics, pruneStormHistory } from './analysis/stormTrendAnalysis.js';
import { searchCities } from './data/cities.js';
import { searchGlossary } from './data/glossary.js';

let mapView, radar, advancedPanel, week3Panel;
let analyses = [];
let route = null; // { name, coords: [[lat,lon],...] }
let communityReports = [];
let targetMarker = null;

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
  mapView = new MapView('map', {
    onCellTap: (a) => openStormSheet(a),
    onSetManualLocation: (lat, lon) => {
      geo.setManualLocation(lat, lon);
      showToast('📍 Location set manually. Distances and arrival times now use this point.');
    },
  });
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

  // Initialize advanced analysis panel (Week 2)
  const analysisPanelContainer = document.getElementById('analysis-panel');
  if (analysisPanelContainer) {
    advancedPanel = new AdvancedAnalysisPanel('analysis-panel', mapView.map);
  }

  // Initialize Week 3 features panel
  const week3Container = document.getElementById('week3-panel');
  if (week3Container) {
    week3Panel = new Week3FeaturesPanel('week3-panel', mapView.map);
  }

  wireChrome();
  wireAnimBar();
  applyTheme();
  syncTabbarHeight();
  window.addEventListener('resize', debounce(syncTabbarHeight, 150));
  initChat({ analysesProvider: () => analyses, onSelect: selectStorm });
  document.getElementById('btn-chat').addEventListener('click', openChat);
  applyChaseMode();

  // Recompute nearest radar site + environment focus when the map settles.
  mapView.map.on('moveend', debounce(async () => {
    const c = mapView.map.getCenter();
    sources.setFocusPoint(c.lat, c.lng);
    const site = await radar.pickSite(c.lat, c.lng);
    renderProductRail(); // keep the 📡 site chip current
    if (settings.layers.radarSites && site) {
      mapView.renderRadarSites(await fetchRadarSites(), site.id,
        (id) => radar.setSite(id, c.lat, c.lng).then(renderProductRail));
    }
  }, 600));
  mapView.map.on('click', () => { document.getElementById('site-picker').hidden = true; });

  // ---- Data subscriptions ----------------------------------------------------
  sources.subscribe('cells', reanalyze);
  sources.subscribe('alerts', (alerts) => {
    mapView.renderAlerts(alerts);      // map polygons always current
    markPanelsStale(['alerts']);       // list renders when looked at
    updateAlertBadge(alerts);          // tab badge stays live even off-screen
    evaluateAlerts(alerts, geo.getLocation());
    reanalyze();
  });
  sources.subscribe('reports', () => refreshReportsView());
  // Community reports from the user's own worker DB (no-op until set up).
  const pollCommunity = async () => {
    const next = await fetchCommunityReports();
    if (next.length !== communityReports.length) {
      communityReports = next;
      refreshReportsView();
    } else {
      communityReports = next;
    }
  };
  pollCommunity();
  setInterval(pollCommunity, 120_000);
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
    if (settings.followMe) mapView.map.panTo([loc.lat, loc.lon]);
    if (settings.chaseMode) recordTrackPoint(loc); // chase-day breadcrumb
    syncPush(); // keep the push worker's copy of our location fresh
    reanalyze();
  });
  document.getElementById('btn-help').addEventListener('click', showQuickStartGuide);
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

  wireLocationSearch();
  wireGlossary();
  wireKeyboardShortcuts();

  // ---- Status chrome --------------------------------------------------------------
  let lastFeedState = 'ok';
  onFeedHealth((state) => {
    const dot = document.getElementById('net-dot');
    dot.className = `net-dot ${state === 'ok' ? '' : state}`.trim();
    // Edge-triggered (only on the transition, not every 15s poll) — the
    // dot's color alone doesn't explain itself, especially on touch
    // devices where there's no hover to read its title tooltip.
    if (state !== 'ok' && state !== lastFeedState) {
      const age = fmtRelTime(new Date(getLastSuccessAt()));
      showToast(
        state === 'offline'
          ? `📡 Offline — showing the last data StormLens fetched (${age}). It'll refresh automatically once you're back online.`
          : `📡 Connection is slow — data on screen is from ${age}.`,
        { level: 'warn', ttlMs: 10_000 });
    }
    lastFeedState = state;
  });
  wirePowerAwareness();
  setInterval(() => {
    document.getElementById('data-clock').textContent = fmtTimeUTC(new Date());
  }, 1000);

  if (!settings.firstRunDone) {
    const appEl = document.getElementById('app');
    appEl.classList.add('show-disclaimer');
    // Measure the disclaimer's actual rendered height (it can wrap to 2-3
    // lines on narrow phones) so fixed-position panels/sheets reserve
    // exactly enough space above the tabbar instead of overlapping it.
    requestAnimationFrame(() => {
      const h = document.getElementById('disclaimer')?.offsetHeight || 0;
      appEl.style.setProperty('--disclaimer-h', `${h}px`);
    });
    setSetting('firstRunDone', true);
    // Show quick start guide after a brief delay
    setTimeout(() => showQuickStartGuide(), 800);
  }
}

/** Help button to show quick start guide anytime */
export function openQuickStart() {
  showQuickStartGuide();
}

/* ------------- Visibility-gated panel rendering -------------
 * Hidden panels are never rebuilt on data refreshes — they're marked
 * stale and rendered the moment they're opened. This keeps the per-minute
 * refresh cost tiny while the user is watching the radar. */
const dirtyPanels = new Set(['storms', 'alerts', 'reports', 'ai']);

function isPanelOpen(name) {
  const p = document.getElementById(`panel-${name}`);
  return p && !p.hidden;
}

function renderPanel(name) {
  const { alerts, environment } = sources.getState();
  const user = geo.getLocation();
  const visible = visibleAnalyses(user);
  const hiddenCount = analyses.length - visible.length;
  if (name === 'storms') {
    renderStormList(visible, { onSelect: selectStorm, hiddenCount });
  } else if (name === 'alerts') {
    renderAlerts(alerts, user);
  } else if (name === 'reports') {
    renderReportsList();
  } else if (name === 'ai') {
    const st = sources.getState();
    renderAiPanel(visible, environment, alerts, user, {
      onSelect: selectStorm, hiddenCount,
      outlook: st.outlook, week: st.week,
      outlookDay2: st.outlookDay2, outlookDay3: st.outlookDay3,
      forecast: st.forecast,
      onOpenChat: openChat,
      onShowTarget: showChaseTarget,
    });
  }
  dirtyPanels.delete(name);
}

function markPanelsStale(names) {
  for (const name of names) {
    if (isPanelOpen(name)) renderPanel(name);
    else dirtyPanels.add(name);
  }
}

function renderFeaturesPanel() {
  const container = document.getElementById('features-panel');
  if (!container) return;
  const dashboard = new FeatureDashboard();
  dashboard.render(container, (feature, label) => {
    const panel = document.getElementById(`panel-${feature}`);
    if (panel) {
      // Show the feature panel
      for (const p of ['storms', 'alerts', 'reports', 'analysis', 'week3', 'ai', 'settings', 'features']) {
        const elem = document.getElementById(`panel-${p}`);
        if (elem) elem.hidden = p !== feature;
      }
      // Update tab styles
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.panel === feature);
      });
      showToast(`Opening ${label}…`, { ttlMs: 1500 });
    }
  });
}

function showChaseTarget(t) {
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
  if (targetMarker) mapView.map.removeLayer(targetMarker);
  targetMarker = L.marker([t.lat, t.lon], {
    icon: L.divIcon({ className: '', html: '<div style="font-size:26px">🎯</div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
  }).addTo(mapView.map).bindPopup(`Chase target: ${t.cat} risk area`);
  mapView.map.flyTo([t.lat, t.lon], 6, { duration: 0.8 });
}

/** Zoom the map to a storm and open its detail sheet (from any list). */
function selectStorm(a) {
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.panel === 'map'));
  mapView.focusCell(a.cell);
  openStormSheet(a);
  if (advancedPanel) {
    advancedPanel.selectStorm(a);
  }
  if (week3Panel) {
    week3Panel.selectStorm(a);
  }
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
  const activeIds = new Set(analyses.map((a) => a.cell.id));
  pruneStormHistory(activeIds);
  pruneNarrative(activeIds);

  // Record metrics for trend analysis
  analyses.forEach((a) => {
    recordStormMetrics(a.cell.id, a.cell, a);
  });

  // Map + always-on chrome first; list panels only if actually visible.
  mapView.renderCells(visibleAnalyses(user));
  updateInterceptGuidance(user);
  markPanelsStale(['storms', 'ai']);
  if (!document.getElementById('glance').hidden) updateGlance();
  updateChaseHud(user);
  updateTicker(user);
  updateGpsChip(user);
  // Alerts always consider every storm — display filters never mute safety.
  evaluateStorms(analyses, user);

  // Remember AFTER alerting so change explanations compare to the last pass.
  analyses.forEach(rememberAnalysis);
}, 400);

/** Map layer for reports (always current) — list renders only when open. */
function refreshReportsView() {
  const lsr = sources.getState().reports || [];
  // Community reports adapt to the LSR shape for the shared map layer.
  const communityAsLsr = communityReports.map((r) => ({
    lat: r.lat, lon: r.lon, type: r.type, magnitude: null, unit: '',
    city: 'community report', state: '', remark: r.text || '',
    valid: new Date(r.t), source: 'community',
  }));
  mapView.renderReports([...communityAsLsr, ...lsr]);
  markPanelsStale(['reports']);
}

function renderReportsList() {
  const lsr = sources.getState().reports || [];
  renderReports(lsr, communityReports, {
    onSubmit: (type, text, done) =>
      submitReport(type, text, () => { done(); fetchCommunityReports().then((n) => { communityReports = n; refreshReportsView(); }); }),
    onRefresh: renderReportsList,
  });
}

function updateTicker(user) {
  const ticker = document.getElementById('ai-ticker');
  const text = document.getElementById('ai-ticker-text');
  ticker.hidden = false;
  const next = tickerHeadline(analyses, user);
  if (text.textContent !== next) text.textContent = next; // avoid needless paints
}

/** Keep the Alerts tab badge current the moment new data arrives, not only
 * when the panel happens to be opened (renderAlerts() also sets this, but
 * only runs when that panel is visible). */
function updateAlertBadge(alerts) {
  const badge = document.getElementById('alert-badge');
  const count = alerts.filter((a) => a.kind.endsWith('warning')).length;
  badge.hidden = count === 0;
  badge.textContent = String(count);
}

/** Drive-to pin for the single most dangerous nearby storm (score >= 41 —
 * "elevated" or worse), while there's an actual GPS fix and the user
 * hasn't turned it off in Settings. Storms with no known motion vector
 * are skipped inside renderInterceptGuidance() rather than here, so a
 * weaker/idle storm doesn't leave a stale pin on screen. */
function updateInterceptGuidance(user) {
  if (!user || !settings.interceptGuidance) { mapView.clearInterceptGuidance(); return; }
  const target = analyses.find((a) => a.userRel && a.userRel.distKm <= settings.monitorRadiusKm && a.severeScore >= 41);
  if (!target) { mapView.clearInterceptGuidance(); return; }
  mapView.renderInterceptGuidance(user, target);
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

// Primary products stay visible; the rest live behind the ••• toggle so
// the rail doesn't bury the map on small screens.
const PRIMARY_PRODUCTS = ['CREF', 'N0Q', 'N0U', 'N0S', 'SVIS', 'SIR'];
let railExpanded = false;

function renderProductRail() {
  const rail = document.getElementById('product-rail');
  rail.textContent = '';

  // Radar site chip: shows the active single-site radar; tap to choose.
  const siteLabel = settings.radarSite === 'auto'
    ? `📡 ${radar.site ? radar.site.id : 'AUTO'}`
    : `📡 ${settings.radarSite} 📌`;
  rail.appendChild(el('button', {
    class: 'product-btn site-chip', id: 'site-chip',
    text: siteLabel,
    title: 'Choose radar site',
    onclick: toggleSitePicker,
  }));

  const addBtn = (prod) => {
    const active = prod.id === radar.productId;
    const tiltSuffix = active && prod.tilts && radar.tiltIndex > 0 ? ` T${radar.tiltIndex + 1}` : '';
    rail.appendChild(el('button', {
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
    }));
  };

  const primary = radar.productList.filter((p) => PRIMARY_PRODUCTS.includes(p.id));
  const extra = radar.productList.filter((p) => !PRIMARY_PRODUCTS.includes(p.id));
  // An active extra product surfaces itself so it's never hidden.
  for (const prod of primary) addBtn(prod);
  if (!railExpanded) {
    for (const prod of extra) if (prod.id === radar.productId) addBtn(prod);
  } else {
    for (const prod of extra) addBtn(prod);
  }
  rail.appendChild(el('button', {
    class: 'product-btn',
    text: railExpanded ? '▲' : '•••',
    title: railExpanded ? 'Fewer products' : 'More products',
    onclick: () => { railExpanded = !railExpanded; renderProductRail(); },
  }));
}

/* ---------------- Radar site picker ---------------- */

async function toggleSitePicker() {
  const picker = document.getElementById('site-picker');
  if (!picker.hidden) { picker.hidden = true; return; }
  picker.hidden = false;
  picker.textContent = '';
  picker.appendChild(el('div', { class: 'site-picker-title', text: 'Radar site (single-site products)' }));

  const c = mapView.map.getCenter();
  const pick = async (id) => {
    picker.hidden = true;
    await radar.setSite(id, c.lat, c.lng);
    renderProductRail();
    showToast(id === 'auto'
      ? 'Radar site: automatic — follows the map.'
      : `Radar site pinned to ${id}. It will stay put until you change it.`);
  };

  picker.appendChild(el('button', {
    class: `site-option ${settings.radarSite === 'auto' ? 'active' : ''}`,
    html: '<strong>Auto</strong> — always use the nearest site to the map',
    onclick: () => pick('auto'),
  }));

  const sites = await fetchRadarSites();
  const sorted = [...sites]
    .map((s) => ({ ...s, d: haversineKm(c.lat, c.lng, s.lat, s.lon) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);
  for (const s of sorted) {
    picker.appendChild(el('button', {
      class: `site-option ${settings.radarSite === s.id ? 'active' : ''}`,
      html: `<strong>${s.id}</strong> ${escapeHud(s.name)} <span class="muted">${fmtDistance(s.d, settings.units)}</span>`,
      onclick: () => pick(s.id),
    }));
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

/* ---------------- Glance mode ---------------- */

function openGlance() {
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
  const g = document.getElementById('glance');
  g.hidden = false;
  g.onclick = () => { g.hidden = true; };
  updateGlance();
}

function updateGlance() {
  const g = document.getElementById('glance');
  if (g.hidden) return;
  const user = geo.getLocation();
  const near = user
    ? analyses.filter((a) => a.userRel).sort((x, y) => x.userRel.distKm - y.userRel.distKm)[0]
    : analyses[0];
  const rating = near ? near.threatRating : { id: 'verylow', label: 'Quiet' };
  const colors = { verylow: '#64748b', low: '#34d399', elev: '#fbbf24', high: '#fb923c', extreme: '#ef4444' };
  const alerts = sources.getState().alerts;
  const torCount = alerts.filter((a) => a.kind === 'tor-warning').length;

  g.innerHTML = `
    <div class="glance-rating" style="background:${colors[rating.id]}">${rating.label.toUpperCase()}</div>
    <div class="glance-main">${near && near.userRel
      ? `${escapeHud(fmtDistance(near.userRel.distKm, settings.units))}<div class="glance-sub">to nearest storm (${near.severeScore}/100)${near.userRel.etaMin != null ? ` · ~${near.userRel.etaMin} min out` : ''}</div>`
      : near
        ? `${near.severeScore}/100<div class="glance-sub">strongest tracked storm</div>`
        : `ALL QUIET<div class="glance-sub">no storms being tracked</div>`}</div>
    <div class="glance-alerts">${torCount ? `🌪 ${torCount} tornado warning${torCount === 1 ? '' : 's'} active` : 'No tornado warnings active'}</div>
    <div class="glance-foot">${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · tap anywhere to close</div>`;
}

/* ---------------- Tornado history (SPC climatology archive) ---------------- */

let torHistoryLoaded = false;

async function loadTornadoHistory() {
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = true; });
  if (torHistoryLoaded) {
    mapView.clearTornadoHistory();
    torHistoryLoaded = false;
    showToast('Tornado history layer removed.');
    return;
  }
  showToast('Downloading the SPC tornado archive (~10 MB, one-time)…', { ttlMs: 10_000 });
  const candidates = [
    'https://www.spc.noaa.gov/wcm/data/1950-2024_actual_tornadoes.csv',
    'https://www.spc.noaa.gov/wcm/data/1950-2023_actual_tornadoes.csv',
  ];
  let text = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (res.ok) { text = await res.text(); break; }
    } catch { /* try next */ }
  }
  if (!text) {
    showToast('Couldn\'t download the archive — SPC may be blocking cross-site requests right now.', { level: 'warn' });
    return;
  }
  const c = mapView.map.getCenter();
  const rows = text.split('\n');
  const header = rows[0].split(',');
  const col = (name) => header.indexOf(name);
  const [iMag, iSlat, iSlon, iElat, iElon, iDate, iFat] =
    ['mag', 'slat', 'slon', 'elat', 'elon', 'date', 'fat'].map(col);
  const tracks = [];
  for (let i = 1; i < rows.length && tracks.length < 3000; i++) {
    const f = rows[i].split(',');
    const slat = Number(f[iSlat]), slon = Number(f[iSlon]);
    if (!slat || !slon) continue;
    // Keep tornadoes within ~200 km of the current map centre.
    if (Math.abs(slat - c.lat) > 2 || Math.abs(slon - c.lng) > 2.5) continue;
    tracks.push({
      mag: Number(f[iMag]), slat, slon,
      elat: Number(f[iElat]) || null, elon: Number(f[iElon]) || null,
      date: f[iDate], fat: Number(f[iFat]) || 0,
    });
  }
  mapView.renderTornadoHistory(tracks);
  torHistoryLoaded = true;
  showToast(`${tracks.length} historical tornadoes near this view (since 1950). Colors = intensity; tap a track for details. Load again to remove.`, { ttlMs: 12_000 });
}

/** Dim red night theme (Settings → Radar → Night mode). */
function applyTheme() {
  document.body.classList.toggle('night', !!settings.nightMode);
  document.body.classList.toggle('colorblind', !!settings.colorblindMode);
  document.body.classList.toggle('large-text', !!settings.largeText);
  document.body.classList.toggle('high-contrast', !!settings.highContrast);
}

/* ---------------- Chase mode: HUD + screen wake lock ---------------- */

let wakeLock = null;

let chaseStartTime = null;

async function applyChaseMode() {
  const hud = document.getElementById('chase-hud');
  if (settings.chaseMode) {
    chaseStartTime ??= Date.now();
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
    // Chase mode just turned off (not just "was already off" — the null
    // guard on chaseStartTime keeps this from firing on startup/no-ops) —
    // log the session so History → Seasonal Statistics has real data.
    if (chaseStartTime != null && week3Panel) {
      const durationMin = Math.round((Date.now() - chaseStartTime) / 60_000);
      const storms = (week3Panel.selectedAnalyses || []).filter((a) => a.severeScore != null);
      if (durationMin >= 1 && storms.length) {
        week3Panel.stormDatabase.saveSession(storms, durationMin);
      }
      chaseStartTime = null;
    }
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

  // Chaser vitals: nearest surface ob (T/Td spread drives storm quality)
  // and estimated cloud-base height from the model LCL.
  const st = sources.getState();
  const ob = (st.obs || []).find((o) => o.tempC != null);
  const vitals = [];
  if (ob) {
    const t = Math.round(ob.tempC * 9 / 5 + 32);
    const td = ob.dewpointC != null ? Math.round(ob.dewpointC * 9 / 5 + 32) : null;
    vitals.push(`T ${t}°${td != null ? ` / Td ${td}°` : ''} (${ob.station})`);
  }
  if (st.environment?.lclM != null) {
    vitals.push(`cloud base ~${(st.environment.lclM * 3.281 / 1000).toFixed(1)} kft`);
  }
  const coordsLine = `<span class="hud-coords" id="hud-coords" title="Tap to copy">${user.lat.toFixed(4)}, ${user.lon.toFixed(4)} ⧉</span>`;
  const vitalsLine = `<div class="hud-vitals">${vitals.map(escapeHud).join(' · ')}${vitals.length ? ' · ' : ''}${coordsLine}</div>`;

  const noteBtn = '<button class="product-btn hud-note-btn" id="hud-note-btn">📝</button>';
  if (!target) {
    hud.innerHTML = `<div class="hud-title">CHASE MODE ${noteBtn}</div><div class="muted">No target storms in radius · your speed ${escapeHud(mySpeed)} · ${daylight}</div>${vitalsLine}`;
  } else {
    const brg = bearingDeg(user.lat, user.lon, target.cell.lat, target.cell.lon);
    const eta = target.userRel.etaMin != null ? `~${target.userRel.etaMin} min to you` : 'not tracking to you';
    const overshoot = overshootWarning(user, target, brg);
    hud.innerHTML = `
      <div class="hud-title">TARGET · ${escapeHud(target.cell.id)} · ${target.severeScore}/100 ${noteBtn}</div>
      <div class="hud-grid">
        <span>Look <strong>${compassDir(brg)}</strong> <span class="hud-arrow" style="transform:rotate(${Math.round(brg)}deg)">➤</span></span>
        <span>${escapeHud(fmtDistance(target.userRel.distKm, settings.units))}</span>
        <span>${escapeHud(eta)}</span>
        <span>You: ${escapeHud(mySpeed)}</span>
        <span>${daylight}</span>
      </div>
      ${overshoot ? `<div class="hud-warn">⚠️ ${escapeHud(overshoot)}</div>` : ''}
      <div class="hud-note">${target.type.id.includes('supercell') || target.type.id === 'supercell'
        ? 'Right-movers are typically safest viewed from the SE, storm at your NW — never enter the rain core, and keep a paved escape route south or east.'
        : 'Stay out of the storm\'s path and ahead of the gust front.'} Unofficial guidance — your safety decisions are your own.</div>
      ${vitalsLine}`;
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
  // Tap coordinates to copy (for phoning in reports).
  const coords = document.getElementById('hud-coords');
  if (coords) {
    coords.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(`${user.lat.toFixed(5)}, ${user.lon.toFixed(5)}`)
        .then(() => showToast('GPS coordinates copied.'));
    };
  }
}

/**
 * Roadmap #191: warn when the chaser is closing on the target faster than
 * the storm itself is moving, while heading roughly at it — that combination
 * means you'll reach its current position before it clears out, i.e. drive
 * past the safe standoff distance and into its path. Needs real vehicle
 * speed/heading from the GPS fix (only populated while actually moving);
 * silently does nothing otherwise rather than guessing.
 */
function overshootWarning(user, target, brgToTarget) {
  if (user.speedMps == null || user.speedMps < 1 || user.headingDeg == null) return null;
  const c = target.cell;
  if (c.moveDirDeg == null || !c.moveSpeedKts) return null;
  if (target.userRel.distKm > 60) return null; // too far out to matter yet

  const headingOff = angleDiffDeg(user.headingDeg, brgToTarget);
  if (headingOff > 50) return null; // not actually driving toward it

  const userKmh = user.speedMps * 3.6;
  const stormKmh = c.moveSpeedKts * 1.852;
  if (userKmh - stormKmh < 15) return null; // not closing meaningfully faster

  const userSpeedText = fmtSpeed(user.speedMps * 1.94384, settings.units);
  const stormSpeedText = fmtSpeed(c.moveSpeedKts, settings.units);
  return `Closing at ${userSpeedText} vs. the storm's ${stormSpeedText} — ` +
    `ease off or you'll overshoot past a safe standoff distance into its path.`;
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

/** Fixed-position panels/sheets reserve space above the tabbar via a CSS
 * var rather than a guessed pixel constant — actual rendered height varies
 * with font metrics and safe-area insets. */
function syncTabbarHeight() {
  const h = document.getElementById('tabbar')?.offsetHeight || 0;
  document.getElementById('app').style.setProperty('--tabbar-h', `${h}px`);
}

/** Last few cities flown to — shown first when the search box is empty. */
const RECENT_KEY = 'stormlens.recentSearches.v1';
function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}
function addRecentSearch(city) {
  const next = [city, ...getRecentSearches().filter((c) => c.name !== city.name)].slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* best effort */ }
}

/** City/landmark search: type-ahead over a static list, tap a result to fly there. */
function wireLocationSearch() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  const open = () => {
    overlay.hidden = false;
    input.value = '';
    renderResults([]);
    input.focus();
  };
  const close = () => { overlay.hidden = true; };

  const renderResults = (matches) => {
    results.innerHTML = '';
    const showRecent = !input.value.trim() && matches.length === 0;
    const list = showRecent ? getRecentSearches() : matches;
    if (showRecent && list.length) {
      results.appendChild(el('div', { class: 'muted', style: 'padding:8px 14px 2px; font-size:11px', text: 'RECENT' }));
    }
    if (!list.length) {
      if (input.value.trim()) {
        results.appendChild(el('div', { class: 'muted', style: 'padding:10px', text: 'No matches.' }));
      }
      return;
    }
    for (const c of list) {
      const row = el('button', { class: 'search-result', text: c.name });
      row.addEventListener('click', () => {
        mapView.map.flyTo([c.lat, c.lon], 9, { duration: 0.8 });
        addRecentSearch(c);
        close();
      });
      results.appendChild(row);
    }
  };

  document.getElementById('btn-search').addEventListener('click', open);
  document.getElementById('btn-search-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  input.addEventListener('input', () => renderResults(searchCities(input.value)));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/** Desktop keyboard shortcuts. Disabled while typing in any input/textarea. */
function wireKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === ' ' || e.key.toLowerCase() === 'p') {
      e.preventDefault();
      document.getElementById('btn-play')?.click();
    } else if (e.key.toLowerCase() === 'z') {
      mapView?.map.setView([37.5, -96.5], 5);
    } else if (e.key === 'Escape') {
      document.querySelector('.tab[data-panel="map"]')?.click();
    } else if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (analyses[idx]) selectStorm(analyses[idx]);
    }
  });
}

/**
 * Battery + connection awareness. Deliberately not a permanent topbar
 * widget (the status bar is already tight on 390px phones) — instead
 * updates the existing net-dot's tooltip and nudges toward Data Saver
 * only when it would actually help (low battery, not charging; a slow
 * connection), once per session so it isn't repetitive.
 */
async function wirePowerAwareness() {
  const dot = document.getElementById('net-dot');
  let batterySuggested = false;

  if (navigator.getBattery) {
    try {
      const battery = await navigator.getBattery();
      const checkLevel = () => {
        if (!batterySuggested && !battery.charging && battery.level < 0.2 && !settings.dataSaver) {
          batterySuggested = true;
          showToast(`🔋 Battery at ${Math.round(battery.level * 100)}% — Settings → Data saver slows refresh to stretch it.`, { level: 'warn', ttlMs: 10_000 });
        }
      };
      checkLevel();
      battery.addEventListener('levelchange', checkLevel);
      battery.addEventListener('chargingchange', checkLevel);
    } catch { /* Battery Status API blocked/unsupported — skip silently */ }
  }

  const conn = navigator.connection;
  if (conn) {
    let connSuggested = false;
    const updateConn = () => {
      dot.title = `Data feed status — connection: ${conn.effectiveType || 'unknown'}`;
      if (!connSuggested && !settings.dataSaver && ['slow-2g', '2g'].includes(conn.effectiveType)) {
        connSuggested = true;
        showToast('📶 Slow connection detected — Settings → Data saver reduces refresh frequency.', { level: 'warn', ttlMs: 10_000 });
      }
    };
    updateConn();
    conn.addEventListener('change', updateConn);
  }
}

/** Weather term glossary: tap 📖, search or browse plain-English definitions. */
function wireGlossary() {
  const overlay = document.getElementById('glossary-overlay');
  const input = document.getElementById('glossary-input');
  const results = document.getElementById('glossary-results');

  const render = (query) => {
    results.innerHTML = '';
    for (const g of searchGlossary(query)) {
      results.appendChild(el('div', { class: 'glossary-entry' }, [
        el('div', { class: 'glossary-term', text: g.term }),
        el('div', { class: 'glossary-def', text: g.def }),
      ]));
    }
    if (!results.children.length) {
      results.appendChild(el('div', { class: 'muted', style: 'padding:10px', text: 'No matching terms.' }));
    }
  };

  const open = () => { overlay.hidden = false; input.value = ''; render(''); input.focus(); };
  const close = () => { overlay.hidden = true; };

  document.getElementById('btn-glossary').addEventListener('click', open);
  document.getElementById('btn-glossary-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function wireChrome() {
  const panels = ['storms', 'alerts', 'reports', 'analysis', 'week3', 'ai', 'settings', 'about', 'features'];
  const tabs = document.querySelectorAll('.tab');

  const PANEL_CLOSE_MS = 180;
  const showPanel = (name) => {
    for (const p of [...panels, 'layers']) {
      const elp = document.getElementById(`panel-${p}`);
      if (!elp || p === name) continue;
      // Fade+slide out instead of an instant cut, then actually hide.
      if (!elp.hidden) {
        elp.classList.add('closing');
        setTimeout(() => { elp.hidden = true; elp.classList.remove('closing'); }, PANEL_CLOSE_MS);
      }
    }
    const target = name ? document.getElementById(`panel-${name}`) : null;
    if (target) { target.classList.remove('closing'); target.hidden = false; }
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.panel === (name || 'map')));
    if (name === 'settings') rerenderSettings();
    if (name === 'features') renderFeaturesPanel();
    // Stale panels render the moment they become visible.
    if (name && dirtyPanels.has(name)) renderPanel(name);
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
      renderLayers({
        onChanged: () => mapView.syncLayerVisibility(),
        onGlance: openGlance,
        onTornadoHistory: loadTornadoHistory,
      });
      showPanel('layers');
    } else {
      showPanel(null);
    }
  });
  document.getElementById('btn-snapshot').addEventListener('click', () => {
    captureMap(mapView.map, radar, visibleAnalyses(geo.getLocation()), geo.getLocation());
  });

  const rerenderSettings = () => renderSettings({
    onChanged: (path) => {
      if (path === 'favorites.add') {
        const c = mapView.map.getCenter();
        const suggested = `Spot ${settings.favorites.length + 1}`;
        const name = (window.prompt('Name this view (e.g. Home, Target area):', suggested) || suggested).slice(0, 40);
        // Saved views remember the zoom too — one-tap jumps restore the exact framing.
        settings.favorites.push({ name, lat: c.lat, lon: c.lng, zoom: mapView.map.getZoom() });
        setSetting('favorites', settings.favorites);
        showToast(`Saved “${name}”. Tap it in Settings to jump back; the alert engine watches it too.`);
        rerenderSettings();
        return;
      }
      if (path.startsWith('favorites.goto.')) {
        const fav = settings.favorites[Number(path.split('.')[2])];
        if (fav) {
          showPanel(null);
          mapView.map.flyTo([fav.lat, fav.lon], fav.zoom ?? Math.max(mapView.map.getZoom(), 8), { duration: 0.8 });
        }
        return;
      }
      if (path === 'journal.refresh') { rerenderSettings(); return; }
      if (path === 'about.open') { renderAbout(); showPanel('about'); return; }
      if (path === 'chase.replay') {
        showPanel(null);
        mapView.showChaseTrack(getTrack(), getNotes());
        showToast('Chase-day replay drawn — your route in blue, 📝 marks your notes. Load again from Settings to redraw.');
        return;
      }
      if (path === 'nightMode' || path === 'largeText' || path === 'highContrast') applyTheme();
      if (path === 'colorblindMode') { applyTheme(); mapView.renderCells(visibleAnalyses(geo.getLocation())); }
      if (path === 'chaseMode') applyChaseMode();
      if (path === 'dataSaver') {
        // One switch adjusts the cadence knobs for weak-signal chasing.
        settings.refreshIntervalSec = settings.dataSaver ? 300 : 60;
        settings.animFps = settings.dataSaver ? 2 : 4;
        setSetting('refreshIntervalSec', settings.refreshIntervalSec);
        radar.rebuild();
        sources.applyRefreshInterval();
        showToast(settings.dataSaver
          ? 'Data saver ON — radar and storm data refresh every 5 min to stretch weak signal.'
          : 'Data saver off — back to 1-minute refresh.');
      }
      if (path.startsWith('radar') || path === 'colorTable') radar.applyStyle();
      if (path === 'refreshIntervalSec') sources.applyRefreshInterval();
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
