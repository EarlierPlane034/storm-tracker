/**
 * Per-storm trend history.
 *
 * Every analysis pass appends a sample per cell (intensity, rotation, hail,
 * scores...). Trends power: strengthening/weakening detection, rotation
 * persistence, score-change explanations and the trend charts.
 * History is kept in memory and mirrored to sessionStorage so a quick app
 * reload (common on iOS) doesn't wipe short-term storm memory.
 */
import { CONFIG } from '../config.js';
import { slopePerMinute } from '../utils.js';

const SS_KEY = 'stormlens.history.v1';
const MAX = CONFIG.analysis.historyMaxSamples;

/** cellId -> [{t, maxDbz, vil, topKft, meso, tvs, hailIn, posh, severeScore, torScore, lat, lon}] */
let history = load();

function load() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    return raw ? new Map(JSON.parse(raw)) : new Map();
  } catch {
    return new Map();
  }
}

let persistTimer = null;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify([...history.entries()]));
    } catch { /* storage may be unavailable; memory copy still works */ }
  }, 2000);
}

export function recordSample(cellId, sample) {
  if (!history.has(cellId)) history.set(cellId, []);
  const arr = history.get(cellId);
  const last = arr[arr.length - 1];
  // Skip duplicate radar volumes (same valid time).
  if (last && sample.t - last.t < 45_000) {
    arr[arr.length - 1] = { ...last, ...sample };
  } else {
    arr.push(sample);
    if (arr.length > MAX) arr.shift();
  }
  persistSoon();
}

export function getHistory(cellId) {
  return history.get(cellId) || [];
}

/** Drop cells not seen for 30+ minutes. */
export function pruneStale(activeIds) {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, arr] of history) {
    if (!activeIds.has(id) && (!arr.length || arr[arr.length - 1].t < cutoff)) {
      history.delete(id);
    }
  }
  persistSoon();
}

/** Slope (units/min) of a numeric field over the last `windowMin` minutes. */
export function trendOf(cellId, field, windowMin = 30) {
  const cutoff = Date.now() - windowMin * 60_000;
  const samples = getHistory(cellId)
    .filter((s) => s.t >= cutoff && s[field] != null)
    .map((s) => ({ t: s.t, v: s[field] }));
  return slopePerMinute(samples);
}

/** How many consecutive recent samples show mesocyclone rotation. */
export function rotationPersistence(cellId) {
  const arr = getHistory(cellId);
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if ((arr[i].meso ?? 0) > 0 || arr[i].tvs) n++;
    else break;
  }
  return n;
}

/**
 * Classify the overall storm trend from intensity + rotation slopes.
 * Returns 'strengthening' | 'weakening' | 'steady' plus the driving slopes.
 */
export function stormTrend(cellId) {
  const dbzSlope = trendOf(cellId, 'maxDbz', 25);
  const vilSlope = trendOf(cellId, 'vil', 25);
  const mesoSlope = trendOf(cellId, 'meso', 25);
  const composite = dbzSlope * 0.4 + vilSlope * 0.8 + mesoSlope * 6;
  let label = 'steady';
  if (composite > 0.35) label = 'strengthening';
  else if (composite < -0.35) label = 'weakening';
  return { label, dbzSlope, vilSlope, mesoSlope, composite };
}

/** Rapid intensification = strong composite slope sustained over >=3 samples. */
export function isRapidlyIntensifying(cellId) {
  const arr = getHistory(cellId);
  if (arr.length < 3) return false;
  const t = stormTrend(cellId);
  return t.composite > 1.2;
}
