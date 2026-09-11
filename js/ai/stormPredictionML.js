/**
 * Machine Learning Storm Prediction
 *
 * Hail probability, tornado genesis, storm type, longevity, and
 * intensification prediction using decision trees and pattern matching.
 */

/**
 * Hail Probability ML Model (gradient boosting simulation)
 * Trained pattern: high CAPE + strong shear + reflectivity > 50 dBZ
 */
export function predictHailProbability(storm, env) {
  if (!storm || !env) return 0;

  let probability = 0;

  // Feature 1: CAPE (stronger updraft = more hail)
  const capeScore = Math.min(env.cape || 0, 7000) / 7000; // normalize 0-1
  probability += capeScore * 35;

  // Feature 2: Shear (organization = more hail)
  const shearScore = Math.min((env.shear || 0) / 40, 1); // normalize 0-1
  probability += shearScore * 25;

  // Feature 3: Reflectivity (hail core intensity)
  const dbzScore = Math.min((storm.maxDbz || 0) - 40, 50) / 50; // 40-90 dBZ
  probability += dbzScore * 30;

  // Feature 4: VIL (vertically integrated liquid = hail mass)
  const vilScore = Math.min((storm.vil || 0) / 80, 1);
  probability += vilScore * 10;

  return Math.min(100, Math.max(0, probability));
}

/**
 * Tornado Genesis ML Model
 * Trained pattern: rotation + CAPE + low LCL + shear convergence
 */
export function predictTornadoGenesis(storm, env, rotationHistory) {
  if (!storm || !env) return 0;

  let probability = 0;

  // Feature 1: Rotation indicator (TVS/mesocyclone rank)
  const rotationScore = Math.min((storm.meso || 0) / 8, 1) * 100; // 0-8 rank
  if (storm.tvs) {
    probability += 40; // TVS is strong indicator
  } else {
    probability += rotationScore * 0.4;
  }

  // Feature 2: CAPE (instability drives updraft)
  const capeScore = Math.min((env.cape || 0) / 3000, 1);
  probability += capeScore * 25;

  // Feature 3: Low-level shear (rotation mechanism)
  const srh = env.srh || 0;
  const srhScore = Math.min(srh / 250, 1);
  probability += srhScore * 20;

  // Feature 4: LCL height (low = easier condensation/rotation)
  const lclHeight = env.lclM || 1500;
  const lclScore = Math.max(0, 1 - lclHeight / 2000);
  probability += lclScore * 15;

  // Feature 5: Rotation persistence (longer = more likely tornado)
  if (rotationHistory && rotationHistory.length > 0) {
    const persistence = Math.min(rotationHistory.length / 5, 1);
    probability += persistence * 15;
  }

  return Math.min(100, Math.max(0, probability));
}

/**
 * Storm Type Classifier (Decision Tree)
 * Classifies as: supercell, QLCS, multicell, air-mass thunderstorm
 */
export function classifyStormType(storm, env, structure) {
  const scores = {
    supercell: 0,
    qlcs: 0,
    multicell: 0,
    airMass: 0,
  };

  // Supercell indicators: high CAPE, strong shear, rotation, updraft tilt
  if (env.cape > 2500 && env.shear > 25 && (storm.meso > 0 || storm.tvs)) {
    scores.supercell += 50;
  }
  if (storm.maxDbz > 55 && storm.vil > 40) {
    scores.supercell += 20;
  }

  // QLCS indicators: linear structure, high wind shear, organized progression
  if (structure?.isLinear) {
    scores.qlcs += 50;
  }
  if (storm.maxDbz > 50 && env.shear > 30 && !storm.tvs) {
    scores.qlcs += 25;
  }

  // Multicell indicators: multiple cores, moderate CAPE, no strong rotation
  if (structure?.coreCount > 2 && env.cape > 1500 && !storm.tvs) {
    scores.multicell += 45;
  }

  // Air-mass indicators: weak CAPE, no shear, isolated
  if (env.cape < 1500 && env.shear < 15) {
    scores.airMass += 50;
  }

  // Normalize and find max
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 100;
  const normalized = Object.fromEntries(
    Object.entries(scores).map(([k, v]) => [k, (v / total) * 100])
  );

  const maxType = Object.entries(normalized).sort((a, b) => b[1] - a[1])[0];
  return {
    type: maxType[0],
    confidence: Math.round(maxType[1]),
    scores: normalized,
  };
}

/**
 * Storm Longevity Predictor
 * Estimates how long (minutes) a storm will persist
 */
export function predictStormLongevity(storm, env, age = 0) {
  if (!storm || !env) return 0;

  let longevityMin = 0;

  // Base lifetime by storm type (CAPE/shear combination)
  const capeShearRatio = (env.cape || 1) / Math.max(env.shear || 1, 1);
  if (capeShearRatio > 100) {
    longevityMin = 60; // Long-lived supercell
  } else if (capeShearRatio > 50) {
    longevityMin = 45; // Moderate-lived
  } else {
    longevityMin = 20; // Short-lived air-mass
  }

  // Adjust based on current intensity
  const vigor = (storm.vil || 0) / 100 + (storm.maxDbz || 0) / 100;
  longevityMin *= (0.8 + vigor * 0.2);

  // Reduce by age (storms naturally decay)
  const ageAdjustment = Math.max(0.5, 1 - age / 90);
  longevityMin *= ageAdjustment;

  // Add environmental wind shear continuity
  if (env.shear > 30) {
    longevityMin *= 1.2; // Shear feeds longevity
  }

  return Math.max(5, Math.round(longevityMin));
}

/**
 * Rapid Intensification Predictor
 * Flags storms likely to intensify rapidly in next 15 min
 */
export function predictRapidIntensification(currentMetrics, priorMetrics) {
  if (!currentMetrics || !priorMetrics) return { risk: 0, reason: 'Insufficient data' };

  const dbzChange = (currentMetrics.dbz || 0) - (priorMetrics.dbz || 0);
  const vilChange = (currentMetrics.vil || 0) - (priorMetrics.vil || 0);
  const topsChange = (currentMetrics.tops || 0) - (priorMetrics.tops || 0);

  let risk = 0;
  let reasons = [];

  // Rapid reflectivity increase
  if (dbzChange > 8) {
    risk += 40;
    reasons.push('Fast reflectivity increase');
  }

  // VIL growth
  if (vilChange > 15) {
    risk += 35;
    reasons.push('Rapid VIL growth');
  }

  // Echo top rise
  if (topsChange > 3) {
    risk += 25;
    reasons.push('Rising echo tops');
  }

  // Rotation development
  if ((currentMetrics.meso || 0) > (priorMetrics.meso || 0)) {
    risk += 20;
    reasons.push('Rotation strengthening');
  }

  return {
    risk: Math.min(100, risk),
    reasons,
    willIntensify: risk > 50,
  };
}

/**
 * Storm Similarity Scorer (for merger prediction)
 * Returns 0-100 similarity between two storms
 */
export function scoreStormSimilarity(storm1, storm2) {
  if (!storm1 || !storm2) return 0;

  let similarity = 0;

  // Size similarity
  const vil1 = storm1.vil || 0;
  const vil2 = storm2.vil || 0;
  const vilDiff = Math.abs(vil1 - vil2) / Math.max(vil1, vil2, 1);
  similarity += (1 - Math.min(vilDiff, 1)) * 25;

  // Intensity similarity
  const dbz1 = storm1.maxDbz || 0;
  const dbz2 = storm2.maxDbz || 0;
  const dbzDiff = Math.abs(dbz1 - dbz2) / 70;
  similarity += (1 - Math.min(dbzDiff, 1)) * 25;

  // Rotation similarity
  const meso1 = storm1.meso || 0;
  const meso2 = storm2.meso || 0;
  const mesoDiff = Math.abs(meso1 - meso2) / 8;
  similarity += (1 - Math.min(mesoDiff, 1)) * 25;

  // Movement similarity
  if (storm1.moveDirDeg != null && storm2.moveDirDeg != null) {
    const dirDiff = Math.abs(storm1.moveDirDeg - storm2.moveDirDeg) / 180;
    const speedDiff = Math.abs((storm1.moveSpeedKts || 0) - (storm2.moveSpeedKts || 0)) / 30;
    similarity += (1 - Math.min((dirDiff + speedDiff) / 2, 1)) * 25;
  }

  return Math.round(Math.max(0, Math.min(100, similarity)));
}

/**
 * Get ML confidence level for predictions
 */
export function getMLConfidence(dataPoints) {
  if (!dataPoints || dataPoints < 2) return 'Very Low';
  if (dataPoints < 5) return 'Low';
  if (dataPoints < 10) return 'Moderate';
  if (dataPoints < 20) return 'High';
  return 'Very High';
}
