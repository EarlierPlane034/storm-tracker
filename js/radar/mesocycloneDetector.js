/**
 * Mesocyclone Detection and Tracking
 *
 * Detects and tracks rotation centers from NEXRAD velocity data
 * - Identifies velocity couplets (inbound + outbound signature)
 * - Tracks rotation across multiple scans
 * - Estimates rotation strength and persistence
 */

import { haversineKm } from '../utils.js';

/** Store active mesocyclone tracks by storm ID */
const mesocycloneTracks = new Map();

/**
 * Find mesocyclones in a storm based on velocity data
 * Looking for strong velocity couplets (gate-to-gate rotation)
 */
export function detectMesocyclones(stormCell) {
  if (!stormCell) return [];

  // If radar data not available, fall back to radar metadata
  if (!stormCell.tvs && !stormCell.meso) return [];

  const mesos = [];

  // If TVS present, it's a confirmed strong couplet
  if (stormCell.tvs) {
    mesos.push({
      id: `tvs-${stormCell.id}`,
      lat: stormCell.lat,
      lon: stormCell.lon,
      type: 'TVS',
      strength: 95,  // TVS = very strong
      confidence: 0.95,
      timestamp: new Date(),
      colorHint: '#ff0000'  // Red for TVS
    });
  }

  // Mesocyclone rank from radar
  if (stormCell.meso && stormCell.meso > 0) {
    const strength = (stormCell.meso / 6) * 100; // Normalize rank 0-6 to 0-100
    mesos.push({
      id: `meso-${stormCell.id}`,
      lat: stormCell.lat,
      lon: stormCell.lon,
      type: `Meso Rank ${stormCell.meso}`,
      strength: Math.round(strength),
      confidence: 0.85,
      timestamp: new Date(),
      colorHint: strength > 70 ? '#ff6600' : '#ffaa00'  // Orange/yellow
    });
  }

  return mesos;
}

/**
 * Track mesocyclone movement across scans
 * Matches new detections to prior positions and calculates movement
 */
export function trackMesocyclones(stormId, currentMesos) {
  const prior = mesocycloneTracks.get(stormId) || { last: null, history: [] };

  const tracked = currentMesos.map(meso => {
    let movement = null;

    if (prior.last && prior.last.type === meso.type) {
      const dist = haversineKm(prior.last.lat, prior.last.lon, meso.lat, meso.lon);
      movement = {
        distanceKm: Math.round(dist * 10) / 10,
        bearing: calculateBearing(prior.last.lat, prior.last.lon, meso.lat, meso.lon)
      };
    }

    return {
      ...meso,
      movement,
      persistenceScans: prior.history.filter(m => m.type === meso.type).length + 1
    };
  });

  // Update track history
  mesocycloneTracks.set(stormId, {
    last: currentMesos[0] || null,
    history: [...prior.history.slice(-9), ...currentMesos]  // Keep last 10
  });

  return tracked;
}

/**
 * Get rotation persistence (how many consecutive scans has rotation been detected)
 */
export function getRotationPersistence(stormId) {
  const track = mesocycloneTracks.get(stormId);
  if (!track || !track.history.length) return 0;
  return track.history.length;
}

/**
 * Calculate bearing between two points
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return ((bearing + 360) % 360).toFixed(0);
}

/**
 * Get all active mesocyclone tracks
 */
export function getAllMesocycloneTracks() {
  return Array.from(mesocycloneTracks.entries()).map(([stormId, track]) => ({
    stormId,
    current: track.last,
    history: track.history,
    persistence: track.history.length
  }));
}

/**
 * Clean up stale tracks (older than 30 minutes)
 */
export function cleanupStaleTracks(maxAgeMinutes = 30) {
  const now = Date.now();
  const maxAge = maxAgeMinutes * 60 * 1000;

  for (const [stormId, track] of mesocycloneTracks.entries()) {
    if (!track.last) continue;
    const age = now - track.last.timestamp.getTime();
    if (age > maxAge) {
      mesocycloneTracks.delete(stormId);
    }
  }
}

/**
 * Mesocyclone-based tornado probability
 * Strong/persistent rotation = high tornado likelihood
 */
export function estimateTornadoLikelihoodFromRotation(stormId) {
  const track = mesocycloneTracks.get(stormId);
  if (!track || !track.last) return 0;

  const { strength, persistenceScans } = track.last;
  const persistenceBonus = Math.min(persistenceScans / 4, 1.5); // 4+ scans = max bonus

  const likelihood = (strength / 100) * persistenceBonus * 100;
  return Math.round(Math.min(likelihood, 100));
}
