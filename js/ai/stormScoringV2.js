/**
 * Enhanced Storm Scoring V2
 *
 * Improved algorithms for:
 * - Tornado scoring with TVS persistence
 * - Hail detection with freezing level
 * - Wind/CAPE shear interaction
 * - Mesocyclone strength tracking
 */

import { clamp, scaleTo } from '../utils.js';

/**
 * Enhanced tornado scoring incorporating:
 * - CAPE (convective instability)
 * - Shear (wind speed shear for rotation)
 * - TVS persistence (rotation lifetime)
 * - LCL (lifted condensation level - parcel origin)
 * - Mesocyclone strength
 */
export function calculateEnhancedTornadoScore(data) {
  const {
    cape = 0,
    shearKts = 0,
    lcl = 1500,
    tvsPersistence = 0,
    mesoRank = 0,
  } = data;

  // Normalize each component to 0-1
  const capeScore = Math.min(cape / 3500, 1.0);      // 3500 J/kg = strong
  const shearScore = Math.min(shearKts / 50, 1.0);   // 50 kt = strong shear
  const lclBonus = lcl < 1200 ? 1.25 : lcl < 1500 ? 1.1 : 1.0;  // Lower is better
  const persistenceBonus = Math.min(tvsPersistence / 4, 1.2);    // Rotation age weight
  const mesoScore = Math.min(mesoRank / 6, 1.0);     // Rank 6 = strong mesocyclone

  // Weighted combination (tornado = rotation + shear + instability)
  const tornadoPercent = Math.round(
    (
      capeScore * 0.25 +         // CAPE provides instability
      shearScore * 0.35 +        // Shear critical for rotation
      mesoScore * 0.40           // Mesocyclone is strongest predictor
    ) *
    lclBonus *                   // Lower LCL = stronger tornadoes
    persistenceBonus *           // Longer rotation = more likely tornado
    100
  );

  return clamp(tornadoPercent, 0, 100);
}

/**
 * Enhanced hail scoring incorporating:
 * - CAPE (updraft strength)
 * - Max reflectivity (hail core intensity)
 * - Freezing level (hail growth zone)
 * - ZDR (differential reflectivity for drop size)
 * - Echo top height (storm depth)
 */
export function calculateEnhancedHailScore(data) {
  const {
    cape = 0,
    maxDbz = 0,
    freezingLevelM = 4000,
    zdrDb = 0,
    echoTopKft = 0,
  } = data;

  // Component scoring
  const capeScore = Math.min(cape / 2000, 1.0);              // 2000+ J/kg = hail
  const reflScore = Math.min(Math.max(maxDbz - 45, 0) / 30, 1.0);  // 45-75 dBZ range
  const freezingBonus = freezingLevelM < 3000 ? 1.35 :
                       freezingLevelM < 3500 ? 1.15 : 1.0;
  const zdrBonus = zdrDb > 2.5 ? 1.2 : zdrDb > 1.5 ? 1.1 : 1.0;
  const topBonus = echoTopKft > 40 ? 1.15 : 1.0;

  const hailScore = Math.round(
    (
      capeScore * 0.30 +         // Strong updraft needed for hail
      reflScore * 0.50 +         // Reflectivity is primary
      zdrBonus * 0.10            // Dual-pol signature
    ) *
    freezingBonus *              // Low freezing level = larger hail
    topBonus *                   // Deep storm = hail growth
    100
  );

  return clamp(hailScore, 0, 100);
}

/**
 * Enhanced wind/derecho scoring incorporating:
 * - Reflectivity + VIL (convective intensity)
 * - Shear (wind organization)
 * - Storm motion speed (faster = worse)
 * - Echo top collapse (downburst proxy)
 */
export function calculateEnhancedWindScore(data) {
  const {
    maxDbz = 0,
    vil = 0,
    shearKts = 0,
    moveSpeedKts = 0,
    echoTopTrend = 0,
  } = data;

  const reflScore = Math.min(Math.max(maxDbz - 40, 0) / 30, 1.0);
  const vilScore = Math.min(vil / 60, 1.0);
  const shearScore = Math.min(shearKts / 60, 1.0);
  const motionBonus = moveSpeedKts > 40 ? 1.2 : moveSpeedKts > 30 ? 1.1 : 1.0;
  const downburstIndicator = echoTopTrend < -300 ? 1.3 : 1.0; // Top collapsing = downburst

  const windScore = Math.round(
    (
      reflScore * 0.35 +
      vilScore * 0.25 +
      shearScore * 0.40
    ) *
    motionBonus *
    downburstIndicator *
    100
  );

  return clamp(windScore, 0, 100);
}

/**
 * Enhanced lightning scoring:
 * - Echo top height (tall = lots of charge separation)
 * - Max reflectivity (intense = more updraft = more lightning)
 * - CAPE (instability = more vertical development)
 */
export function calculateEnhancedLightningScore(data) {
  const {
    echoTopKft = 0,
    maxDbz = 0,
    cape = 0,
  } = data;

  const topScore = Math.min(echoTopKft / 50, 1.0);    // 50 kft = very tall
  const reflScore = Math.min(Math.max(maxDbz - 30, 0) / 40, 1.0);
  const capeScore = Math.min(cape / 4000, 1.0);

  const lightningScore = Math.round(
    (topScore * 0.55 + reflScore * 0.30 + capeScore * 0.15) * 100
  );

  return clamp(lightningScore, 0, 100);
}

/**
 * Mesocyclone strength assessment combining:
 * - Radar mesocyclone rank (if available)
 * - TVS strength (velocity couplet intensity)
 * - Rotation persistence (how long it's been rotating)
 */
export function assessMesocycloneStrength(data) {
  const {
    mesoRank = 0,
    tvsStrength = 0,
    tvsPersistence = 0,
  } = data;

  const mesoScore = scaleTo(mesoRank, 0, 6, 40);
  const tvsScore = Math.min(tvsStrength / 60, 1.0) * 40; // kt to normalized
  const persistenceScore = Math.min(tvsPersistence / 8, 1.0) * 20;

  const strength = clamp(mesoScore + tvsScore + persistenceScore, 0, 100);

  return {
    strength: Math.round(strength),
    label: strength < 30 ? 'weak' : strength < 60 ? 'moderate' : 'strong',
    tornadoLikelihood: strength > 70 ? 'high' : strength > 40 ? 'moderate' : 'low'
  };
}

/**
 * Rapid intensification detection:
 * Did the storm's overall threat jump significantly in the last 5 minutes?
 */
export function detectRapidIntensification(currentScores, priorScores, interval = 5) {
  if (!priorScores) return null;

  const current = currentScores.rotation + currentScores.hail + currentScores.wind;
  const prior = priorScores.rotation + priorScores.hail + priorScores.wind;
  const change = current - prior;

  return {
    isIntensifying: change > 20,
    change: Math.round(change),
    interval,
    trend: change > 0 ? 'up' : 'down'
  };
}

/**
 * Storm comparison utility for side-by-side analysis
 */
export function compareStorms(storm1, storm2) {
  return {
    tornado: {
      s1: storm1.scores.rotation,
      s2: storm2.scores.rotation,
      delta: storm1.scores.rotation - storm2.scores.rotation
    },
    hail: {
      s1: storm1.scores.hail,
      s2: storm2.scores.hail,
      delta: storm1.scores.hail - storm2.scores.hail
    },
    wind: {
      s1: storm1.scores.wind,
      s2: storm2.scores.wind,
      delta: storm1.scores.wind - storm2.scores.wind
    },
    lightning: {
      s1: storm1.scores.lightning,
      s2: storm2.scores.lightning,
      delta: storm1.scores.lightning - storm2.scores.lightning
    },
    trend: {
      s1: storm1.trend?.label || 'unknown',
      s2: storm2.trend?.label || 'unknown'
    },
    overall: {
      s1: storm1.severeScore,
      s2: storm2.severeScore,
      delta: storm1.severeScore - storm2.severeScore
    }
  };
}
