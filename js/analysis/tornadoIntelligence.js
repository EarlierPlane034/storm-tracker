/**
 * Tornado intelligence.
 *
 * Produces a 0–100 Tornado Potential Score, a plain-language chance band
 * with an estimated percentage, a time window, and the reasoning behind it.
 *
 * Blend (weights chosen to mirror how forecasters weigh evidence):
 *   45%  radar rotation evidence  (mesocyclone rank, TVS, persistence, trend)
 *   35%  environment              (SRH, low-level & deep shear, CAPE, LCL, CIN)
 *   10%  storm trend/organization (strengthening + supercell structure)
 *   10%  official context         (warnings on the storm, watch environment)
 *
 * IMPORTANT: this is an automated estimate from public data. It is NOT an
 * official forecast, and every rendering of it carries that disclaimer.
 */
import { CONFIG } from '../config.js';
import { clamp, scaleTo } from '../utils.js';
import { trendOf } from './trends.js';

export function analyzeTornadoPotential({
  cell, env, rotation, persistence, trend, warnings, type, factors, sens,
}) {
  const reasons = [];   // strings assembled into the explanation
  const negatives = []; // limiting factors — stated honestly

  // ---------- Radar rotation component (0–45) -------------------------------
  let radarPts = 0;
  if (cell.tvs) {
    radarPts += 24;
    reasons.push('a tornado vortex signature (tight gate-to-gate shear) is being detected');
  }
  if (cell.meso > 0) {
    radarPts += scaleTo(cell.meso, 0, 12, 14);
    reasons.push(`a mesocyclone is present (strength rank ${cell.meso})`);
  } else {
    negatives.push('no mesocyclone is currently detected by the radar algorithms');
  }
  if (persistence >= 3) {
    radarPts += Math.min(5, persistence);
    reasons.push(`the circulation has persisted for ${persistence} consecutive scans`);
  }
  if (cell.meso > 0 && trendOf(cell.id, 'meso', 20) > 0.05) {
    radarPts += 4;
    reasons.push('rotation has been strengthening scan-to-scan');
  }
  radarPts = clamp(radarPts, 0, 45);

  // ---------- Environmental component (0–35) ---------------------------------
  let envPts = 0;
  if (env) {
    const srhPts = scaleTo(Math.abs(env.srh ?? 0), 50, 350, 11);
    const lowShearPts = scaleTo(env.lowShearKts, 10, 35, 8);
    const deepShearPts = scaleTo(env.bulkShearKts, 25, 60, 6);
    const capePts = scaleTo(env.cape, 250, 3000, 6);
    // Low LCLs strongly favor tornadogenesis; high LCLs suppress it.
    const lclPts = env.lclM != null ? scaleTo(1600 - env.lclM, 0, 1200, 4) : 2;
    envPts = srhPts + lowShearPts + deepShearPts + capePts + lclPts;

    if (srhPts > 6) reasons.push(`storm-relative helicity is strong (~${env.srh} m²/s²)`);
    if (lowShearPts > 5) reasons.push('low-level wind shear is favorable');
    if (capePts > 4) reasons.push(`instability is supportive (CAPE ≈ ${Math.round(env.cape)} J/kg)`);
    if (env.lclM != null && env.lclM < 1000) reasons.push('cloud bases are low, which favors tornado formation');
    if (env.lclM != null && env.lclM > 1800) negatives.push('cloud bases are high, which usually inhibits tornadoes');
    if (env.cape != null && env.cape < 300) negatives.push('instability is weak');
    if (env.cin != null && env.cin < -75) negatives.push('a capping inversion is suppressing low-level parcels');
    if ((env.srh ?? 0) < 50 && env.lowShearKts != null && env.lowShearKts < 10) {
      negatives.push('the wind field shows little low-level turning');
    }
  } else {
    // Without environment data, stay conservative and say so.
    envPts = 8;
    negatives.push('model environment data is unavailable, so this estimate leans conservative');
  }
  envPts = clamp(envPts, 0, 35);

  // ---------- Trend / structure component (0–10) ------------------------------
  let trendPts = 0;
  if (trend.label === 'strengthening') {
    trendPts += 5;
    reasons.push('the storm itself is strengthening');
  }
  if (type.id === 'supercell') trendPts += 4;
  if (type.id === 'qlcs-meso') {
    trendPts += 3;
    reasons.push('QLCS circulations can spin up tornadoes with very little lead time');
  }
  if (trend.label === 'weakening') {
    trendPts -= 3;
    negatives.push('the storm has been weakening');
  }
  trendPts = clamp(trendPts, 0, 10);

  // ---------- Official context component (0–10) --------------------------------
  let ctxPts = 0;
  const torWarned = warnings.some((w) => w.kind === 'tor-warning');
  const torWatch = warnings.some((w) => w.kind === 'tor-watch');
  if (torWarned) {
    ctxPts += 10;
    reasons.push('the NWS has issued a Tornado Warning for this storm');
  } else if (torWatch) {
    ctxPts += 5;
    reasons.push('the storm is inside a Tornado Watch environment');
  }

  // ---------- Blend -------------------------------------------------------------
  let score = (radarPts + envPts + trendPts + ctxPts) * (sens ?? 1);
  // Rotation is a prerequisite: without any detected rotation the score is
  // capped low regardless of how favorable the environment looks.
  if (!cell.tvs && cell.meso === 0) score = Math.min(score, 22);
  score = clamp(Math.round(score), 0, 100);

  const band = CONFIG.analysis.torBands.find((b) => score <= b.max)
    ?? CONFIG.analysis.torBands.at(-1);

  // Time window: tighter when evidence is immediate (TVS/warning), wider
  // when the signal is mostly environmental.
  const windowMin = cell.tvs || torWarned ? 15 : cell.meso >= 3 ? 30 : 60;

  // Confidence from evidence quality, not threat level.
  let confidence = 'Low';
  const evidence = (env ? 1 : 0) + (persistence >= 3 ? 1 : 0) + (cell.meso > 0 || cell.tvs ? 1 : 0);
  if (evidence >= 3) confidence = 'High';
  else if (evidence === 2) confidence = 'Medium';

  return {
    score,
    label: band.label,
    pct: band.pct,
    windowMin,
    confidence,
    reasons,
    negatives,
    components: {
      radar: Math.round(radarPts),
      environment: Math.round(envPts),
      trend: Math.round(trendPts),
      context: Math.round(ctxPts),
    },
  };
}
