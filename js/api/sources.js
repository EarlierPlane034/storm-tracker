/**
 * Data-source facade: one place that schedules refreshes, fans results out
 * to subscribers, and shields the rest of the app from individual APIs.
 *
 * Streams: 'cells' | 'alerts' | 'reports' | 'environment' | 'outlook' | 'obs'
 */
import { CONFIG } from '../config.js';
import { settings } from '../storage.js';
import { fetchStormCells, fetchStormReports, fetchSpcOutlook } from './iem.js';
import { fetchSevereAlerts, fetchNearbyObservations, fetchForecastBundle } from './nws.js';
import { fetchEnvironment, fetchWeekOutlook } from './openmeteo.js';

const listeners = new Map(); // stream -> Set<fn>
const state = {
  cells: [], alerts: [], reports: [], outlook: [],
  outlookDay2: [], outlookDay3: [], week: [],
  forecast: { daily: [], hourly: [], afd: null, office: null },
  environment: null, obs: [],
  lastUpdated: {},
};
let focusPoint = null; // {lat, lon} — GPS or map centre; drives env/obs queries
const timers = [];

export function getState() {
  return state;
}

export function subscribe(stream, fn) {
  if (!listeners.has(stream)) listeners.set(stream, new Set());
  listeners.get(stream).add(fn);
  // Replay current data so late subscribers render immediately.
  if (state[stream] != null && state.lastUpdated[stream]) fn(state[stream]);
  return () => listeners.get(stream).delete(fn);
}

function emit(stream, data) {
  state[stream] = data;
  state.lastUpdated[stream] = Date.now();
  (listeners.get(stream) || []).forEach((fn) => {
    try { fn(data); } catch (err) { console.error(`[sources] ${stream} listener`, err); }
  });
}

export function setFocusPoint(lat, lon) {
  const moved = !focusPoint ||
    Math.abs(focusPoint.lat - lat) > 0.5 || Math.abs(focusPoint.lon - lon) > 0.5;
  focusPoint = { lat, lon };
  if (moved) {
    refreshEnvironment();
    refreshObservations();
    refreshWeek();
    refreshForecast();
  }
}

export function getFocusPoint() {
  return focusPoint;
}

async function refreshCells() {
  try { emit('cells', await fetchStormCells()); }
  catch (err) { console.warn('[sources] cells refresh failed', err); }
}

async function refreshAlerts() {
  try { emit('alerts', await fetchSevereAlerts()); }
  catch (err) { console.warn('[sources] alerts refresh failed', err); }
}

async function refreshReports() {
  try { emit('reports', await fetchStormReports(6)); }
  catch (err) { console.warn('[sources] reports refresh failed', err); }
}

async function refreshOutlook() {
  try { emit('outlook', await fetchSpcOutlook(1)); }
  catch (err) { console.warn('[sources] outlook refresh failed', err); }
  try { emit('outlookDay2', await fetchSpcOutlook(2)); } catch { /* optional */ }
  try { emit('outlookDay3', await fetchSpcOutlook(3)); } catch { /* optional */ }
}

async function refreshWeek() {
  if (!focusPoint) return;
  try { emit('week', await fetchWeekOutlook(focusPoint.lat, focusPoint.lon)); }
  catch (err) { console.warn('[sources] week outlook refresh failed', err); }
}

async function refreshForecast() {
  if (!focusPoint) return;
  try { emit('forecast', await fetchForecastBundle(focusPoint.lat, focusPoint.lon)); }
  catch (err) { console.warn('[sources] forecast refresh failed', err); }
}

async function refreshEnvironment() {
  if (!focusPoint) return;
  try { emit('environment', await fetchEnvironment(focusPoint.lat, focusPoint.lon)); }
  catch (err) { console.warn('[sources] environment refresh failed', err); }
}

async function refreshObservations() {
  if (!focusPoint) return;
  try { emit('obs', await fetchNearbyObservations(focusPoint.lat, focusPoint.lon)); }
  catch (err) { console.warn('[sources] obs refresh failed', err); }
}

/** Kick everything off and start the refresh clocks. */
export function start() {
  refreshCells();
  refreshAlerts();
  refreshReports();
  refreshOutlook();

  const base = Math.max(30, settings.refreshIntervalSec) * 1000;
  timers.push(setInterval(refreshCells, Math.max(base, CONFIG.refresh.cellsMs)));
  timers.push(setInterval(refreshAlerts, base));
  timers.push(setInterval(refreshReports, CONFIG.refresh.reportsMs));
  timers.push(setInterval(refreshOutlook, CONFIG.refresh.environmentMs));
  timers.push(setInterval(refreshEnvironment, CONFIG.refresh.environmentMs));
  timers.push(setInterval(refreshObservations, CONFIG.refresh.reportsMs));
  timers.push(setInterval(refreshWeek, 3 * 3600_000));
  timers.push(setInterval(refreshForecast, 1800_000));

  // Refresh instantly when the PWA returns to the foreground — the primary
  // "background sync" path on iOS where the SyncManager API is unavailable.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshAll();
  });
  navigator.serviceWorker?.addEventListener?.('message', (e) => {
    if (e.data?.type === 'refresh') refreshAll();
  });
}

export function refreshAll() {
  refreshCells();
  refreshAlerts();
  refreshReports();
  refreshEnvironment();
}
