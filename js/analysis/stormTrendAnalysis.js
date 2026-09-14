/**
 * Storm Trend Analysis
 *
 * Tracks per-storm metrics over time, detects lifecycle transitions,
 * predicts storm trajectory, and manages historical storm database.
 */

const stormHistory = new Map(); // stormId → [{ ts, metrics }]
const stormLifecycles = new Map(); // stormId → { start, lifecycle: genesis|mature|decay }

/**
 * Record storm metrics at current time
 */
export function recordStormMetrics(stormId, cell, analysis) {
  if (!stormHistory.has(stormId)) {
    stormHistory.set(stormId, []);
  }

  const history = stormHistory.get(stormId);
  const metrics = {
    ts: Date.now(),
    lat: cell.lat,
    lon: cell.lon,
    dbz: cell.maxDbz,
    vil: cell.vil,
    tops: cell.topKft,
    meso: cell.meso,
    tvs: cell.tvs,
    severity: analysis.severeScore,
    tornado: analysis.tornado.score,
    hail: analysis.scores.hail,
    wind: analysis.scores.wind,
  };

  history.push(metrics);

  // Keep only last 60 minutes of data
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  while (history.length > 0 && history[0].ts < oneHourAgo) {
    history.shift();
  }

  // Detect lifecycle transition
  updateLifecycle(stormId, metrics);
}

/**
 * Detect storm lifecycle phase: genesis, mature, decay
 */
function updateLifecycle(stormId, metrics) {
  if (!stormLifecycles.has(stormId)) {
    stormLifecycles.set(stormId, {
      start: Date.now(),
      lifecycle: 'genesis',
      phases: [],
    });
  }

  const lifecycle = stormLifecycles.get(stormId);
  const history = stormHistory.get(stormId) || [];

  if (history.length < 2) return;

  const prev = history[history.length - 2];
  const curr = metrics;

  const dbzTrend = curr.dbz - prev.dbz;
  const vilTrend = curr.vil - prev.vil;
  const topsTrend = curr.tops - prev.tops;
  const mesoTrend = curr.meso - prev.meso;

  // Determine phase based on trends
  if (lifecycle.lifecycle === 'genesis' && curr.dbz > 45 && vilTrend > 5) {
    lifecycle.lifecycle = 'mature';
    lifecycle.phases.push({ time: curr.ts, phase: 'mature' });
  } else if (lifecycle.lifecycle === 'mature' && dbzTrend < -5 && vilTrend < -5) {
    lifecycle.lifecycle = 'decay';
    lifecycle.phases.push({ time: curr.ts, phase: 'decay' });
  }
}

/**
 * Get trend data for plotting (reflectivity, VIL, tops, severity)
 */
export function getStormTrends(stormId) {
  const history = stormHistory.get(stormId);
  if (!history || history.length === 0) return null;

  const trends = {
    timestamps: [],
    reflectivity: [],
    vil: [],
    tops: [],
    severity: [],
    tornado: [],
  };

  history.forEach((m) => {
    const minAgo = Math.round((Date.now() - m.ts) / 60000);
    trends.timestamps.push(`-${minAgo}m`);
    trends.reflectivity.push(m.dbz);
    trends.vil.push(m.vil);
    trends.tops.push(m.tops);
    trends.severity.push(m.severity);
    trends.tornado.push(m.tornado);
  });

  return trends;
}

/**
 * Predict next position based on movement history
 */
export function predictStormMovement(cell, lookAheadMin = 30) {
  const history = stormHistory.get(cell.id);
  if (!history || history.length < 3) return null;

  // Use recent positions to estimate velocity
  const recentHistory = history.slice(-6); // Last ~6 updates
  let totalU = 0, totalV = 0;

  for (let i = 1; i < recentHistory.length; i++) {
    const prev = recentHistory[i - 1];
    const curr = recentHistory[i];
    const dtMin = (curr.ts - prev.ts) / 60000;

    const dlat = curr.lat - prev.lat;
    const dlon = curr.lon - prev.lon;

    totalU += dlon / dtMin; // longitudinal velocity (deg/min)
    totalV += dlat / dtMin; // latitudinal velocity (deg/min)
  }

  const avgU = totalU / (recentHistory.length - 1);
  const avgV = totalV / (recentHistory.length - 1);

  // Predict position
  const predictedLat = cell.lat + (avgV * lookAheadMin);
  const predictedLon = cell.lon + (avgU * lookAheadMin);

  return {
    lat: predictedLat,
    lon: predictedLon,
    timeMin: lookAheadMin,
    velocityLat: avgV,
    velocityLon: avgU,
  };
}

/**
 * Calculate storm growth/decay rate
 */
export function calculateGrowthRate(stormId) {
  const history = stormHistory.get(stormId);
  if (!history || history.length < 3) return null;

  const recentHistory = history.slice(-3);
  const rates = {
    reflectivity: 0,
    vil: 0,
    tops: 0,
    severity: 0,
  };

  for (let i = 1; i < recentHistory.length; i++) {
    const prev = recentHistory[i - 1];
    const curr = recentHistory[i];
    const dtMin = (curr.ts - prev.ts) / 60000;

    rates.reflectivity += (curr.dbz - prev.dbz) / dtMin;
    rates.vil += (curr.vil - prev.vil) / dtMin;
    rates.tops += (curr.tops - prev.tops) / dtMin;
    rates.severity += (curr.severity - prev.severity) / dtMin;
  }

  const count = recentHistory.length - 1;
  return {
    reflectivity: Math.round(rates.reflectivity / count * 10) / 10, // dBZ/min
    vil: Math.round(rates.vil / count),  // kg/m²/min
    tops: Math.round(rates.tops / count * 10) / 10, // kft/min
    severity: Math.round(rates.severity / count * 10) / 10, // points/min
  };
}

/**
 * Classify storm maturity
 */
export function classifyMaturity(stormId) {
  const lifecycle = stormLifecycles.get(stormId);
  if (!lifecycle) return 'unknown';
  return lifecycle.lifecycle;
}

/**
 * Calculate storm age in minutes
 */
export function getStormAge(stormId) {
  const lifecycle = stormLifecycles.get(stormId);
  if (!lifecycle) return 0;
  return Math.round((Date.now() - lifecycle.start) / 60000);
}

/**
 * Compare storms by similarity (used for merger prediction refinement)
 */
export function calculateStormSimilarity(stormId1, stormId2) {
  const hist1 = stormHistory.get(stormId1);
  const hist2 = stormHistory.get(stormId2);

  if (!hist1 || !hist2 || hist1.length === 0 || hist2.length === 0) return 0;

  const curr1 = hist1[hist1.length - 1];
  const curr2 = hist2[hist2.length - 1];

  // Compare severity, tornado score, hail score, structure
  const sevDiff = Math.abs(curr1.severity - curr2.severity);
  const torDiff = Math.abs(curr1.tornado - curr2.tornado);
  const hailDiff = Math.abs(curr1.hail - curr2.hail);

  // Similarity score 0-100 (higher = more similar)
  const similarity = 100 - ((sevDiff + torDiff + hailDiff) / 3);
  return Math.max(0, similarity);
}

/**
 * Clear history for a storm (when it dissipates)
 */
export function clearStormHistory(stormId) {
  stormHistory.delete(stormId);
  stormLifecycles.delete(stormId);
}

/** Drop tracking for storm IDs no longer present in the current cell feed
 * (each entry's own samples are already capped to 60 min, but the Map
 * itself grows by one key per storm ever seen without this). */
export function pruneStormHistory(activeIds) {
  for (const id of stormHistory.keys()) {
    if (!activeIds.has(id)) clearStormHistory(id);
  }
}

/**
 * Get all storms in database
 */
export function getAllStorms() {
  return Array.from(stormHistory.keys());
}

/**
 * Analyze post-merger impact (what happens after two storms merge)
 */
export function analyzeMergerImpact(survivingStormId, mergedStormId) {
  const survHistory = stormHistory.get(survivingStormId);
  if (!survHistory || survHistory.length === 0) return null;

  const curr = survHistory[survHistory.length - 1];
  const growth = calculateGrowthRate(survivingStormId);

  return {
    combinedSeverity: curr.severity,
    growthRate: growth.severity,
    potentialEnhancement: growth.severity > 5, // >5 points/min = rapid intensification
    newStructure: {
      reflectivity: curr.dbz,
      vil: curr.vil,
      mesocyclones: curr.meso,
      tvs: curr.tvs,
    },
  };
}
