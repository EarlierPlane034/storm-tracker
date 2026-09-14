/**
 * Settings + small-state persistence (localStorage with in-memory fallback
 * for private-browsing modes that block storage).
 */
import { CONFIG } from './config.js';

const KEY = 'stormlens.settings.v1';

export const DEFAULT_SETTINGS = {
  units: 'imperial',            // 'imperial' | 'metric'
  refreshIntervalSec: 60,       // radar/alerts refresh
  animFps: 4,                   // radar loop frames per second
  radarOpacity: CONFIG.radar.defaultOpacity,
  radarSmoothing: true,         // CSS-level smoothing of radar tiles
  nightMode: false,             // dim red theme for night driving
  colorblindMode: false,        // blue/yellow/orange severity palette instead of red/green
  largeText: false,             // bump font size on commonly-read small text
  fontFamily: 'sans',           // 'sans' | 'serif' — readability preference
  highContrast: false,          // brighter text/borders for bright-sunlight readability
  chaseMode: false,             // chaser HUD + screen wake lock
  followMe: false,              // auto-center the map on GPS updates
  stormListView: 'cards',       // 'cards' | 'table' — Storms tab display
  voiceAlerts: false,           // speak dangerous alerts (works over CarPlay/BT audio)
  dataSaver: false,             // slower refresh for weak cell signal
  checklist: {},                // chase checklist state {item: true}
  hapticAlerts: false,          // vibration patterns (Android; iOS blocks web vibration)
  language: 'en',               // 'en' | 'es' — alert titles/instructions/voice
  colorTable: 'classic',        // 'classic' | 'enhanced' | 'grayscale'
  radarSite: 'auto',            // 'auto' (nearest) or a WSR-88D id like 'KTLX'
  monitorRadiusKm: CONFIG.analysis.monitorRadiusKm,
  minCellScore: 0,              // hide storms scoring below this (map + lists)
  onlyNearby: false,            // only show storms within monitorRadiusKm
  aiSensitivity: 'balanced',    // 'conservative' | 'balanced' | 'aggressive'
  notifySensitivity: 'high-only', // 'all' | 'high-only' | 'off'
  lightningAlertKm: 30,
  customThresholds: {
    enabled: false,      // off by default — the built-in category alerts cover most people
    tornadoPct: 50,       // alert when AI tornado score (0-100) crosses this
    hailIn: 1.5,          // alert when estimated hail size crosses this (inches)
    windScore: 60,        // alert when AI wind severity score (0-100) crosses this
  },
  soundAlerts: false,      // play a tone (in addition to vibration/voice) on delivery
  quietHours: {            // suppress sound/vibration/voice/push overnight; danger-level alerts still break through
    enabled: false,
    startHour: 22,          // 24h local time
    endHour: 7,
  },
  alertsEnabled: {
    tornadoWarning: true,
    tornadoWatch: true,
    severeWarning: true,
    severeWatch: true,
    flashFloodWarning: true,
    flashFloodWatch: false,
    rotationDetected: true,
    torChanceRising: true,
    rapidIntensification: true,
    approachingStorm: true,
    stormMerger: true,
  },
  layers: {
    warnings: true,
    watches: true,
    spcOutlook: false,
    stormReports: false,
    stormTracks: true,
    cells: true,
    metar: false,
    counties: false,
    radarSites: false,
    rangeRings: false,
    mesocyclones: true,
  },
  favorites: [],                // [{name, lat, lon}]
  bookmarkedStormIds: [],        // storm cell IDs pinned during this session/day
  interceptGuidance: true,       // map pin + route to the nearest dangerous storm's projected path
  pushServerUrl: '',            // user's own Cloudflare push worker URL
  pushEnabled: false,           // background push registered
  showTechnical: false,         // AI: include technical explanation
  firstRunDone: false,
};

let memoryFallback = null;

function readRaw() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return memoryFallback;
  }
}

function writeRaw(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    memoryFallback = obj;
  }
}

/** Deep-merge stored settings over defaults so new keys get defaults. */
function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = Array.isArray(base) ? [...(over ?? base)] : { ...base };
  if (Array.isArray(base)) return out;
  for (const k of Object.keys(base)) {
    if (k in over) {
      out[k] = typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])
        ? merge(base[k], over[k])
        : over[k];
    }
  }
  return out;
}

const listeners = new Set();

export const settings = merge(DEFAULT_SETTINGS, readRaw());

export function saveSettings() {
  writeRaw(settings);
  listeners.forEach((fn) => fn(settings));
}

/** Set a (possibly nested, dot-separated) settings key and persist. */
export function setSetting(path, value) {
  const keys = path.split('.');
  let obj = settings;
  for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
  obj[keys[keys.length - 1]] = value;
  saveSettings();
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
