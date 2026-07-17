/**
 * About screen: identity, full feature tour (grouped, collapsible),
 * data-source credits, and the standing disclaimer.
 */
import { el } from '../utils.js';
import { CONFIG } from '../config.js';

const FEATURE_GROUPS = [
  ['🗺 Radar & Map', [
    'Live CONUS composite reflectivity, refreshed every minute',
    'Single-site reflectivity, velocity & storm-relative velocity with 4 tilts',
    'GOES satellite: visible, infrared, water vapor',
    '📡 Radar site picker — auto (nearest) or pin any nearby WSR-88D',
    '~50 min radar history: play, pause, scrub — storm markers move with the loop',
    'Adjustable transparency, speed, smoothing, 3 color tables',
    'Layers: warnings, watches, SPC outlook, cells, tracks, reports, METARs, radar sites, range rings',
    'Long-press any point: distance, bearing, drive time, coordinates',
  ]],
  ['🤖 AI Analysis', [
    'Every storm scored 0–100: severe, tornado, hail, wind, flood, lightning, rotation, organization',
    'Storm type calls: classic/HP/LP supercell, QLCS, mesovortex, multicell',
    'Tornado chance (None → Very High) with %, time window & confidence',
    'Plain-English reasoning for every score, and for every score change',
    'Score breakdown bars, trends, rotation persistence, rapid-intensification detection',
    'Ranked storm list + AI headline ticker',
    '💬 Ask-the-AI chat answering from live data, fully on-device',
  ]],
  ['📊 Forecasts & Environment', [
    "Today's outlook briefing (SPC risk + what the environment supports)",
    'Week ahead: 7-day storm potential + SPC Day 2/3 categories',
    'Official NWS 7-day forecast with hourly temp & precip charts',
    'Forecaster discussion (AFD) from your NWS office',
    'Environment card with CAPE/CIN/shear/SRH/LCL + hodograph',
    'SPC Mesoanalysis viewer: live CAPE, shear, SRH, composite parameters',
  ]],
  ['📋 Reports', [
    'NWS Local Storm Reports by distance with type filters',
    'Submit your own GPS-stamped spotter reports (your own database, 24 h)',
    'Hail size reference guide; reports plotted on the map',
  ]],
  ['🚨 Alerts', [
    'Warning/watch polygons + distance-sorted list with live countdowns',
    'AI alerts: rotation detected, tornado chance rising, rapid intensification, storm approaching',
    'Favorite locations watched too (home, work…)',
    'Background push when the app is closed (your Cloudflare worker)',
    '🔊 Spoken alerts through CarPlay/Bluetooth car audio',
  ]],
  ['🎯 Chase Kit', [
    'Chase HUD: target, bearing, ETA, your speed, daylight left, T/Td, cloud base, tap-to-copy GPS',
    'Wake lock, follow-me, night mode (dim red)',
    'Route check: which storms threaten your drive',
    '📝 Chase journal (exportable) + pre-chase checklist + data saver',
    'Storm replay scrubber and per-storm trend charts',
  ]],
];

const SOURCES = [
  ['NOAA / National Weather Service', 'alerts, forecasts, AFDs, observations (api.weather.gov)'],
  ['NEXRAD via Iowa Environmental Mesonet', 'radar tiles, storm cell attributes, local storm reports'],
  ['NOAA Storm Prediction Center', 'convective outlooks & mesoanalysis graphics'],
  ['Open-Meteo', 'model environment (HRRR/GFS blend) & weekly outlook'],
  ['OpenStreetMap / CARTO / Esri', 'base maps'],
  ['Nominatim & OSRM', 'geocoding and routing for Route Check'],
  ['Leaflet', 'map engine (vendored, BSD-2)'],
];

export function renderAbout() {
  const host = document.getElementById('about-body');
  host.textContent = '';

  host.appendChild(el('div', { class: 'about-hero' }, [
    el('img', { src: 'icons/icon-192.png', alt: '', class: 'about-icon' }),
    el('div', {}, [
      el('div', { class: 'about-name', text: 'StormLens' }),
      el('div', { class: 'muted', text: `AI storm chasing & tornado analysis · v${CONFIG.app.version}` }),
    ]),
  ]));

  host.appendChild(el('p', {
    class: 'ai-block', style: 'margin: 4px 2px 12px',
    text: 'A professional-grade radar app that doesn\'t just show you the storm — it explains it. StormLens continuously fuses NEXRAD radar, official alerts, spotter reports and the model environment into scored, plain-English analysis of every storm on the map.',
  }));

  for (const [title, items] of FEATURE_GROUPS) {
    const details = el('details', { class: 'about-group' });
    details.appendChild(el('summary', { text: `${title} (${items.length})` }));
    const ul = el('ul', { class: 'about-list' });
    for (const item of items) ul.appendChild(el('li', { text: item }));
    details.appendChild(ul);
    host.appendChild(details);
  }

  const src = el('details', { class: 'about-group' });
  src.appendChild(el('summary', { text: '🛰 Data sources & credits' }));
  const ul = el('ul', { class: 'about-list' });
  for (const [name, what] of SOURCES) {
    ul.appendChild(el('li', { html: `<strong>${name}</strong> — ${what}` }));
  }
  src.appendChild(ul);
  src.appendChild(el('p', { class: 'muted', style: 'font-size:11px;margin:6px 0 0 4px', text: 'All data sources are free public services. StormLens sends no personal data anywhere except your own Cloudflare worker, if you set one up.' }));
  host.appendChild(src);

  host.appendChild(el('div', { class: 'ai-disclaimer', style: 'margin-top:14px', text: CONFIG.disclaimer }));
  host.appendChild(el('div', {
    class: 'muted', style: 'text-align:center;font-size:10px;padding:10px 0 4px',
    text: 'Built with Claude · open source at github.com/EarlierPlane034/storm-tracker',
  }));
}
