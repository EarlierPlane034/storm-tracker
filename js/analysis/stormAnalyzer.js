/**
 * Storm analysis engine.
 *
 * Fuses, for every detected storm cell:
 *   - NEXRAD Level III attributes (max dBZ, VIL, echo top, TVS, mesocyclone
 *     rank, hail probability/size, motion),
 *   - the model environment near the storm (CAPE, CIN, shear, SRH, LCL...),
 *   - active NWS warnings whose polygon contains the cell,
 *   - nearby local storm reports,
 *   - the cell's own trend history,
 * into 0–100 hazard scores, a storm-type guess, and structured "factors"
 * that the narrative layer turns into plain English.
 *
 * These are heuristic interpretations of official data — clearly labelled
 * as unofficial everywhere they surface in the UI.
 */
import { clamp, scaleTo, haversineKm } from '../utils.js';
import { settings } from '../storage.js';
import {
  recordSample, getHistory, pruneStale, stormTrend,
  rotationPersistence, isRapidlyIntensifying, trendOf,
} from './trends.js';
import { analyzeTornadoPotential } from './tornadoIntelligence.js';

/** Sensitivity multipliers applied to final scores. */
const SENSITIVITY = { conservative: 0.85, balanced: 1.0, aggressive: 1.15 };

/**
 * Analyze all cells. Returns array sorted most→least dangerous.
 * @param {Array} cells       normalized cells from iem.fetchStormCells
 * @param {Object} environment from openmeteo.fetchEnvironment (may be null)
 * @param {Array} alerts      normalized NWS alerts (with geometry)
 * @param {Array} reports     local storm reports
 * @param {Object} user       {lat, lon} or null
 */
export function analyzeStorms(cells, environment, alerts, reports, user) {
  const now = Date.now();
  const activeIds = new Set(cells.map((c) => c.id));
  pruneStale(activeIds);

  const results = cells.map((cell) => {
    // Record BEFORE scoring so trends include the current volume scan.
    recordSample(cell.id, {
      t: cell.valid?.getTime?.() || now,
      maxDbz: cell.maxDbz, vil: cell.vil, topKft: cell.topKft,
      meso: cell.meso, tvs: cell.tvs,
      hailIn: cell.maxHailIn, posh: cell.posh,
      lat: cell.lat, lon: cell.lon,
    });
    return analyzeCell(cell, environment, alerts, reports, user, cells);
  });

  results.sort((a, b) => b.severeScore - a.severeScore);
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}

function analyzeCell(cell, env, alerts, reports, user, allCells) {
  const factors = [];   // {text, weight, hazard} — feeds the narrative layer
  const sens = SENSITIVITY[settings.aiSensitivity] ?? 1;
  const trend = stormTrend(cell.id);
  const persistence = rotationPersistence(cell.id);
  const warnings = warningsContaining(cell, alerts);
  const nearbyReports = reports.filter(
    (r) => haversineKm(cell.lat, cell.lon, r.lat, r.lon) < 40,
  );

  // ---------- Rotation score ------------------------------------------------
  let rotation = 0;
  if (cell.meso > 0) {
    rotation += scaleTo(cell.meso, 0, 12, 60);
    factors.push({ hazard: 'rotation', weight: rotation, text: `the ${cell.site} radar is detecting a mesocyclone (strength rank ${cell.meso})` });
  }
  if (cell.tvs) {
    rotation += 35;
    factors.push({ hazard: 'rotation', weight: 35, text: 'a Tornado Vortex Signature (tight gate-to-gate velocity couplet) is flagged on this storm' });
  }
  if (persistence >= 3) {
    rotation += Math.min(15, persistence * 3);
    factors.push({ hazard: 'rotation', weight: 10, text: `rotation has persisted for ${persistence} consecutive scans` });
  }
  if (trendOf(cell.id, 'meso', 20) > 0.05 && cell.meso > 0) {
    rotation += 8;
    factors.push({ hazard: 'rotation', weight: 8, text: 'low-level rotation is strengthening over recent scans' });
  }
  rotation = clamp(rotation * sens, 0, 100);

  // ---------- Hail score ----------------------------------------------------
  let hail = 0;
  hail += scaleTo(cell.posh, 0, 100, 45);
  hail += scaleTo(cell.maxHailIn, 0.5, 2.5, 35);
  hail += scaleTo(cell.vil, 25, 70, 20);
  if (cell.maxDbz >= 60 && cell.maxDbzHeightKft >= 15) {
    hail += 10;
    factors.push({ hazard: 'hail', weight: 10, text: 'an elevated intense reflectivity core (a classic hail-growth signature) is present' });
  }
  if (cell.posh >= 50) factors.push({ hazard: 'hail', weight: 20, text: `the radar hail algorithm shows a ${cell.posh}% probability of severe hail${cell.maxHailIn ? ` with sizes to ${cell.maxHailIn.toFixed(1)}"` : ''}` });
  if (env?.freezingLevelM != null && env.freezingLevelM < 3500 && hail > 30) {
    hail += 6;
    factors.push({ hazard: 'hail', weight: 6, text: 'a low freezing level lets hail reach the ground with less melting' });
  }
  const hailReports = nearbyReports.filter((r) => /hail/i.test(r.type));
  if (hailReports.length) {
    hail += 12;
    factors.push({ hazard: 'hail', weight: 12, text: `spotters have already reported hail near this storm (${hailReports[0].city || 'nearby'})` });
  }
  hail = clamp(hail * sens, 0, 100);

  // ---------- Damaging wind score --------------------------------------------
  let wind = 0;
  wind += scaleTo(cell.maxDbz, 50, 70, 30);
  wind += scaleTo(cell.vil, 30, 65, 20);
  wind += scaleTo(cell.moveSpeedKts, 25, 55, 20);
  if (cell.moveSpeedKts >= 35) factors.push({ hazard: 'wind', weight: 15, text: `fast storm motion (${Math.round(cell.moveSpeedKts)} kt) favors damaging straight-line gusts` });
  // Downburst proxy: tall high-VIL storm whose core height is collapsing.
  if (trendOf(cell.id, 'maxDbzHeightKft', 15) < -0.3 && cell.vil > 40) {
    wind += 18;
    factors.push({ hazard: 'wind', weight: 18, text: 'the storm core is descending — a downburst/microburst precursor' });
  }
  if (env?.bulkShearKts >= 40) {
    wind += 10;
    factors.push({ hazard: 'wind', weight: 10, text: 'strong deep-layer shear supports organized damaging-wind structures (bow echoes / rear-inflow jets)' });
  }
  const windReports = nearbyReports.filter((r) => /wind|tstm wnd/i.test(r.type));
  if (windReports.length) {
    wind += 12;
    factors.push({ hazard: 'wind', weight: 12, text: 'wind damage has already been reported with this storm' });
  }
  wind = clamp(wind * sens, 0, 100);

  // ---------- Flash flood score ----------------------------------------------
  let flood = 0;
  flood += scaleTo(cell.maxDbz, 45, 60, 30);
  if (cell.moveSpeedKts != null && cell.moveSpeedKts < 12) {
    flood += 25;
    factors.push({ hazard: 'flood', weight: 25, text: `slow storm motion (${Math.round(cell.moveSpeedKts)} kt) prolongs heavy rainfall over the same areas` });
  }
  // Training proxy: another strong cell upstream moving along the same track.
  const training = allCells.some((o) =>
    o.id !== cell.id && o.maxDbz >= 45 &&
    haversineKm(cell.lat, cell.lon, o.lat, o.lon) < 60 &&
    angleDiff(o.moveDirDeg, cell.moveDirDeg) < 25 &&
    isUpstream(cell, o));
  if (training) {
    flood += 20;
    factors.push({ hazard: 'flood', weight: 20, text: 'storms are training — repeated cells are tracking over the same corridor' });
  }
  if (env?.precipProb >= 80) flood += 8;
  if (warnings.some((w) => w.kind === 'ffw-warning')) {
    flood += 20;
    factors.push({ hazard: 'flood', weight: 20, text: 'a Flash Flood Warning is already in effect here' });
  }
  flood = clamp(flood * sens, 0, 100);

  // ---------- Lightning score (proxy) -----------------------------------------
  // No free public lightning network feed: use storm depth/intensity as a
  // proxy and say so. Tall, intense cores are prolific lightning producers.
  let lightning = 0;
  lightning += scaleTo(cell.topKft, 25, 55, 55);
  lightning += scaleTo(cell.maxDbz, 40, 65, 45);
  if (lightning > 60) factors.push({ hazard: 'lightning', weight: 10, text: 'a deep, intense updraft implies frequent lightning (estimated from storm depth — live strike data is not available in this feed)' });
  lightning = clamp(lightning, 0, 100);

  // ---------- Organization score ----------------------------------------------
  let organization = 0;
  organization += scaleTo(cell.vil, 20, 60, 25);
  organization += scaleTo(cell.topKft, 25, 55, 20);
  organization += cell.meso > 0 ? 25 : 0;
  organization += Math.min(20, persistence * 4);
  organization += getHistory(cell.id).length >= 5 ? 10 : 0;
  organization = clamp(organization, 0, 100);

  // ---------- Storm type classification ----------------------------------------
  const type = classifyStorm(cell, allCells, organization);
  if (type.id === 'supercell') factors.push({ hazard: 'general', weight: 15, text: `radar structure is consistent with a ${type.label.toLowerCase()}` });
  if (type.id === 'qlcs') factors.push({ hazard: 'general', weight: 10, text: 'this cell is embedded in a squall line (QLCS) — brief spin-ups and damaging winds are the main threats' });

  // ---------- Tornado intelligence ----------------------------------------------
  const tornado = analyzeTornadoPotential({
    cell, env, rotation, persistence, trend, warnings, type, factors, sens,
  });

  // ---------- Severe score (headline 0–100) --------------------------------------
  let severe =
    0.30 * Math.max(tornado.score, rotation) +
    0.25 * hail +
    0.22 * wind +
    0.13 * flood +
    0.10 * organization;
  if (warnings.some((w) => w.kind === 'tor-warning')) {
    severe = Math.max(severe, 80);
    factors.push({ hazard: 'general', weight: 30, text: 'the NWS has an active Tornado Warning on this storm' });
  } else if (warnings.some((w) => w.kind === 'svr-warning')) {
    severe = Math.max(severe, 55);
    factors.push({ hazard: 'general', weight: 20, text: 'the NWS has an active Severe Thunderstorm Warning on this storm' });
  }
  if (isRapidlyIntensifying(cell.id)) {
    severe = clamp(severe + 8, 0, 100);
    factors.push({ hazard: 'general', weight: 12, text: 'the storm is rapidly intensifying (reflectivity, VIL and rotation all climbing quickly)' });
  }
  if (trend.label === 'weakening') {
    severe = clamp(severe - 6, 0, 100);
    factors.push({ hazard: 'general', weight: -8, text: 'the storm has been weakening over the last several scans' });
  }
  severe = clamp(Math.round(severe * sens), 0, 100);

  // ---------- Confidence ------------------------------------------------------
  const confidence = computeConfidence(cell, env, getHistory(cell.id).length);

  // ---------- User-relative geometry -------------------------------------------
  let userRel = null;
  if (user) {
    const distKm = haversineKm(user.lat, user.lon, cell.lat, cell.lon);
    userRel = { distKm, etaMin: etaMinutes(cell, user, distKm) };
  }

  return {
    cell, type, warnings, trend, persistence,
    severeScore: severe,
    scores: { rotation: Math.round(rotation), hail: Math.round(hail), wind: Math.round(wind), flood: Math.round(flood), lightning: Math.round(lightning), organization: Math.round(organization) },
    tornado,
    confidence,
    factors: factors.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    nearbyReports,
    userRel,
    threatRating: ratingBand(severe),
  };
}

/** Angle difference in degrees (0–180). */
function angleDiff(a, b) {
  if (a == null || b == null) return 180;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** True if `other` sits upstream of `cell` along cell's motion vector. */
function isUpstream(cell, other) {
  if (cell.moveDirDeg == null) return false;
  const brg = Math.atan2(other.lon - cell.lon, other.lat - cell.lat) * 180 / Math.PI;
  const upstream = (cell.moveDirDeg + 180) % 360;
  return angleDiff(((brg % 360) + 360) % 360, upstream) < 45;
}

/**
 * Storm-type heuristic. True morphology (hook echoes, BWERs, bow shape)
 * requires gridded imagery analysis; this uses attribute-level evidence
 * and is presented as a "structure consistent with X" statement.
 */
function classifyStorm(cell, allCells, organization) {
  // Line detection: 4+ strong cells roughly collinear within 150 km.
  const strongNear = allCells.filter((o) =>
    o.maxDbz >= 45 && haversineKm(cell.lat, cell.lon, o.lat, o.lon) < 150);
  const inLine = strongNear.length >= 4 && isRoughlyLinear(strongNear);

  if (cell.meso >= 3 || cell.tvs) {
    if (inLine) return { id: 'qlcs-meso', label: 'QLCS Mesovortex', desc: 'Rotating circulation embedded in a squall line. Can produce quick, low-visibility tornado spin-ups.' };
    // HP vs classic vs LP from precipitation loading (VIL) vs depth.
    if (cell.vil >= 55) return { id: 'supercell', label: 'HP Supercell', desc: 'High-precipitation supercell — rotation is often rain-wrapped and hard to see; flash flooding and hail also likely.' };
    if (cell.vil != null && cell.vil < 30 && cell.topKft >= 40) return { id: 'supercell', label: 'LP Supercell', desc: 'Low-precipitation supercell — large hail is the main threat; structure is usually highly visible.' };
    return { id: 'supercell', label: 'Classic Supercell', desc: 'Rotating supercell — capable of all severe hazards including tornadoes.' };
  }
  if (inLine) return { id: 'qlcs', label: 'Squall Line (QLCS)', desc: 'Quasi-linear convective system — damaging straight-line winds and brief spin-ups are the main threats.' };
  if (organization >= 55) return { id: 'multicell', label: 'Organized Multicell', desc: 'Organized multicell cluster — hail and gusty winds possible.' };
  if (cell.maxDbz >= 50) return { id: 'strongcell', label: 'Strong Cell', desc: 'Strong thunderstorm — small hail, gusty winds and frequent lightning possible.' };
  return { id: 'ordinary', label: 'Thunderstorm', desc: 'Ordinary thunderstorm.' };
}

function isRoughlyLinear(cells) {
  if (cells.length < 3) return false;
  // Least-squares fit of positions; linear if residual spread is small
  // compared to the line's length.
  const mx = cells.reduce((s, c) => s + c.lon, 0) / cells.length;
  const my = cells.reduce((s, c) => s + c.lat, 0) / cells.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const c of cells) {
    sxx += (c.lon - mx) ** 2;
    sxy += (c.lon - mx) * (c.lat - my);
    syy += (c.lat - my) ** 2;
  }
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  if (trace === 0) return false;
  // Ratio of minor to major eigenvalue: small => elongated (linear).
  const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  const minor = (trace - disc) / 2;
  const major = (trace + disc) / 2;
  return major > 0 && minor / major < 0.15;
}

function computeConfidence(cell, env, historyLen) {
  let pts = 0;
  if (env) pts += 2;                    // model environment available
  if (historyLen >= 5) pts += 2;        // enough scans to trust trends
  else if (historyLen >= 2) pts += 1;
  if (cell.vil != null && cell.topKft != null) pts += 1;
  if (pts >= 4) return 'High';
  if (pts >= 2) return 'Medium';
  return 'Low';
}

/** Minutes until the storm reaches the user's location (null if moving away). */
function etaMinutes(cell, user, distKm) {
  if (cell.moveDirDeg == null || !cell.moveSpeedKts) return null;
  const brgToUser = Math.atan2(
    Math.sin((user.lon - cell.lon) * Math.PI / 180) * Math.cos(user.lat * Math.PI / 180),
    Math.cos(cell.lat * Math.PI / 180) * Math.sin(user.lat * Math.PI / 180) -
    Math.sin(cell.lat * Math.PI / 180) * Math.cos(user.lat * Math.PI / 180) *
    Math.cos((user.lon - cell.lon) * Math.PI / 180),
  ) * 180 / Math.PI;
  const diff = angleDiff(((brgToUser % 360) + 360) % 360, cell.moveDirDeg);
  if (diff > 45) return null; // not heading toward the user
  const closingKmh = cell.moveSpeedKts * 1.852 * Math.cos(diff * Math.PI / 180);
  if (closingKmh <= 5) return null;
  return Math.round((distKm / closingKmh) * 60);
}

export function ratingBand(score) {
  if (score >= 81) return { id: 'extreme', label: 'Extreme' };
  if (score >= 61) return { id: 'high', label: 'High' };
  if (score >= 41) return { id: 'elev', label: 'Elevated' };
  if (score >= 21) return { id: 'low', label: 'Low' };
  return { id: 'verylow', label: 'Very Low' };
}

function warningsContaining(cell, alerts) {
  return alerts.filter((a) => a.geometry && pointInGeometry(cell.lat, cell.lon, a.geometry));
}

/** Point-in-polygon for GeoJSON Polygon/MultiPolygon (ray casting). */
export function pointInGeometry(lat, lon, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const poly of polys) {
    let inside = false;
    const ring = poly[0] || [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > lat) !== (yj > lat)) &&
          lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}
