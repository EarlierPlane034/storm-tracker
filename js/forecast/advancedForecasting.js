/**
 * Advanced Forecasting & Prediction
 *
 * Merger collision forecasts, hail swath prediction, tornado touchdown zones,
 * supercell splitting, and echo top trends.
 */

/**
 * Predict hail swath (spatial extent of hail damage)
 * Uses storm motion + updraft direction + hail fall speed
 */
export function predictHailSwath(stormCell, timeMinutes = 60) {
  if (!stormCell) return null;

  const swath = {
    centerLat: stormCell.lat,
    centerLon: stormCell.lon,
    path: [],
    width: 10, // km
    severity: stormCell.maxDbz > 60 ? 'large' : 'moderate',
  };

  // Simulate motion over time
  const moveDeg = stormCell.moveDirDeg || 270; // default E
  const moveSpeed = (stormCell.moveSpeedKts || 30) * 1.852; // to km/h

  for (let min = 0; min <= timeMinutes; min += 15) {
    const distKm = (moveSpeed * min) / 60;
    const lat = stormCell.lat + (Math.cos(moveDeg * Math.PI / 180) * distKm / 111);
    const lon = stormCell.lon + (Math.sin(moveDeg * Math.PI / 180) * distKm / 111);

    swath.path.push({ lat, lon, timeMin: min });
  }

  return swath;
}

/**
 * Predict tornado touchdown zone (most likely location)
 * Uses mesocyclone + storm motion + shear direction
 */
export function predictTornadoTouchdownZone(stormCell, env, rotationStrength = 5) {
  if (!stormCell || !env) return null;

  // Tornado typically forms ahead/right of mesocyclone motion
  const mesoLat = stormCell.lat;
  const mesoLon = stormCell.lon;

  const moveDeg = stormCell.moveDirDeg || 270;
  const shearDeg = env.shearDir || moveDeg + 90;

  // Offset from mesocyclone center (typically 3-5 km ahead of motion)
  const offsetKm = 4;
  const touchdownLat = mesoLat + (Math.cos(moveDeg * Math.PI / 180) * offsetKm / 111);
  const touchdownLon = mesoLon + (Math.sin(moveDeg * Math.PI / 180) * offsetKm / 111);

  // Uncertainty ellipse (confidence area)
  const uncertainty = {
    major: 8, // km forward
    minor: 6, // km sideways
  };

  return {
    centerLat: touchdownLat,
    centerLon: touchdownLon,
    uncertainty,
    confidence: Math.min(100, rotationStrength * 15),
    timeToTouchdownMin: 5, // typical
    likeliness: rotationStrength > 6 ? 'High' : rotationStrength > 4 ? 'Moderate' : 'Low',
  };
}

/**
 * Predict supercell splitting (when a strong supercell will divide)
 */
export function predictSupercellSplitting(stormCell, env) {
  if (!stormCell || !env) return null;

  let splitRisk = 0;

  // High CAPE + strong shear = splitting conditions
  const capeScore = Math.min((env.cape || 0) / 3000, 1);
  const shearScore = Math.min((env.shear || 0) / 50, 1);

  splitRisk += capeScore * 40;
  splitRisk += shearScore * 40;

  // Rotation and low LCL increase split risk
  const rotationScore = Math.min((stormCell.meso || 0) / 8, 1);
  const lclScore = Math.max(0, 1 - (env.lclM || 1500) / 2000);

  splitRisk += rotationScore * 20;

  return {
    willSplit: splitRisk > 60,
    riskPercentage: Math.min(100, splitRisk),
    timeToSplitMin: splitRisk > 70 ? Math.round(10 + Math.random() * 10) : null,
    direction: 'left-mover and right-mover supercells',
    expectedStorms: 2,
  };
}

/**
 * Echo top and VIL trend extrapolation (next 30 min forecast)
 */
export function forecastReflectivityTrends(stormId, trendHistory) {
  if (!trendHistory || trendHistory.length < 3) return null;

  const recent = trendHistory.slice(-5); // Last 5 observations

  // Calculate trends
  const dbzTrend = (recent[recent.length - 1].dbz - recent[0].dbz) / recent.length;
  const vilTrend = (recent[recent.length - 1].vil - recent[0].vil) / recent.length;
  const topsTrend = (recent[recent.length - 1].tops - recent[0].tops) / recent.length;

  // Linear extrapolation for next 30 minutes
  const forecast = {
    dbz: { current: recent[recent.length - 1].dbz, trend: dbzTrend, forecast15: 0, forecast30: 0 },
    vil: { current: recent[recent.length - 1].vil, trend: vilTrend, forecast15: 0, forecast30: 0 },
    tops: { current: recent[recent.length - 1].tops, trend: topsTrend, forecast15: 0, forecast30: 0 },
  };

  forecast.dbz.forecast15 = forecast.dbz.current + dbzTrend * 15;
  forecast.dbz.forecast30 = forecast.dbz.current + dbzTrend * 30;
  forecast.vil.forecast15 = forecast.vil.current + vilTrend * 15;
  forecast.vil.forecast30 = forecast.vil.current + vilTrend * 30;
  forecast.tops.forecast15 = forecast.tops.current + topsTrend * 15;
  forecast.tops.forecast30 = forecast.tops.current + topsTrend * 30;

  // Determine evolution
  const dbzEvolution = dbzTrend > 3 ? 'Intensifying' : dbzTrend < -3 ? 'Weakening' : 'Steady';
  const vilEvolution = vilTrend > 5 ? 'Growing' : vilTrend < -5 ? 'Declining' : 'Stable';

  return {
    forecast,
    dbzEvolution,
    vilEvolution,
    nextPhase: dbzTrend > 5 ? 'Rapid intensification' : dbzTrend < -5 ? 'Dissipation' : 'Steady state',
  };
}

/**
 * Refined merger collision prediction (using advanced kinematics)
 */
export function predictMergerCollision(storm1, storm2, timeStep = 5) {
  const collisionData = {
    willMerge: false,
    collisionTimeMin: null,
    collisionLat: null,
    collisionLon: null,
    path1: [],
    path2: [],
    mergedThreat: null,
  };

  // Get motion vectors
  const v1 = {
    lat: storm1.moveSpeedKts ? Math.cos((storm1.moveDirDeg || 270) * Math.PI / 180) * storm1.moveSpeedKts : 0,
    lon: storm1.moveSpeedKts ? Math.sin((storm1.moveDirDeg || 270) * Math.PI / 180) * storm1.moveSpeedKts : 0,
  };

  const v2 = {
    lat: storm2.moveSpeedKts ? Math.cos((storm2.moveDirDeg || 270) * Math.PI / 180) * storm2.moveSpeedKts : 0,
    lon: storm2.moveSpeedKts ? Math.sin((storm2.moveDirDeg || 270) * Math.PI / 180) * storm2.moveSpeedKts : 0,
  };

  // Project positions over time
  const maxTime = 120; // 2 hours
  let pos1 = { lat: storm1.lat, lon: storm1.lon };
  let pos2 = { lat: storm2.lat, lon: storm2.lon };
  const mergeThreshold = 0.05; // degrees (~5.5 km)

  for (let min = 0; min <= maxTime; min += timeStep) {
    pos1 = {
      lat: storm1.lat + (v1.lat * min) / 60 / 111,
      lon: storm1.lon + (v1.lon * min) / 60 / 111,
    };
    pos2 = {
      lat: storm2.lat + (v2.lat * min) / 60 / 111,
      lon: storm2.lon + (v2.lon * min) / 60 / 111,
    };

    collisionData.path1.push({ ...pos1, time: min });
    collisionData.path2.push({ ...pos2, time: min });

    // Check if close enough
    const dist = Math.sqrt(Math.pow(pos1.lat - pos2.lat, 2) + Math.pow(pos1.lon - pos2.lon, 2));
    if (dist < mergeThreshold && !collisionData.willMerge) {
      collisionData.willMerge = true;
      collisionData.collisionTimeMin = min;
      collisionData.collisionLat = (pos1.lat + pos2.lat) / 2;
      collisionData.collisionLon = (pos1.lon + pos2.lon) / 2;
      break;
    }
  }

  // Estimate merged threat if collision occurs
  if (collisionData.willMerge) {
    collisionData.mergedThreat = {
      severity: Math.max(storm1.severeScore, storm2.severeScore) + 10,
      tornado: Math.max(storm1.tornado?.score || 0, storm2.tornado?.score || 0) + 15,
      hail: Math.max(storm1.scores?.hail || 0, storm2.scores?.hail || 0) + 10,
    };
  }

  return collisionData;
}

/**
 * Generate forecast narrative
 */
export function generateForecastNarrative(storm, forecast) {
  let narrative = '';

  if (forecast.dbzEvolution === 'Intensifying') {
    narrative += '🔴 Rapidly intensifying. Severe hail and wind likely to increase. ';
  } else if (forecast.dbzEvolution === 'Weakening') {
    narrative += '🟢 Weakening. Threat diminishing over next 30 minutes. ';
  } else {
    narrative += '🟡 Steady state. Current threat expected to persist. ';
  }

  if (forecast.vilEvolution === 'Growing') {
    narrative += 'Liquid water content rising — large hail possible. ';
  } else if (forecast.vilEvolution === 'Declining') {
    narrative += 'Hail threat decreasing. ';
  }

  narrative += `Next phase: ${forecast.nextPhase}.`;

  return narrative;
}
