/**
 * Storm Evolution Alerts
 *
 * Detects:
 * - Storm mergers (two cells converging)
 * - Rapid intensification (score jump)
 * - Rotation development (TVS strengthening)
 * - Weakening/occlusion events
 */

import { haversineKm } from '../utils.js';
import { detectRapidIntensification } from '../ai/stormScoringV2.js';

/** Track prior scores for RII detection */
const priorScores = new Map();

/**
 * Detect storms that are likely to merge in next 30 minutes
 */
export function detectStormMergers(storms) {
  const mergers = [];

  for (let i = 0; i < storms.length; i++) {
    for (let j = i + 1; j < storms.length; j++) {
      const s1 = storms[i];
      const s2 = storms[j];

      // Both storms need to be significant
      if (s1.severeScore < 30 || s2.severeScore < 30) continue;

      const dist = haversineKm(s1.cell.lat, s1.cell.lon, s2.cell.lat, s2.cell.lon);

      // Only care about storms within 80 km
      if (dist > 80) continue;

      // Calculate storm motion vectors (in km/min)
      const speed1 = (s1.cell.moveSpeedKts || 25) * 0.0515; // kt to km/min
      const speed2 = (s2.cell.moveSpeedKts || 25) * 0.0515;
      const dir1 = s1.cell.moveDirDeg || 270;
      const dir2 = s2.cell.moveDirDeg || 270;

      // Vector components
      const v1x = speed1 * Math.cos(dir1 * Math.PI / 180);
      const v1y = speed1 * Math.sin(dir1 * Math.PI / 180);
      const v2x = speed2 * Math.cos(dir2 * Math.PI / 180);
      const v2y = speed2 * Math.sin(dir2 * Math.PI / 180);

      // Relative velocity (how fast are they approaching?)
      const relVx = v1x - v2x;
      const relVy = v1y - v2y;
      const closure = Math.sqrt(relVx * relVx + relVy * relVy);

      // Time to merge (in minutes)
      const timeToMerge = closure > 0 ? Math.round(dist / closure) : 999;

      // Alert only if merging within 30 min and getting closer
      if (timeToMerge <= 30 && timeToMerge > 0) {
        mergers.push({
          storm1Id: s1.cell.id,
          storm1Name: s1.type.label,
          storm2Id: s2.cell.id,
          storm2Name: s2.type.label,
          currentDistanceKm: Math.round(dist * 10) / 10,
          closureRateKtMin: Math.round(closure * 60 * 10) / 10,  // Convert to kt/min
          estimatedMergeTimeMin: timeToMerge,
          combinedScore: Math.round((s1.severeScore + s2.severeScore) / 2),
          alertLevel: timeToMerge < 10 ? 'critical' : timeToMerge < 20 ? 'high' : 'moderate'
        });
      }
    }
  }

  return mergers;
}

/**
 * Detect rapid intensification in a storm
 * Returns alert if score jumped significantly in last 5 min
 */
export function detectStormIntensification(storm) {
  const currentScores = {
    rotation: storm.scores.rotation,
    hail: storm.scores.hail,
    wind: storm.scores.wind,
    organization: storm.scores.organization
  };

  const prior = priorScores.get(storm.cell.id);
  const riiInfo = detectRapidIntensification(currentScores, prior);

  // Store current for next comparison
  priorScores.set(storm.cell.id, currentScores);

  if (!riiInfo || riiInfo.change < 15) return null;

  return {
    stormId: storm.cell.id,
    stormType: storm.type.label,
    scoreChange: riiInfo.change,
    currentScore: Math.round((currentScores.rotation + currentScores.hail + currentScores.wind) / 3),
    trend: riiInfo.trend,
    interval: '5 minutes',
    message: riiInfo.trend === 'up' ?
      `${storm.type.label} RAPIDLY INTENSIFYING (+${riiInfo.change} points)` :
      `${storm.type.label} weakening (-${Math.abs(riiInfo.change)} points)`,
    alertLevel: riiInfo.trend === 'up' ? 'critical' : 'info'
  };
}

/**
 * Detect rotation development - TVS just appeared or strengthened
 */
export function detectRotationDevelopment(storm, priorStorm) {
  if (!priorStorm) return null;

  const tvsAppeared = !priorStorm.cell.tvs && storm.cell.tvs;
  const mesoStrengthened = priorStorm.cell.meso && storm.cell.meso &&
                           storm.cell.meso > priorStorm.cell.meso + 1;
  const rotationScoreJumped = storm.scores.rotation > priorStorm.scores.rotation + 15;

  if (tvsAppeared) {
    return {
      stormId: storm.cell.id,
      type: 'TVS Appeared',
      severity: 'critical',
      message: `Tornado Vortex Signature DETECTED on ${storm.type.label}`,
      confidence: 0.95
    };
  }

  if (mesoStrengthened) {
    return {
      stormId: storm.cell.id,
      type: 'Mesocyclone Intensifying',
      severity: 'high',
      message: `Mesocyclone strength increased: Rank ${priorStorm.cell.meso} → ${storm.cell.meso}`,
      confidence: 0.85
    };
  }

  if (rotationScoreJumped) {
    return {
      stormId: storm.cell.id,
      type: 'Rotation Developing',
      severity: 'high',
      message: `Rotation score jumped ${storm.scores.rotation - priorStorm.scores.rotation} points`,
      confidence: 0.80
    };
  }

  return null;
}

/**
 * Detect potential occlusion (weakening rotation + reflectivity collapse)
 * Supercells can occlude and weaken suddenly
 */
export function detectOcclusionRisk(storm, priorStorm) {
  if (!priorStorm) return null;

  const rotationWeakened = priorStorm.scores.rotation > 50 &&
                          storm.scores.rotation < priorStorm.scores.rotation - 20;
  const reflectivityDropped = storm.cell.maxDbz < priorStorm.cell.maxDbz - 10;
  const topCollapsing = storm.cell.topKft && priorStorm.cell.topKft &&
                        storm.cell.topKft < priorStorm.cell.topKft - 10;

  if (rotationWeakened && (reflectivityDropped || topCollapsing)) {
    return {
      stormId: storm.cell.id,
      type: 'Occlusion Risk',
      severity: 'moderate',
      message: `${storm.type.label} shows signs of occlusion (rotation weakening, reflectivity collapsing)`,
      recommendation: 'Consider switching to developing cell nearby',
      confidence: 0.75
    };
  }

  return null;
}

/**
 * Generate storm evolution alert message
 */
export function generateEvolutionAlert(evolutionEvent) {
  if (!evolutionEvent) return null;

  return {
    title: evolutionEvent.message,
    type: evolutionEvent.alertLevel || evolutionEvent.severity,
    timestamp: new Date(),
    stormId: evolutionEvent.stormId || `${evolutionEvent.storm1Id}-${evolutionEvent.storm2Id}`,
    details: {
      ...evolutionEvent
    }
  };
}

/**
 * Clean up stale prior score data
 */
export function cleanupStaleScores(maxAgeSeconds = 600) {
  // In production, would track timestamps for each entry
  // For now, just clear if too many entries
  if (priorScores.size > 500) {
    priorScores.clear();
  }
}

/**
 * Predict merger impact (what happens when storms merge?)
 */
export function predictMergerImpact(merger) {
  // Merged storm intensity = average + bonus for interaction
  const mergedScore = merger.combinedScore + 15; // Typically +15 points on merger

  return {
    merger,
    predictedMergedScore: Math.min(mergedScore, 100),
    expectedThreatLevel: mergedScore > 70 ? 'extreme' : mergedScore > 50 ? 'high' : 'moderate',
    likelyOutcome:
      merger.closureRateKtMin > 60 ? 'Violent collision - severe threats' :
      merger.closureRateKtMin > 40 ? 'Strong merger - enhanced tornado/hail' :
      'Gradual interaction - moderate enhancement',
    warningRecommendation: mergedScore > 70 ?
      'NEW TORNADO WARNING may be needed on merged storm' :
      'Monitor merged storm closely'
  };
}
