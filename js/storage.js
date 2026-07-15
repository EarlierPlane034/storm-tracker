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
  colorTable: 'classic',        // 'classic' | 'enhanced' | 'grayscale'
  monitorRadiusKm: CONFIG.analysis.monitorRadiusKm,
  minCellScore: 0,              // hide storms scoring below this (map + lists)
  onlyNearby: false,            // only show storms within monitorRadiusKm
  aiSensitivity: 'balanced',    // 'conservative' | 'balanced' | 'aggressive'
  notifySensitivity: 'high-only', // 'all' | 'high-only' | 'off'
  lightningAlertKm: 30,
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
    satellite: false,
  },
  favorites: [],                // [{name, lat, lon}]
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
